import { getCursorPluginConfig } from "../config/loader.js";
import { createLogger } from "../utils/logger.js";
import { CursorProxyError } from "./errors.js";
import { createChatCompletionChunk, createChatCompletionResponse, createToolCallsCompletionResponse, openAIError } from "./openai.js";
import { mergeAssistantContent, parseCursorStreamFallbackLine, parseCursorStreamLine, sanitizeThinkingText } from "./stream.js";
import { buildToolCallingPrompt, extractPromptFromChatCompletions, normalizeCursorAgentModel, parseToolCallPlan } from "./tooling.js";
const log = createLogger("proxy");
const GLOBAL_PROXY_KEY = "__opencode_cursor_proxy_server__";
function getGlobalProxyState() {
    return globalThis;
}
function getBunRuntime() {
    const maybeBun = globalThis.Bun;
    if (!maybeBun || typeof maybeBun !== "object") {
        return null;
    }
    const bunValue = maybeBun;
    if (typeof bunValue.spawn !== "function" || typeof bunValue.serve !== "function") {
        return null;
    }
    const env = bunValue.env && typeof bunValue.env === "object" ? bunValue.env : process.env;
    return {
        spawn: bunValue.spawn,
        serve: bunValue.serve,
        env: env,
    };
}
function toErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function buildProxyBaseURL(config, port) {
    return `http://${config.proxyHost}:${port}/v1`;
}
function isAddressInUseError(error) {
    if (!error || typeof error !== "object") {
        return false;
    }
    return error.code === "EADDRINUSE";
}
function createCursorAgentCommand(stream, workspaceDirectory, selectedModel, prompt) {
    return [
        "cursor-agent",
        "--print",
        "--output-format",
        stream ? "stream-json" : "text",
        ...(stream ? ["--stream-partial-output", "--trust"] : []),
        "--workspace",
        workspaceDirectory,
        "--model",
        selectedModel,
        prompt,
    ];
}
function buildToolCallsChunk(id, created, model, toolCalls) {
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
async function handleNonStreamingRequest(process, selectedModel, tools) {
    const [stdoutText, stderrText] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr ?? "").text(),
    ]);
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
        return openAIError(401, "cursor-agent failed.", stderr);
    }
    return new Response(JSON.stringify(createChatCompletionResponse(selectedModel, stdout || stderr)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
async function streamWithTools(process, selectedModel, id, created, encoder, controller, heartbeatIntervalMs) {
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
    let thinkingFenceOpen = false;
    let thinkingPlanJsonOpen = false;
    let buffer = "";
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
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
                    if (!sanitized.text.trim()) {
                        continue;
                    }
                    const thinkingText = emittedThinking ? sanitized.text : `Thinking: ${sanitized.text}`;
                    emittedThinking = true;
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
                if (sanitized.text.trim()) {
                    const thinkingText = emittedThinking ? sanitized.text : `Thinking: ${sanitized.text}`;
                    emittedThinking = true;
                    const chunkPayload = createChatCompletionChunk(id, created, selectedModel, thinkingText, false);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
                }
            }
            else if (event?.type === "content") {
                const merged = mergeAssistantContent(accumulatedAssistant, event.text);
                accumulatedAssistant = merged.next;
            }
            else if (event?.type === "result") {
                fullOutput = event.text;
            }
        }
    }
    finally {
        clearInterval(interval);
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
    }
    else if (fullOutput) {
        finalContent = fullOutput;
    }
    else {
        const assistantPlan = parseToolCallPlan(accumulatedAssistant);
        finalContent = assistantPlan?.action === "final" ? assistantPlan.content : accumulatedAssistant;
    }
    if (finalContent) {
        const outputContent = emittedThinking && !/^\n/.test(finalContent) ? `\n\n${finalContent}` : finalContent;
        const finalChunk = createChatCompletionChunk(id, created, selectedModel, outputContent, true);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
    }
    else {
        const doneChunk = createChatCompletionChunk(id, created, selectedModel, "", true);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`));
    }
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
}
async function streamWithoutTools(process, selectedModel, id, created, encoder, controller) {
    const decoder = new TextDecoder();
    const reader = process.stdout.getReader();
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
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
function createStreamingResponse(process, selectedModel, tools, heartbeatIntervalMs) {
    const encoder = new TextEncoder();
    const id = `cursor-agent-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const sse = new ReadableStream({
        async start(controller) {
            try {
                if (tools.length > 0) {
                    await streamWithTools(process, selectedModel, id, created, encoder, controller, heartbeatIntervalMs);
                    return;
                }
                await streamWithoutTools(process, selectedModel, id, created, encoder, controller);
            }
            finally {
                controller.close();
            }
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
function createProxyHandler(workspaceDirectory, config) {
    return async (req) => {
        try {
            const url = new URL(req.url);
            if (url.pathname === "/health") {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (url.pathname !== "/v1/chat/completions" && url.pathname !== "/chat/completions") {
                return openAIError(404, `Unsupported path: ${url.pathname}`);
            }
            const body = await req.json().catch(() => ({}));
            const { prompt, model, stream, tools } = extractPromptFromChatCompletions(body);
            let selectedModel = normalizeCursorAgentModel(model, config.modelAliases);
            if (tools.length > 0 && selectedModel === "auto") {
                selectedModel = config.toolAutoModel;
            }
            const effectivePrompt = tools.length > 0 ? buildToolCallingPrompt(prompt, tools, workspaceDirectory) : prompt;
            const bun = getBunRuntime();
            if (!bun) {
                return openAIError(500, "This provider requires Bun runtime.");
            }
            const command = createCursorAgentCommand(stream, workspaceDirectory, selectedModel, effectivePrompt);
            const process = bun.spawn({
                cmd: command,
                stdout: "pipe",
                stderr: "pipe",
                env: bun.env,
            });
            if (!stream) {
                return handleNonStreamingRequest(process, selectedModel, tools);
            }
            return createStreamingResponse(process, selectedModel, tools, config.heartbeatIntervalMs);
        }
        catch (error) {
            const message = toErrorMessage(error);
            log.error("Proxy request failed", { message });
            return openAIError(500, "Proxy error", message);
        }
    };
}
async function probeHealth(config) {
    const url = `http://${config.proxyHost}:${config.proxyPort}/health`;
    try {
        const response = await fetch(url).catch(() => null);
        return Boolean(response?.ok);
    }
    catch {
        return false;
    }
}
export async function ensureCursorProxyServer(workspaceDirectory, config = getCursorPluginConfig()) {
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
    const startServer = (port) => bun.serve({
        hostname: config.proxyHost,
        port,
        fetch: createProxyHandler(workspaceDirectory, config),
    });
    try {
        const server = startServer(config.proxyPort);
        const baseURL = buildProxyBaseURL(config, server.port);
        globalState[GLOBAL_PROXY_KEY] = { baseURL };
        return baseURL;
    }
    catch (error) {
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
//# sourceMappingURL=proxy.js.map