import { z } from "zod";
export const cursorPluginConfigSchema = z.object({
    providerId: z.string().min(1).default("cursor"),
    apiBaseUrl: z.string().url().default("https://api.cursor.com"),
    proxyHost: z.string().min(1).default("127.0.0.1"),
    proxyPort: z.number().int().positive().max(65535).default(32123),
    heartbeatIntervalMs: z.number().int().positive().default(1000),
    logLevel: z.enum(["debug", "info", "warn", "error", "silent"]).default("warn"),
    toolAutoModel: z.string().min(1).default("claude-4.5-sonnet-thinking"),
    sourceRepository: z.string().optional(),
    sourceRef: z.string().optional(),
    agentPollIntervalMs: z.number().int().positive().default(2000),
    agentTimeoutMs: z.number().int().positive().default(600000),
    modelAliases: z.record(z.string()).default({
        "gpt-5": "gpt-5.2-high",
        "gpt-5.2": "gpt-5.2-high",
        "gpt-5.3": "gpt-5.3-codex-high",
        "gpt-5.3-codex": "gpt-5.3-codex-high",
        "sonnet-4.5-thinking": "claude-4.5-sonnet-thinking",
        "opus-4.6": "claude-4.6-opus-high-thinking",
    }),
});
//# sourceMappingURL=schema.js.map