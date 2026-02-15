import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { CURSOR_PROVIDER_ID } from "./constants.js";
import { getCursorPluginConfig } from "./config/loader.js";
import { createChatCompletionChunk, createChatCompletionResponse, createToolCallsCompletionResponse, openAIError, } from "./plugin/openai.js";
import { ensureCursorProxyServer } from "./plugin/proxy.js";
import { parseCursorStreamLine } from "./plugin/stream.js";
import { buildToolCallingPrompt, extractPromptFromChatCompletions, normalizeCursorAgentModel, parseToolCallPlan, } from "./plugin/tooling.js";
import { createLogger } from "./utils/logger.js";
const log = createLogger("plugin");
const TERMINAL_AGENT_STATUSES = new Set(["FINISHED", "FAILED", "STOPPED", "CANCELLED", "ERRORED", "ERROR"]);
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}
function toUrlString(input) {
    if (typeof input === "string") {
        return input;
    }
    if (input instanceof URL) {
        return input.toString();
    }
    return input.url;
}
function isChatCompletionsRequest(input) {
    const raw = toUrlString(input);
    try {
        return new URL(raw).pathname.endsWith("/chat/completions");
    }
    catch {
        return raw.includes("/chat/completions");
    }
}
function buildBasicAuthHeader(apiKey) {
    return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}
