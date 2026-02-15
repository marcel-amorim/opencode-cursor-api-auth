import { z } from "zod";
import { cursorPluginConfigSchema, type CursorPluginConfig } from "./schema.js";

const cursorPluginEnvSchema = z.object({
  CURSOR_PROVIDER_ID: z.string().optional(),
  CURSOR_PROXY_HOST: z.string().optional(),
  CURSOR_PROXY_PORT: z.string().optional(),
  CURSOR_PROXY_HEARTBEAT_MS: z.string().optional(),
  CURSOR_LOG_LEVEL: z.string().optional(),
  CURSOR_TOOL_AUTO_MODEL: z.string().optional(),
  CURSOR_AGENT_TIMEOUT_MS: z.string().optional(),
  CURSOR_MODEL_ALIASES: z.string().optional(),
});

function parseModelAliases(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && key.length > 0) {
        output[key] = value;
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  } catch {
    return undefined;
  }
}

export function createCursorPluginConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CursorPluginConfig {
  const parsedEnv = cursorPluginEnvSchema.parse(env);

  return cursorPluginConfigSchema.parse({
    providerId: parsedEnv.CURSOR_PROVIDER_ID,
    proxyHost: parsedEnv.CURSOR_PROXY_HOST,
    proxyPort: parsedEnv.CURSOR_PROXY_PORT ? Number(parsedEnv.CURSOR_PROXY_PORT) : undefined,
    heartbeatIntervalMs: parsedEnv.CURSOR_PROXY_HEARTBEAT_MS ? Number(parsedEnv.CURSOR_PROXY_HEARTBEAT_MS) : undefined,
    logLevel: parsedEnv.CURSOR_LOG_LEVEL,
    toolAutoModel: parsedEnv.CURSOR_TOOL_AUTO_MODEL,
    agentTimeoutMs: parsedEnv.CURSOR_AGENT_TIMEOUT_MS ? Number(parsedEnv.CURSOR_AGENT_TIMEOUT_MS) : undefined,
    modelAliases: parseModelAliases(parsedEnv.CURSOR_MODEL_ALIASES),
  });
}

let cachedConfig: CursorPluginConfig | null = null;

export function getCursorPluginConfig(): CursorPluginConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = createCursorPluginConfigFromEnv();
  return cachedConfig;
}

export function resetCursorPluginConfigCache(): void {
  cachedConfig = null;
}
