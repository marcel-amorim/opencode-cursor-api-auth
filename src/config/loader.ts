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
  CURSOR_MODEL_DISCOVERY_ENABLED: z.string().optional(),
  CURSOR_MODEL_DISCOVERY_CACHE_PATH: z.string().optional(),
  CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS: z.string().optional(),
  CURSOR_FALLBACK_MODELS: z.string().optional(),
});

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

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

function parseFallbackModels(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const values = parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
      return values.length > 0 ? values : undefined;
    }
  } catch {
  }

  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export function createCursorPluginConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CursorPluginConfig {
  const parsedEnv = cursorPluginEnvSchema.parse(env);

  return cursorPluginConfigSchema.parse({
    providerId: parsedEnv.CURSOR_PROVIDER_ID,
    proxyHost: parsedEnv.CURSOR_PROXY_HOST,
    proxyPort: parseNumber(parsedEnv.CURSOR_PROXY_PORT),
    heartbeatIntervalMs: parseNumber(parsedEnv.CURSOR_PROXY_HEARTBEAT_MS),
    logLevel: parsedEnv.CURSOR_LOG_LEVEL,
    toolAutoModel: parsedEnv.CURSOR_TOOL_AUTO_MODEL,
    agentTimeoutMs: parseNumber(parsedEnv.CURSOR_AGENT_TIMEOUT_MS),
    modelAliases: parseModelAliases(parsedEnv.CURSOR_MODEL_ALIASES),
    modelDiscoveryEnabled: parseBoolean(parsedEnv.CURSOR_MODEL_DISCOVERY_ENABLED),
    modelDiscoveryCachePath: parsedEnv.CURSOR_MODEL_DISCOVERY_CACHE_PATH,
    modelDiscoveryCacheTtlMs: parseNumber(parsedEnv.CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS),
    fallbackModels: parseFallbackModels(parsedEnv.CURSOR_FALLBACK_MODELS),
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
