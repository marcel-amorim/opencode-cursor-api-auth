import type { CursorPluginConfig } from "../config/schema.js";
import { getCursorPluginConfig } from "../config/loader.js";
import { createLogger } from "../utils/logger.js";
import { CursorProxyError } from "./errors.js";
import { createChatCompletionChunk, createChatCompletionResponse, createToolCallsCompletionResponse, openAIError } from "./openai.js";
import { mergeAssistantContent, parseCursorStreamFallbackLine, parseCursorStreamLine, sanitizeThinkingText } from "./stream.js";
import { buildToolCallingPrompt, extractPromptFromChatCompletions, normalizeCursorAgentModel, parseToolCallPlan } from "./tooling.js";
import type { ToolDef } from "./types.js";

const log = createLogger("proxy");
const GLOBAL_PROXY_KEY = "__opencode_cursor_proxy_server__";

interface ProxyState {
  baseURL: string;
}

interface BunSpawnProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array> | null;
  exitCode: number | null;
  kill?: (signal?: string | number) => void;
}

interface BunServer {
  port: number;
}

interface BunRuntime {
  env: Record<string, string | undefined>;
  spawn(options: {
    cmd: string[];
    stdout: "pipe";
    stderr: "pipe";
    env: Record<string, string | undefined>;
  }): BunSpawnProcess;
  serve(options: {
    hostname: string;
    port: number;
    fetch: (req: Request) => Promise<Response>;
  }): BunServer;
}

function getGlobalProxyState(): Record<string, ProxyState | undefined> {
  return globalThis as unknown as Record<string, ProxyState | undefined>;
}

function getBunRuntime(): BunRuntime | null {
  const maybeBun = (globalThis as unknown as { Bun?: unknown }).Bun;
  if (!maybeBun || typeof maybeBun !== "object") {
    return null;
  }

  const bunValue = maybeBun as Partial<BunRuntime>;
  if (typeof bunValue.spawn !== "function" || typeof bunValue.serve !== "function") {
    return null;
  }

  const env = bunValue.env && typeof bunValue.env === "object" ? bunValue.env : process.env;
  return {
    spawn: bunValue.spawn,
    serve: bunValue.serve,
    env: env as Record<string, string | undefined>,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildProxyBaseURL(config: CursorPluginConfig, port: number): string {
  return `http://${config.proxyHost}:${port}/v1`;
}

function isAddressInUseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (error as { code?: string }).code === "EADDRINUSE";
}

function terminateProcess(process: BunSpawnProcess): void {
  if (typeof process.kill !== "function") {
    return;
  }

  try {
    process.kill();
  } catch (error) {
    log.debug("Failed to terminate process", { message: toErrorMessage(error) });
  }
}

function createCursorAgentCommand(
  stream: boolean,
  workspaceDirectory: string,
  selectedModel: string,
  prompt: string,
): string[] {
  return [
    "cursor-agent",
    "--print",
    "--approve-mcps",
    "--trust",
    "--force",
    "--output-format",
    stream ? "stream-json" : "text",
    ...(stream ? ["--stream-partial-output"] : []),
    "--workspace",
    workspaceDirectory,
    "--model",
    selectedModel,
    prompt,
  ];
}

function buildToolCallsChunk(
  id: string,
  created: number,
  model: string,
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: toolCalls.map((toolCall, index) => ({
            index,
            id: `call_${Date.now()}_${index}`,
            type: "function",
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments ?? {}),
            },
          })),
        },
        finish_reason: "tool_calls",
      },
    ],
  };
}

