import { z } from "zod";
import { cursorPluginConfigSchema } from "./schema.js";
const cursorPluginEnvSchema = z.object({
    CURSOR_PROVIDER_ID: z.string().optional(),
    CURSOR_API_BASE_URL: z.string().optional(),
    CURSOR_PROXY_HOST: z.string().optional(),
    CURSOR_PROXY_PORT: z.string().optional(),
    CURSOR_PROXY_HEARTBEAT_MS: z.string().optional(),
    CURSOR_LOG_LEVEL: z.string().optional(),
    CURSOR_TOOL_AUTO_MODEL: z.string().optional(),
    CURSOR_SOURCE_REPOSITORY: z.string().optional(),
    CURSOR_SOURCE_REF: z.string().optional(),
    CURSOR_AGENT_POLL_INTERVAL_MS: z.string().optional(),
    CURSOR_AGENT_TIMEOUT_MS: z.string().optional(),
    CURSOR_MODEL_ALIASES: z.string().optional(),
});
function parseModelAliases(raw) {
    if (!raw) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return undefined;
        }
        const output = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string" && key.length > 0) {
                output[key] = value;
            }
        }
        return Object.keys(output).length > 0 ? output : undefined;
    }
    catch {
        return undefined;
    }
}
export function createCursorPluginConfigFromEnv(env = process.env) {
    const parsedEnv = cursorPluginEnvSchema.parse(env);
    return cursorPluginConfigSchema.parse({
        providerId: parsedEnv.CURSOR_PROVIDER_ID,
        apiBaseUrl: parsedEnv.CURSOR_API_BASE_URL,
        proxyHost: parsedEnv.CURSOR_PROXY_HOST,
        proxyPort: parsedEnv.CURSOR_PROXY_PORT ? Number(parsedEnv.CURSOR_PROXY_PORT) : undefined,
        heartbeatIntervalMs: parsedEnv.CURSOR_PROXY_HEARTBEAT_MS ? Number(parsedEnv.CURSOR_PROXY_HEARTBEAT_MS) : undefined,
        logLevel: parsedEnv.CURSOR_LOG_LEVEL,
        toolAutoModel: parsedEnv.CURSOR_TOOL_AUTO_MODEL,
        sourceRepository: parsedEnv.CURSOR_SOURCE_REPOSITORY,
        sourceRef: parsedEnv.CURSOR_SOURCE_REF,
        agentPollIntervalMs: parsedEnv.CURSOR_AGENT_POLL_INTERVAL_MS
            ? Number(parsedEnv.CURSOR_AGENT_POLL_INTERVAL_MS)
            : undefined,
        agentTimeoutMs: parsedEnv.CURSOR_AGENT_TIMEOUT_MS ? Number(parsedEnv.CURSOR_AGENT_TIMEOUT_MS) : undefined,
        modelAliases: parseModelAliases(parsedEnv.CURSOR_MODEL_ALIASES),
    });
}
let cachedConfig = null;
export function getCursorPluginConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    cachedConfig = createCursorPluginConfigFromEnv();
    return cachedConfig;
}
export function resetCursorPluginConfigCache() {
    cachedConfig = null;
}
//# sourceMappingURL=loader.js.map