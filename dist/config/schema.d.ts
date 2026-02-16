import { z } from "zod";
export declare const cursorPluginConfigSchema: z.ZodObject<{
    providerId: z.ZodDefault<z.ZodString>;
    proxyHost: z.ZodDefault<z.ZodString>;
    proxyPort: z.ZodDefault<z.ZodNumber>;
    heartbeatIntervalMs: z.ZodDefault<z.ZodNumber>;
    logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error", "silent"]>>;
    toolAutoModel: z.ZodDefault<z.ZodString>;
    agentTimeoutMs: z.ZodDefault<z.ZodNumber>;
    modelAliases: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    modelDiscoveryEnabled: z.ZodDefault<z.ZodBoolean>;
    modelDiscoveryCachePath: z.ZodDefault<z.ZodString>;
    modelDiscoveryCacheTtlMs: z.ZodDefault<z.ZodNumber>;
    fallbackModels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    providerId: string;
    proxyHost: string;
    proxyPort: number;
    heartbeatIntervalMs: number;
    logLevel: "debug" | "info" | "warn" | "error" | "silent";
    toolAutoModel: string;
    agentTimeoutMs: number;
    modelAliases: Record<string, string>;
    modelDiscoveryEnabled: boolean;
    modelDiscoveryCachePath: string;
    modelDiscoveryCacheTtlMs: number;
    fallbackModels: string[];
}, {
    providerId?: string | undefined;
    proxyHost?: string | undefined;
    proxyPort?: number | undefined;
    heartbeatIntervalMs?: number | undefined;
    logLevel?: "debug" | "info" | "warn" | "error" | "silent" | undefined;
    toolAutoModel?: string | undefined;
    agentTimeoutMs?: number | undefined;
    modelAliases?: Record<string, string> | undefined;
    modelDiscoveryEnabled?: boolean | undefined;
    modelDiscoveryCachePath?: string | undefined;
    modelDiscoveryCacheTtlMs?: number | undefined;
    fallbackModels?: string[] | undefined;
}>;
export type CursorPluginConfig = z.infer<typeof cursorPluginConfigSchema>;
//# sourceMappingURL=schema.d.ts.map