async function handleNonStreamingRequest(
  process: BunSpawnProcess,
  selectedModel: string,
  tools: ToolDef[],
  hasTimedOut: () => boolean,
  cleanupProcess: () => void,
): Promise<Response> {
  try {
    const [stdoutText, stderrText] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr ?? "").text(),
    ]);

    if (hasTimedOut()) {
      return openAIError(504, "cursor-agent timed out.", undefined, "timeout_error", "agent_timeout");
    }

    const stdout = (stdoutText || "").trim();
    const stderr = (stderrText || "").trim();
    const plan = tools.length > 0 ? parseToolCallPlan(stdout) : null;

    if (plan?.action === "tool_call") {
      return new Response(JSON.stringify(createToolCallsCompletionResponse(selectedModel, plan.tool_calls)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (plan?.action === "final") {
      return new Response(JSON.stringify(createChatCompletionResponse(selectedModel, plan.content)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (process.exitCode !== 0 && stderr.length > 0) {
      return openAIError(401, "cursor-agent failed.", stderr, "invalid_api_key_error", "cursor_agent_failed");
    }

    return new Response(JSON.stringify(createChatCompletionResponse(selectedModel, stdout || stderr)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    cleanupProcess();
  }
}

async function streamWithTools(
  process: BunSpawnProcess,
  selectedModel: string,
  id: string,
  created: number,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController<Uint8Array>,
  heartbeatIntervalMs: number,
  hasTimedOut: () => boolean,
): Promise<void> {
  const heartbeat = () => {
    const pingChunk = createChatCompletionChunk(id, created, selectedModel, "", false);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(pingChunk)}\n\n`));
  };

  heartbeat();
  const interval = setInterval(heartbeat, heartbeatIntervalMs);
  const decoder = new TextDecoder();
  const reader = process.stdout.getReader();
  let fullOutput = "";
  let accumulatedAssistant = "";
  let emittedThinking = false;
  let lastThinkingChar = "";
  let thinkingFenceOpen = false;
  let thinkingPlanJsonOpen = false;
  let buffer = "";

  const updateLastThinkingChar = (text: string) => {
    for (let index = text.length - 1; index >= 0; index -= 1) {
      const char = text[index];
      if (!/\s/.test(char)) {
        lastThinkingChar = char;
        return;
      }
    }
  };

  const shouldPrefixThinkingSpace = (text: string): boolean => {
    if (!emittedThinking || !text) {
      return false;
    }

    if (/^\s/.test(text)) {
      return false;
    }

    const firstChar = text[0];
    if (!firstChar) {
      return false;
    }

    if (!lastThinkingChar || /\s/.test(lastThinkingChar)) {
      return false;
    }

    if (/[.,!?;:)]/.test(lastThinkingChar)) {
      return true;
    }

    if (/[a-z]/.test(lastThinkingChar) && /[A-Z]/.test(firstChar)) {
      return true;
    }

    if (/\d/.test(lastThinkingChar) && /[A-Za-z]/.test(firstChar)) {
      return true;
    }

    if (/[A-Za-z]/.test(lastThinkingChar) && /\d/.test(firstChar)) {
      return true;
    }

    return false;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (hasTimedOut()) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const event = parseCursorStreamLine(line) ?? parseCursorStreamFallbackLine(line);
        if (!event) {
          continue;
        }

        if (event.type === "thinking") {
          const sanitized = sanitizeThinkingText(event.text, thinkingFenceOpen, thinkingPlanJsonOpen);
          thinkingFenceOpen = sanitized.inFence;
          thinkingPlanJsonOpen = sanitized.inPlanJson;
          let thinkingChunk = sanitized.text.replace(/\*\*/g, "");
          if (!thinkingChunk.trim()) {
            continue;
          }

          if (shouldPrefixThinkingSpace(thinkingChunk)) {
            thinkingChunk = ` ${thinkingChunk}`;
          }

          const thinkingText = emittedThinking ? thinkingChunk : `Thinking: ${thinkingChunk}`;
          emittedThinking = true;
          updateLastThinkingChar(thinkingChunk);
          const chunkPayload = createChatCompletionChunk(id, created, selectedModel, thinkingText, false);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
          continue;
        }

        if (event.type === "content") {
          const merged = mergeAssistantContent(accumulatedAssistant, event.text);
          accumulatedAssistant = merged.next;
          continue;
        }

        if (event.type === "result") {
          fullOutput = event.text;
        }
      }
    }

    if (buffer.trim()) {
      const event = parseCursorStreamLine(buffer) ?? parseCursorStreamFallbackLine(buffer);
      if (event?.type === "thinking") {
        const sanitized = sanitizeThinkingText(event.text, thinkingFenceOpen, thinkingPlanJsonOpen);
        thinkingFenceOpen = sanitized.inFence;
        thinkingPlanJsonOpen = sanitized.inPlanJson;
        let thinkingChunk = sanitized.text.replace(/\*\*/g, "");
        if (thinkingChunk.trim()) {
          if (shouldPrefixThinkingSpace(thinkingChunk)) {
            thinkingChunk = ` ${thinkingChunk}`;
          }

          const thinkingText = emittedThinking ? thinkingChunk : `Thinking: ${thinkingChunk}`;
          emittedThinking = true;
          updateLastThinkingChar(thinkingChunk);
          const chunkPayload = createChatCompletionChunk(id, created, selectedModel, thinkingText, false);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
        }
      } else if (event?.type === "content") {
        const merged = mergeAssistantContent(accumulatedAssistant, event.text);
        accumulatedAssistant = merged.next;
      } else if (event?.type === "result") {
        fullOutput = event.text;
      }
    }
  } finally {
    clearInterval(interval);
  }

  if (hasTimedOut()) {
    const timeoutChunk = createChatCompletionChunk(id, created, selectedModel, "cursor-agent timed out.", true);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(timeoutChunk)}\n\n`));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    return;
  }

  if (!fullOutput && accumulatedAssistant) {
    fullOutput = accumulatedAssistant;
  }

  const resultPlan = parseToolCallPlan(fullOutput);
  if (resultPlan?.action === "tool_call") {
    const toolCallChunk = buildToolCallsChunk(id, created, selectedModel, resultPlan.tool_calls);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallChunk)}\n\n`));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    return;
  }

  let finalContent = "";
  if (resultPlan?.action === "final") {
    finalContent = resultPlan.content;
  } else if (fullOutput) {
    finalContent = fullOutput;
  } else {
    const assistantPlan = parseToolCallPlan(accumulatedAssistant);
    finalContent = assistantPlan?.action === "final" ? assistantPlan.content : accumulatedAssistant;
  }

  if (finalContent) {
    const outputContent = emittedThinking && !/^\n/.test(finalContent) ? `\n\n${finalContent}` : finalContent;
    const finalChunk = createChatCompletionChunk(id, created, selectedModel, outputContent, true);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
  } else {
    const doneChunk = createChatCompletionChunk(id, created, selectedModel, "", true);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`));
  }

  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
}

