// @ts-ignore
import { expect, test, describe, beforeAll, spyOn } from "bun:test";
import { ensureCursorProxyServer } from "../plugin.js";
const TEST_PORT = 32123;
describe("Cursor Proxy Integration", () => {
    let serverUrl;
    beforeAll(async () => {
        // Default mock implementation
        spyOn(Bun, "spawn").mockImplementation((options) => {
            const { cmd } = options;
            // The prompt is the last argument
            const prompt = cmd[cmd.length - 1];
            // We use the prompt text to decide behavior
            const isToolCallRequest = typeof prompt === "string" && prompt.includes("USER: Call tool");
            const stream = new ReadableStream({
                start(controller) {
                    if (isToolCallRequest) {
                        // Tool call scenario
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: "Deciding to use tool..."
                        }) + "\n"));
                        const toolCallJson = JSON.stringify({
                            action: "tool_call",
                            tool_calls: [{ name: "test_tool", arguments: { foo: "bar" } }]
                        });
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "result",
                            subtype: "success",
                            result: toolCallJson
                        }) + "\n"));
                    }
                    else {
                        // Standard chat scenario
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: "Thinking process..."
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "assistant",
                            message: {
                                role: "assistant",
                                content: [{ type: "text", text: "Hello from mock!" }]
                            }
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "result",
                            subtype: "success",
                            result: "Final result text"
                        }) + "\n"));
                    }
                    controller.close();
                }
            });
            return {
                stdout: stream,
                stderr: new Response("").body,
                exitCode: 0,
                kill: () => { },
                unref: () => { },
            };
        });
        serverUrl = await ensureCursorProxyServer("/tmp");
    });
    test("streams thinking and content correctly", async () => {
        const response = await fetch(`${serverUrl}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: "Hello" }],
                stream: true,
                tools: [{ type: "function", function: { name: "test_tool" } }]
            }),
        });
        expect(response.status).toBe(200);
        const contentType = response.headers.get("content-type");
        expect(contentType).toContain("text/event-stream");
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result = "";
        while (true) {
            const { done, value } = await reader?.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Thinking process..."}');
        expect(result).toContain('"delta":{"content":"Hello from mock!"}');
        expect(result).toContain("[DONE]");
    });
    test("handles tool calls correctly", async () => {
        const response = await fetch(`${serverUrl}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: "Call tool" }],
                stream: true,
                tools: [{ type: "function", function: { name: "test_tool" } }]
            }),
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result = "";
        while (true) {
            const { done, value } = await reader?.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Deciding to use tool..."}');
        expect(result).toContain('"tool_calls":[{"index":0,"id":');
        expect(result).toContain('"name":"test_tool"');
        expect(result).toContain('[DONE]');
    });
});
//# sourceMappingURL=integration.test.js.map