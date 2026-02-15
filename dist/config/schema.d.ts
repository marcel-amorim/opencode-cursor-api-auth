import { z } from "zod";
export declare const cursorPluginConfigSchema: z.ZodObject<{
    providerId: z.ZodDefault<z.ZodString>;
    apiBaseUrl: z.ZodDefault<z.ZodString>;
    proxyHost: z.ZodDefault<z.ZodString>;
    proxyPort: z.ZodDefault<z.ZodNumber>;
    heartbeatIntervalMs: z.ZodDefault<z.ZodNumber>;
    logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error", "silent"]>>;
    toolAutoModel: z.ZodDefault<z.ZodString>;
    sourceRepository: z.ZodOptional<z.ZodString>;
    sourceRef: z.ZodOptional<z.ZodString>;
    agentPollIntervalMs: z.ZodDefault<z.ZodNumber>;
    agentTimeoutMs: z.ZodDefault<z.ZodNumber>;
    modelAliases: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    providerId: string;
    apiBaseUrl: string;
    proxyHost: string;
    proxyPort: number;
    heartbeatIntervalMs: number;
    logLevel: "debug" | "info" | "warn" | "error" | "silent";
    toolAutoModel: string;
    agentPollIntervalMs: number;
    agentTimeoutMs: number;
    modelAliases: Record<string, string>;
    sourceRepository?: string | undefined;
    sourceRef?: string | undefined;
}, {
    providerId?: string | undefined;
    apiBaseUrl?: string | undefined;
    proxyHost?: string | undefined;
    proxyPort?: number | undefined;
    heartbeatIntervalMs?: number | undefined;
    logLevel?: "debug" | "info" | "warn" | "error" | "silent" | undefined;
    toolAutoModel?: string | undefined;
    sourceRepository?: string | undefined;
    sourceRef?: string | undefined;
    agentPollIntervalMs?: number | undefined;
    agentTimeoutMs?: number | undefined;
    modelAliases?: Record<string, string> | undefined;
}>;
export type CursorPluginConfig = z.infer<typeof cursorPluginConfigSchema>;
//# sourceMappingURL=schema.d.ts.map