async function streamWithoutTools(
  process: BunSpawnProcess,
  selectedModel: string,
  id: string,
  created: number,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController<Uint8Array>,
  hasTimedOut: () => boolean,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = process.stdout.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (hasTimedOut()) {
      break;
    }
    if (!value || value.length === 0) {
      continue;
    }

    const text = decoder.decode(value, { stream: true });
    if (!text) {
      continue;
    }

    const chunk = createChatCompletionChunk(id, created, selectedModel, text, false);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  }

  if (hasTimedOut()) {
    const timeoutChunk = createChatCompletionChunk(id, created, selectedModel, "cursor-agent timed out.", true);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(timeoutChunk)}\n\n`));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    return;
  }

  if (process.exitCode !== 0) {
    const stderrText = await new Response(process.stderr ?? "").text();
    const message = `cursor-agent failed: ${(stderrText || "").trim()}`;
    const errChunk = createChatCompletionChunk(id, created, selectedModel, message, true);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errChunk)}\n\n`));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    return;
  }

  const doneChunk = createChatCompletionChunk(id, created, selectedModel, "", true);
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`));
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
}

function createStreamingResponse(
  process: BunSpawnProcess,
  selectedModel: string,
  tools: ToolDef[],
  heartbeatIntervalMs: number,
  requestSignal: AbortSignal,
  cleanupProcess: () => void,
  hasTimedOut: () => boolean,
): Response {
  const encoder = new TextEncoder();
  const id = `cursor-agent-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  const sse = new ReadableStream({
    async start(controller) {
      const onAbort = () => {
        cleanupProcess();
      };

      requestSignal.addEventListener("abort", onAbort, { once: true });

      try {
        if (tools.length > 0) {
          await streamWithTools(process, selectedModel, id, created, encoder, controller, heartbeatIntervalMs, hasTimedOut);
          return;
        }

        await streamWithoutTools(process, selectedModel, id, created, encoder, controller, hasTimedOut);
      } finally {
        requestSignal.removeEventListener("abort", onAbort);
        cleanupProcess();
        if (!requestSignal.aborted) {
          try {
            controller.close();
          } catch (error) {
            log.debug("Failed to close stream controller", { message: toErrorMessage(error) });
          }
        }
      }
    },
    cancel() {
      cleanupProcess();
    },
  });

  return new Response(sse, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function createProxyHandler(
  workspaceDirectory: string,
  config: CursorPluginConfig,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname !== "/v1/chat/completions" && url.pathname !== "/chat/completions") {
        return openAIError(404, `Unsupported path: ${url.pathname}`, undefined, "invalid_request_error", "unsupported_path");
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch (error) {
        return openAIError(400, "Invalid JSON in request body.", toErrorMessage(error), "invalid_request_error", "invalid_json");
      }

      const { prompt, model, stream, tools } = extractPromptFromChatCompletions(body);
      let selectedModel = normalizeCursorAgentModel(model, config.modelAliases);
      if (tools.length > 0 && selectedModel === "auto") {
        selectedModel = config.toolAutoModel;
      }

      const effectivePrompt = tools.length > 0 ? buildToolCallingPrompt(prompt, tools, workspaceDirectory) : prompt;
      const bun = getBunRuntime();
      if (!bun) {
        return openAIError(500, "This provider requires Bun runtime.", undefined, "server_error", "bun_runtime_required");
      }

      const command = createCursorAgentCommand(stream, workspaceDirectory, selectedModel, effectivePrompt);
      const process = bun.spawn({
        cmd: command,
        stdout: "pipe",
        stderr: "pipe",
        env: bun.env,
      });

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        terminateProcess(process);
      }, config.agentTimeoutMs);

      const hasTimedOut = () => timedOut;
      let cleanedUp = false;
      const cleanupProcess = () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        clearTimeout(timeout);
        terminateProcess(process);
      };

      if (!stream) {
        return handleNonStreamingRequest(process, selectedModel, tools, hasTimedOut, cleanupProcess);
      }

      return createStreamingResponse(
        process,
        selectedModel,
        tools,
        config.heartbeatIntervalMs,
        req.signal,
        cleanupProcess,
        hasTimedOut,
      );
    } catch (error) {
      const message = toErrorMessage(error);
      log.error("Proxy request failed", { message });
      return openAIError(500, "Proxy error", message, "server_error", "proxy_error");
    }
  };
}

