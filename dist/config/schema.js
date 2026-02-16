import { z } from "zod";
import { DEFAULT_FALLBACK_MODELS, DEFAULT_MODEL_ALIASES, DEFAULT_MODEL_DISCOVERY_CACHE_PATH, DEFAULT_MODEL_DISCOVERY_CACHE_TTL_MS, } from "./defaults.js";
export const cursorPluginConfigSchema = z.object({
    providerId: z.string().min(1).default("cursor"),
    proxyHost: z.string().min(1).default("127.0.0.1"),
    proxyPort: z.number().int().positive().max(65535).default(32123),
    heartbeatIntervalMs: z.number().int().positive().default(1000),
    logLevel: z.enum(["debug", "info", "warn", "error", "silent"]).default("warn"),
    toolAutoModel: z.string().min(1).default("sonnet-4.5-thinking"),
    agentTimeoutMs: z.number().int().positive().default(600000),
    modelAliases: z.record(z.string()).default(DEFAULT_MODEL_ALIASES),
    modelDiscoveryEnabled: z.boolean().default(true),
    modelDiscoveryCachePath: z.string().min(1).default(DEFAULT_MODEL_DISCOVERY_CACHE_PATH),
    modelDiscoveryCacheTtlMs: z.number().int().positive().default(DEFAULT_MODEL_DISCOVERY_CACHE_TTL_MS),
    fallbackModels: z.array(z.string().min(1)).default(DEFAULT_FALLBACK_MODELS),
});
//# sourceMappingURL=schema.js.map