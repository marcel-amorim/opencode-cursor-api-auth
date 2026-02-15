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
  let serverUrl: string;

  beforeAll(async () => {
    // Default mock implementation
    spyOn(Bun, "spawn").mockImplementation((options: any) => {
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
            } else {
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
          kill: () => {},
          unref: () => {},
        } as any;
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
      const { done, value } = await reader?.read()!;
      if (done) break;
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
      const { done, value } = await reader?.read()!;
      if (done) break;
      result += decoder.decode(value);
    }

    expect(result).toContain('"delta":{"content":"Deciding to use tool..."}');
    expect(result).toContain('"tool_calls":[{"index":0,"id":');
    expect(result).toContain('"name":"test_tool"');
    expect(result).toContain('[DONE]');
  });
});