async function probeHealth(config: CursorPluginConfig): Promise<boolean> {
  const url = `http://${config.proxyHost}:${config.proxyPort}/health`;
  try {
    const response = await fetch(url).catch(() => null);
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

export async function ensureCursorProxyServer(
  workspaceDirectory: string,
  config: CursorPluginConfig = getCursorPluginConfig(),
): Promise<string> {
  const globalState = getGlobalProxyState();
  const existingBaseURL = globalState[GLOBAL_PROXY_KEY]?.baseURL;
  if (typeof existingBaseURL === "string" && existingBaseURL.length > 0) {
    return existingBaseURL;
  }

  globalState[GLOBAL_PROXY_KEY] = { baseURL: "" };
  const bun = getBunRuntime();

  if (!bun) {
    throw new CursorProxyError("Cursor proxy server requires Bun runtime", 500);
  }

  const knownBaseURL = buildProxyBaseURL(config, config.proxyPort);
  const healthAlreadyUp = await probeHealth(config);
  if (healthAlreadyUp) {
    globalState[GLOBAL_PROXY_KEY] = { baseURL: knownBaseURL };
    return knownBaseURL;
  }

  const startServer = (port: number): BunServer =>
    bun.serve({
      hostname: config.proxyHost,
      port,
      fetch: createProxyHandler(workspaceDirectory, config),
    });

  try {
    const server = startServer(config.proxyPort);
    const baseURL = buildProxyBaseURL(config, server.port);
    globalState[GLOBAL_PROXY_KEY] = { baseURL };
    return baseURL;
  } catch (error) {
    if (!isAddressInUseError(error)) {
      throw error;
    }

    const healthy = await probeHealth(config);
    if (healthy) {
      globalState[GLOBAL_PROXY_KEY] = { baseURL: knownBaseURL };
      return knownBaseURL;
    }

    const server = startServer(0);
    const baseURL = buildProxyBaseURL(config, server.port);
    globalState[GLOBAL_PROXY_KEY] = { baseURL };
    return baseURL;
  }
}
