import { z } from "zod";
export const cursorPluginConfigSchema = z.object({
    providerId: z.string().min(1).default("cursor"),
    proxyHost: z.string().min(1).default("127.0.0.1"),
    proxyPort: z.number().int().positive().max(65535).default(32123),
    heartbeatIntervalMs: z.number().int().positive().default(1000),
    logLevel: z.enum(["debug", "info", "warn", "error", "silent"]).default("warn"),
    toolAutoModel: z.string().min(1).default("sonnet-4.5-thinking"),
    agentTimeoutMs: z.number().int().positive().default(600000),
    modelAliases: z.record(z.string()).default({
        "gpt-5": "gpt-5.2",
        "sonnet-4": "sonnet-4.5",
    }),
});
//# sourceMappingURL=schema.js.map