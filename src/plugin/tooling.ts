import type { ExtractedChatCompletionInput, ToolCallPlan, ToolDef } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSerializableRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function summarizeTool(tool: ToolDef): string {
  const name = tool.function?.name ?? "unknown";
  const description = tool.function?.description ?? "";
  const params = tool.function?.parameters;

  let paramsSummary = "";
  if (isRecord(params)) {
    const properties = isRecord(params.properties) ? Object.keys(params.properties) : [];
    const required = Array.isArray(params.required) ? params.required.filter((item): item is string => typeof item === "string") : [];
    paramsSummary = `args: { ${properties.join(", ")} } required: [${required.join(", ")}]`;
  }

  return `- ${name}${description ? `: ${description}` : ""}${paramsSummary ? ` (${paramsSummary})` : ""}`;
}

export function normalizeCursorAgentModel(model: string | undefined, aliases: Record<string, string>): string {
  if (!model) {
    return "auto";
  }
  return aliases[model] ?? model;
}

export function extractPromptFromChatCompletions(body: unknown): ExtractedChatCompletionInput {
  const parsedBody = isRecord(body) ? body : {};
  const model = typeof parsedBody.model === "string" ? parsedBody.model : undefined;
  const stream = parsedBody.stream === true;
  const tools = Array.isArray(parsedBody.tools) ? (parsedBody.tools as ToolDef[]) : [];
  const messages = Array.isArray(parsedBody.messages) ? parsedBody.messages : [];

  const lines: string[] = [];
  for (const rawMessage of messages) {
    const message = isRecord(rawMessage) ? rawMessage : {};
    const role = typeof message.role === "string" ? message.role : "user";

    if (role === "tool") {
      const name = typeof message.name === "string" ? message.name : "tool";
      const toolCallId = typeof message.tool_call_id === "string" ? message.tool_call_id : "";
      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify((message.content ?? "") as unknown);
      lines.push(`TOOL RESULT (${name}${toolCallId ? `, id=${toolCallId}` : ""}): ${content}`);
      continue;
    }

    if (role === "assistant" && Array.isArray(message.tool_calls)) {
      lines.push(`ASSISTANT TOOL_CALLS: ${JSON.stringify(message.tool_calls)}`);
      continue;
    }

    if (typeof message.content === "string") {
      lines.push(`${role.toUpperCase()}: ${message.content}`);
      continue;
    }

    if (Array.isArray(message.content)) {
      const textParts = message.content
        .map((part) => {
          if (!isRecord(part)) {
            return "";
          }
          if (part.type === "text" && typeof part.text === "string") {
            return part.text;
          }
          return "";
        })
        .filter((item) => item.length > 0);

      if (textParts.length > 0) {
        lines.push(`${role.toUpperCase()}: ${textParts.join("\n")}`);
      }
    }
  }

  return {
    prompt: lines.join("\n\n"),
    model,
    stream,
    tools,
  };
}

export function parseToolCallPlan(output: string): ToolCallPlan | null {
  const parseCandidate = (candidate: string): ToolCallPlan | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed) && parsed.action === "final" && typeof parsed.content === "string") {
        return { action: "final", content: parsed.content };
      }
      if (isRecord(parsed) && parsed.action === "tool_call" && Array.isArray(parsed.tool_calls)) {
        const toolCalls = parsed.tool_calls
          .filter(
            (item): item is Record<string, unknown> =>
              isRecord(item) &&
              typeof item.name === "string" &&
              item.name.trim().length > 0 &&
              isSerializableRecord(item.arguments),
          )
          .map((item) => ({
            name: (item.name as string).trim(),
            arguments: item.arguments as Record<string, unknown>,
          }));

        if (toolCalls.length === 0) {
          return null;
        }

        return { action: "tool_call", tool_calls: toolCalls };
      }
    } catch {
      const looseFinal = candidate.match(
        /^\s*\{\s*["']?action["']?\s*:\s*["']?final["']?\s*,\s*["']?content["']?\s*:\s*([\s\S]*?)\s*\}\s*$/i,
      );

      if (looseFinal) {
        let content = looseFinal[1].trim();
        const quoted = content.match(/^("|')([\s\S]*)\1$/);
        if (quoted) {
          content = quoted[2];
        }
        return { action: "final", content };
      }
    }

    return null;
  };

  const candidates: string[] = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index < output.length; index += 1) {
    const current = output[index];
    if (current === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (current === "}") {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(output.slice(start, index + 1));
        start = -1;
      }
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = parseCandidate(candidates[index]);
    if (parsed) {
      return parsed;
    }
  }

  return parseCandidate(output.trim());
}

export function buildToolCallingPrompt(conversation: string, tools: ToolDef[], workspaceDirectory: string): string {
  const toolList = tools.length > 0 ? tools.map(summarizeTool).join("\n") : "(none)";

  return [
    "You are a tool-calling assistant running inside OpenCode.",
    `Workspace directory: ${workspaceDirectory}`,
    "",
    "Available tools:",
    toolList,
    "",
    "STRICT OUTPUT:",
    "- Output MUST be exactly one JSON object and nothing else.",
    "- If you output anything outside JSON, your answer is discarded.",
    "",
    "RESPONSE FORMAT:",
    "- Call tool(s):",
    '{"action":"tool_call","tool_calls":[{"name":"list","arguments":{"path":"/ABSOLUTE/PATH"}}]}',
    "- Final answer:",
    '{"action":"final","content":"..."}',
    "",
    "Task:",
    conversation,
  ].join("\n");
}
