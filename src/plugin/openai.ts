export function openAIError(
  status: number,
  message: string,
  details?: string,
  type = "cursor_agent_error",
  code: string | null = null,
  param: string | null = null,
): Response {
  const body = {
    error: {
      message: details ? `${message}\n${details}` : message,
      type,
      param,
      code,
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createChatCompletionResponse(model: string, content: string) {
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

export function createToolCallsCompletionResponse(model: string, toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>) {
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

export function createChatCompletionChunk(id: string, created: number, model: string, deltaContent: string, done = false) {
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
