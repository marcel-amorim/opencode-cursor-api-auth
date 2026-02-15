export function openAIError(status, message, details) {
    const body = {
        error: {
            message: details ? `${message}\n${details}` : message,
            type: "cursor_agent_error",
            param: null,
            code: null,
        },
    };
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
export function createChatCompletionResponse(model, content) {
    return {
        id: `cursor-agent-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: { role: "assistant", content },
                finish_reason: "stop",
            },
        ],
    };
}
export function createToolCallsCompletionResponse(model, toolCalls) {
    const mappedToolCalls = toolCalls.map((toolCall, index) => ({
        id: `call_${Date.now()}_${index}`,
        type: "function",
        function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments ?? {}),
        },
    }));
    return {
        id: `cursor-agent-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "",
                    tool_calls: mappedToolCalls,
                },
                finish_reason: "tool_calls",
            },
        ],
    };
}
export function createChatCompletionChunk(id, created, model, deltaContent, done = false) {
    return {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
            {
                index: 0,
                delta: deltaContent ? { content: deltaContent } : {},
                finish_reason: done ? "stop" : null,
            },
        ],
    };
}
//# sourceMappingURL=openai.js.map