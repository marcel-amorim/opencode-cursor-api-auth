// @ts-nocheck
// @ts-ignore
import { expect, test, describe, beforeAll, spyOn } from "bun:test";
import { parseCursorStreamLine, ensureCursorProxyServer } from "../plugin.js";
describe("parseCursorStreamLine", () => {
    test("parses thinking delta events", () => {
        const line = '{"type":"thinking","subtype":"delta","text":"thinking..."}';
        const result = parseCursorStreamLine(line);
        expect(result).toEqual({ type: "thinking", text: "thinking..." });
    });
    test("parses assistant message events", () => {
        const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]}}';
        const result = parseCursorStreamLine(line);
        expect(result).toEqual({ type: "content", text: "Hello world" });
    });
    test("parses assistant message events with multiple text parts", () => {
        const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"},{"type":"text","text":" world"}]}}';
        const result = parseCursorStreamLine(line);
        expect(result).toEqual({ type: "content", text: "Hello world" });
    });
    test("parses final result events", () => {
        const line = '{"type":"result","subtype":"success","result":"Final output"}';
        const result = parseCursorStreamLine(line);
        expect(result).toEqual({ type: "result", text: "Final output" });
    });
    test("returns null for thinking completed events", () => {
        const line = '{"type":"thinking","subtype":"completed"}';
        const result = parseCursorStreamLine(line);
        expect(result).toBeNull();
    });
    test("returns null for unknown types", () => {
        const line = '{"type":"system","text":"ignored"}';
        const result = parseCursorStreamLine(line);
        expect(result).toBeNull();
    });
    test("returns null for malformed JSON", () => {
        const line = '{"type":"thinking", incomplete...';
        const result = parseCursorStreamLine(line);
        expect(result).toBeNull();
    });
    test("returns null for empty strings", () => {
        expect(parseCursorStreamLine("")).toBeNull();
    });
    test("returns null for non-JSON strings", () => {
        expect(parseCursorStreamLine("Just some random text")).toBeNull();
    });
    test("handles assistant message with missing content gracefully", () => {
        const line = '{"type":"assistant","message":{"role":"assistant","content":[]}}';
        expect(parseCursorStreamLine(line)).toBeNull();
    });
    test("handles assistant message with non-text content", () => {
        const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"image"}]}}';
        expect(parseCursorStreamLine(line)).toBeNull();
    });
});
describe("Cursor Proxy Integration", () => {
    let serverUrl;
    beforeAll(async () => {
        const nativeFetch = globalThis.fetch.bind(globalThis);
        spyOn(globalThis, "fetch").mockImplementation((input, init) => {
            const url = typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input?.url || "";
            if (typeof url === "string" && url.endsWith("/health")) {
                return Promise.reject(new Error("skip shared health endpoint"));
            }
            return nativeFetch(input, init);
        });
        globalThis.__opencode_cursor_proxy_server__ = undefined;
        // Default mock implementation
        spyOn(Bun, "spawn").mockImplementation((options) => {
            const { cmd } = options;
            // The prompt is the last argument
            const prompt = cmd[cmd.length - 1];
            // We use the prompt text to decide behavior
            const isToolCallRequest = typeof prompt === "string" && prompt.includes("USER: Call tool");
            const isFallbackStreamRequest = typeof prompt === "string" && prompt.includes("USER: Fallback stream");
            const isSnapshotDedupeRequest = typeof prompt === "string" && prompt.includes("USER: Snapshot dedupe");
            const isThinkingFenceRequest = typeof prompt === "string" && prompt.includes("USER: Thinking fence");
            const isThinkingSplitJsonRequest = typeof prompt === "string" && prompt.includes("USER: Thinking split json");
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
                    else if (isFallbackStreamRequest) {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            text: "Fallback thinking..."
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode('{action:final,content:Fallback final output}\n'));
                    }
                    else if (isSnapshotDedupeRequest) {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: "Dedupe thinking..."
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "assistant",
                            message: {
                                role: "assistant",
                                content: [{ type: "text", text: "Recursion is" }]
                            }
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "assistant",
                            message: {
                                role: "assistant",
                                content: [{ type: "text", text: "Recursion is concise." }]
                            }
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "result",
                            subtype: "success",
                            result: '{"action":"final","content":"Recursion is concise."}'
                        }) + "\n"));
                    }
                    else if (isThinkingFenceRequest) {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: "```json\n{\"action\":\"final\",\"content\":\"leak\"}\n```"
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: "Providing concise recursion explanation"
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "result",
                            subtype: "success",
                            result: '{"action":"final","content":"Recursion final sentence."}'
                        }) + "\n"));
                    }
                    else if (isThinkingSplitJsonRequest) {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: '{"action":"final","content":"Recursion is'
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: ' a process."}'
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "thinking",
                            subtype: "delta",
                            text: "Providing concise recursion explanation"
                        }) + "\n"));
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            type: "result",
                            subtype: "success",
                            result: '{"action":"final","content":"Split final sentence."}'
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
    test("streams thinking and resolves final content once", async () => {
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
        expect(reader).toBeDefined();
        if (!reader)
            throw new Error("Missing response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Thinking: Thinking process..."}');
        expect(result).toContain('"delta":{"content":"\\n\\nFinal result text"}');
        expect(result).not.toContain('"delta":{"content":"Hello from mock!"}');
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
        expect(reader).toBeDefined();
        if (!reader)
            throw new Error("Missing response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Thinking: Deciding to use tool..."}');
        expect(result).toContain('"tool_calls":[{"index":0,"id":');
        expect(result).toContain('"name":"test_tool"');
        expect(result).toContain('[DONE]');
    });
    test("handles fallback stream formats", async () => {
        const response = await fetch(`${serverUrl}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: "Fallback stream" }],
                stream: true,
                tools: [{ type: "function", function: { name: "test_tool" } }]
            }),
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result = "";
        expect(reader).toBeDefined();
        if (!reader)
            throw new Error("Missing response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Thinking: Fallback thinking..."}');
        expect(result).toContain('"delta":{"content":"\\n\\nFallback final output"}');
        expect(result).toContain('[DONE]');
    });
    test("does not leak plan snapshots to output", async () => {
        const response = await fetch(`${serverUrl}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: "Snapshot dedupe" }],
                stream: true,
                tools: [{ type: "function", function: { name: "test_tool" } }]
            }),
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result = "";
        expect(reader).toBeDefined();
        if (!reader)
            throw new Error("Missing response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"\\n\\nRecursion is concise."}');
        expect(result).not.toContain('"delta":{"content":"{\\"action\\":\\"final\\"');
        expect(result).toContain('[DONE]');
    });
    test("strips fenced plan JSON from thinking output", async () => {
        const response = await fetch(`${serverUrl}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: "Thinking fence" }],
                stream: true,
                tools: [{ type: "function", function: { name: "test_tool" } }]
            }),
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result = "";
        expect(reader).toBeDefined();
        if (!reader)
            throw new Error("Missing response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Thinking: Providing concise recursion explanation"}');
        expect(result).not.toContain('```json');
        expect(result).not.toContain('"action":"final"');
        expect(result).toContain('"delta":{"content":"\\n\\nRecursion final sentence."}');
        expect(result).toContain('[DONE]');
    });
    test("strips split plan JSON from thinking output", async () => {
        const response = await fetch(`${serverUrl}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: "Thinking split json" }],
                stream: true,
                tools: [{ type: "function", function: { name: "test_tool" } }]
            }),
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result = "";
        expect(reader).toBeDefined();
        if (!reader)
            throw new Error("Missing response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            result += decoder.decode(value);
        }
        expect(result).toContain('"delta":{"content":"Thinking: Providing concise recursion explanation"}');
        expect(result).not.toContain('"delta":{"content":"Thinking: {"');
        expect(result).not.toContain('"action":"final"');
        expect(result).toContain('"delta":{"content":"\\n\\nSplit final sentence."}');
        expect(result).toContain('[DONE]');
    });
});
//# sourceMappingURL=plugin.streaming.test.js.map