function resolveApiKey(auth) {
    if (auth && typeof auth === "object") {
        const typed = auth;
        if (typed.type === "api_key" && typeof typed.key === "string" && typed.key.trim().length > 0) {
            return typed.key.trim();
        }
    }
    const envKey = process.env.CURSOR_API_KEY;
    if (typeof envKey === "string" && envKey.trim().length > 0) {
        return envKey.trim();
    }
    return undefined;
}
function extractApiKeyFromRequestInit(init) {
    const headers = new Headers(init?.headers ?? {});
    const explicitApiKey = headers.get("x-api-key");
    if (explicitApiKey && explicitApiKey.trim().length > 0) {
        return explicitApiKey.trim();
    }
    const authorization = headers.get("authorization");
    if (!authorization) {
        return undefined;
    }
    if (authorization.toLowerCase().startsWith("bearer ")) {
        const token = authorization.slice(7).trim();
        return token.length > 0 ? token : undefined;
    }
    if (authorization.toLowerCase().startsWith("basic ")) {
        const encoded = authorization.slice(6).trim();
        try {
            const decoded = Buffer.from(encoded, "base64").toString("utf8");
            const key = decoded.split(":", 1)[0]?.trim();
            return key && key.length > 0 ? key : undefined;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function normalizeRepositoryUrl(raw) {
    const value = raw.trim();
    if (value.startsWith("git@github.com:")) {
        const repo = value.replace("git@github.com:", "").replace(/\.git$/, "");
        return `https://github.com/${repo}`;
    }
    if (value.startsWith("ssh://git@github.com/")) {
        const repo = value.replace("ssh://git@github.com/", "").replace(/\.git$/, "");
        return `https://github.com/${repo}`;
    }
    return value.replace(/\.git$/, "");
}
function readGitValue(workspaceDirectory, args) {
    try {
        const output = execFileSync("git", ["-C", workspaceDirectory, ...args], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const value = output.trim();
        return value.length > 0 ? value : undefined;
    }
    catch {
        return undefined;
    }
}
function hasRemoteBranch(workspaceDirectory, ref) {
    const value = readGitValue(workspaceDirectory, ["ls-remote", "--heads", "origin", ref]);
    return typeof value === "string" && value.length > 0;
}
function resolveSource(workspaceDirectory, sourceRepository, sourceRef) {
    const repository = sourceRepository?.trim() || readGitValue(workspaceDirectory, ["remote", "get-url", "origin"]);
    if (!repository) {
        return null;
    }
    const explicitRef = sourceRef?.trim();
    const detectedRef = readGitValue(workspaceDirectory, ["rev-parse", "--abbrev-ref", "HEAD"]);
    let ref = explicitRef || detectedRef;
    if (!explicitRef && ref && ref !== "HEAD" && !hasRemoteBranch(workspaceDirectory, ref)) {
        log.warn("Local branch is not available on remote; using repository default branch", { ref });
        ref = undefined;
    }
    return {
        source: {
            repository: normalizeRepositoryUrl(repository),
            ref: ref === "HEAD" ? undefined : ref,
        },
        refIsExplicit: Boolean(explicitRef),
    };
}
function isBranchVerificationError(details) {
    const lowered = details.toLowerCase();
    return lowered.includes("verify existence of branch") || lowered.includes("branch name is correct");
}
async function cursorApiRequest(apiBaseUrl, apiKey, path, init) {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", buildBasicAuthHeader(apiKey));
    const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}${path}`, {
        ...init,
        headers,
    });
    const text = await response.text();
    if (!text.trim()) {
        return { response, data: null, text };
    }
    try {
        return { response, data: JSON.parse(text), text };
    }
    catch {
        return { response, data: null, text };
    }
}
function extractAssistantMessage(conversation) {
    const messages = conversation?.messages;
    if (!Array.isArray(messages)) {
        return "";
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.type === "assistant_message" && typeof message.text === "string" && message.text.trim().length > 0) {
            return message.text.trim();
        }
    }
    return "";
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
async function runCloudAgent(workspaceDirectory, apiBaseUrl, apiKey, model, prompt, tools) {
    const config = getCursorPluginConfig();
    const resolvedSource = resolveSource(workspaceDirectory, config.sourceRepository, config.sourceRef);
    if (!resolvedSource) {
        throw new Error("Could not resolve source repository. Set CURSOR_SOURCE_REPOSITORY or configure git remote origin.");
    }
    let source = resolvedSource.source;
    let selectedModel = normalizeCursorAgentModel(model, config.modelAliases);
    if (tools.length > 0 && selectedModel === "auto") {
        selectedModel = config.toolAutoModel;
    }
    const effectivePrompt = tools.length > 0 ? buildToolCallingPrompt(prompt, tools, workspaceDirectory) : prompt;
    const launchBody = {
        prompt: { text: effectivePrompt },
        source,
        target: { autoCreatePr: false },
    };
    if (selectedModel !== "auto") {
        launchBody.model = selectedModel;
    }
    let launch = await cursorApiRequest(apiBaseUrl, apiKey, "/v0/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(launchBody),
    });
    if (!launch.response.ok &&
        source.ref &&
        !resolvedSource.refIsExplicit &&
        isBranchVerificationError(launch.text)) {
        source = { repository: source.repository };
        const retryLaunchBody = {
            ...launchBody,
            source,
        };
        launch = await cursorApiRequest(apiBaseUrl, apiKey, "/v0/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(retryLaunchBody),
        });
    }
    if (!launch.response.ok || !launch.data?.id) {
        const details = launch.text || `HTTP ${launch.response.status}`;
        throw new Error(`Failed to launch Cursor agent: ${details}`);
    }
    const agentId = launch.data.id;
    const startedAt = Date.now();
    while (true) {
        if (Date.now() - startedAt > config.agentTimeoutMs) {
            throw new Error(`Timed out waiting for Cursor agent ${agentId}`);
        }
        const statusResult = await cursorApiRequest(apiBaseUrl, apiKey, `/v0/agents/${agentId}`, {
            method: "GET",
        });
        if (!statusResult.response.ok || !statusResult.data?.status) {
            const details = statusResult.text || `HTTP ${statusResult.response.status}`;
            throw new Error(`Failed to read Cursor agent status: ${details}`);
        }
        const status = statusResult.data.status;
        if (!TERMINAL_AGENT_STATUSES.has(status)) {
            await sleep(config.agentPollIntervalMs);
            continue;
        }
        if (status !== "FINISHED") {
            throw new Error(`Cursor agent ended with status ${status}`);
        }
        const conversation = await cursorApiRequest(apiBaseUrl, apiKey, `/v0/agents/${agentId}/conversation`, { method: "GET" });
        return {
            model: selectedModel === "auto" ? model || "auto" : selectedModel,
            output: extractAssistantMessage(conversation.data) || statusResult.data.summary || "",
        };
    }
}
function createStreamingResponse(model, output, tools) {
    const id = `cursor-api-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const plan = tools.length > 0 ? parseToolCallPlan(output) : null;
            if (plan?.action === "tool_call") {
                const chunk = buildToolCallsChunk(id, created, model, plan.tool_calls);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
            }
            const finalContent = plan?.action === "final" ? plan.content : output;
            const chunk = createChatCompletionChunk(id, created, model, finalContent, true);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
function createNonStreamingResponse(model, output, tools) {
    const plan = tools.length > 0 ? parseToolCallPlan(output) : null;
    if (plan?.action === "tool_call") {
        return new Response(JSON.stringify(createToolCallsCompletionResponse(model, plan.tool_calls)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
    if (plan?.action === "final") {
        return new Response(JSON.stringify(createChatCompletionResponse(model, plan.content)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify(createChatCompletionResponse(model, output)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
async function parseRequestBody(input, init) {
    if (typeof init?.body === "string") {
        try {
            return JSON.parse(init.body);
        }
        catch {
            return {};
        }
    }
    if (input instanceof Request) {
        try {
            return await input.clone().json();
        }
        catch {
            return {};
        }
    }
    return {};
}
export { parseCursorStreamLine, ensureCursorProxyServer };
export const CursorAuthPlugin = async ({ directory }) => {
    const config = getCursorPluginConfig();
    const baseURL = `${trimTrailingSlash(config.apiBaseUrl)}/v1`;
    return {
        auth: {
            provider: CURSOR_PROVIDER_ID,
            async loader(getAuth) {
                return {
                    apiKey: "",
                    fetch: async (input, init) => {
                        if (!isChatCompletionsRequest(input)) {
                            return fetch(input, init);
                        }
                        const auth = await getAuth();
                        const apiKey = resolveApiKey(auth) ?? extractApiKeyFromRequestInit(init);
                        if (!apiKey) {
                            return openAIError(401, "Cursor API key missing. Use `opencode auth login` for provider `cursor`.");
                        }
                        const requestBody = await parseRequestBody(input, init);
                        const extracted = extractPromptFromChatCompletions(requestBody);
                        if (!extracted.prompt.trim()) {
                            return openAIError(400, "No prompt content found in chat request.");
                        }
                        try {
                            const completion = await runCloudAgent(directory, config.apiBaseUrl, apiKey, extracted.model, extracted.prompt, extracted.tools);
                            if (extracted.stream) {
                                return createStreamingResponse(completion.model, completion.output, extracted.tools);
                            }
                            return createNonStreamingResponse(completion.model, completion.output, extracted.tools);
                        }
                        catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            log.error("Cursor Cloud API request failed", { message });
                            return openAIError(502, "Cursor Cloud API request failed", message);
                        }
                    },
                };
            },
            methods: [
                {
                    label: "Manually enter Cursor API key",
                    type: "api",
                },
            ],
        },
        async "chat.params"(input, output) {
            if (input.model.providerID !== CURSOR_PROVIDER_ID) {
                return;
            }
            output.options.baseURL = baseURL;
            output.options.apiKey = output.options.apiKey || "cursor-api";
        },
    };
};
//# sourceMappingURL=plugin.js.map