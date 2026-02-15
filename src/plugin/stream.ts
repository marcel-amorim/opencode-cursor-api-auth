import type { CursorStreamEvent } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractAssistantText(message: unknown): string | null {
  if (!isRecord(message)) {
    return null;
  }
  if (message.role !== "assistant") {
    return null;
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return null;
  }

  const text = message.content
    .map((part) => {
      if (!isRecord(part)) {
        return "";
      }
      if (part.type === "text" && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");

  return text.length > 0 ? text : null;
}

export function parseCursorStreamLine(line: string): CursorStreamEvent | null {
  if (!line || typeof line !== "string") {
    return null;
  }

  try {
    const data = JSON.parse(line) as unknown;
    if (!isRecord(data)) {
      return null;
    }

    if (data.type === "thinking") {
      if (data.subtype === "delta" && typeof data.text === "string") {
        return { type: "thinking", text: data.text };
      }
      return null;
    }

    if (data.type === "assistant") {
      const assistantText = extractAssistantText(data.message);
      if (assistantText) {
        return { type: "content", text: assistantText };
      }
      return null;
    }

    if (data.type === "result") {
      if (typeof data.result === "string") {
        return { type: "result", text: data.result };
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export function parseCursorStreamFallbackLine(line: string): CursorStreamEvent | null {
  if (!line || typeof line !== "string") {
    return null;
  }

  try {
    const data = JSON.parse(line) as unknown;
    if (!isRecord(data)) {
      return null;
    }

    if (data.type === "thinking" && typeof data.text === "string" && data.text.length > 0) {
      return { type: "thinking", text: data.text };
    }

    if (data.type === "assistant") {
      const assistantText = extractAssistantText(data.message ?? data);
      if (assistantText) {
        return { type: "content", text: assistantText };
      }
      if (typeof data.text === "string" && data.text.length > 0) {
        return { type: "content", text: data.text };
      }
      return null;
    }

    if (data.type === "result" && typeof data.result === "string") {
      return { type: "result", text: data.result };
    }

    if (typeof data.action === "string" && (data.action === "final" || data.action === "tool_call")) {
      return { type: "result", text: line };
    }

    return null;
  } catch {
    const rawText = line.trim();
    if (!rawText) {
      return null;
    }
    if (/^\{\s*["']?action["']?\s*:\s*["']?(?:final|tool_call)["']?/i.test(rawText)) {
      return { type: "result", text: rawText };
    }
    return { type: "content", text: line };
  }
}

export function mergeAssistantContent(current: string, incoming: string): { next: string; emit: string } {
  if (!incoming) {
    return { next: current, emit: "" };
  }

  if (!current) {
    return { next: incoming, emit: incoming };
  }

  if (incoming === current) {
    return { next: current, emit: "" };
  }

  if (incoming.startsWith(current)) {
    return { next: incoming, emit: incoming.slice(current.length) };
  }

  if (current.endsWith(incoming)) {
    return { next: current, emit: "" };
  }

  if (current.includes(incoming)) {
    return { next: current, emit: "" };
  }

  return { next: current + incoming, emit: incoming };
}

export function sanitizeThinkingText(
  text: string,
  inFence: boolean,
  inPlanJson: boolean,
): { text: string; inFence: boolean; inPlanJson: boolean } {
  if (!text) {
    return { text: "", inFence, inPlanJson };
  }

  let nextFence = inFence;
  let nextPlanJson = inPlanJson;
  let output = text;

  if (nextFence) {
    const closeIndex = output.indexOf("```");
    if (closeIndex === -1) {
      return { text: "", inFence: true, inPlanJson: nextPlanJson };
    }
    output = output.slice(closeIndex + 3);
    nextFence = false;
  }

  if (nextPlanJson) {
    const closeIndex = output.indexOf("}");
    if (closeIndex === -1) {
      return { text: "", inFence: nextFence, inPlanJson: true };
    }
    output = output.slice(closeIndex + 1);
    nextPlanJson = false;
  }

  while (true) {
    const openIndex = output.indexOf("```");
    if (openIndex === -1) {
      break;
    }

    const closeIndex = output.indexOf("```", openIndex + 3);
    if (closeIndex === -1) {
      output = output.slice(0, openIndex);
      nextFence = true;
      break;
    }

    output = output.slice(0, openIndex) + output.slice(closeIndex + 3);
  }

  while (true) {
    const marker = output.match(/\{\s*["']?action["']?\s*:/i);
    if (!marker || marker.index === undefined) {
      break;
    }

    const startIndex = marker.index;
    let depth = 0;
    let endIndex = -1;

    for (let index = startIndex; index < output.length; index += 1) {
      const char = output[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          endIndex = index;
          break;
        }
      }
    }

    if (endIndex === -1) {
      output = output.slice(0, startIndex);
      nextPlanJson = true;
      break;
    }

    output = output.slice(0, startIndex) + output.slice(endIndex + 1);
  }

  return { text: output, inFence: nextFence, inPlanJson: nextPlanJson };
}
