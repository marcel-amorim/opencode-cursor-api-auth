import { describe, expect, test } from "bun:test";
import { createCursorPluginConfigFromEnv } from "../config/loader.js";

describe("createCursorPluginConfigFromEnv", () => {
  test("applies defaults when env is empty", () => {
    const config = createCursorPluginConfigFromEnv({} as NodeJS.ProcessEnv);

    expect(config.providerId).toBe("cursor");
    expect(config.proxyHost).toBe("127.0.0.1");
    expect(config.proxyPort).toBe(32123);
    expect(config.logLevel).toBe("warn");
    expect(config.modelAliases["gpt-5"]).toBe("gpt-5.2");
    expect(config.modelDiscoveryEnabled).toBe(true);
    expect(config.modelDiscoveryCachePath).toBe(".cursor-models-cache.json");
    expect(config.modelDiscoveryCacheTtlMs).toBe(86_400_000);
    expect(config.fallbackModels).toEqual(["auto", "gpt-5.2", "sonnet-4.5", "sonnet-4.5-thinking"]);
  });

  test("reads overrides from env", () => {
    const config = createCursorPluginConfigFromEnv({
      CURSOR_PROVIDER_ID: "cursor-custom",
      CURSOR_PROXY_HOST: "0.0.0.0",
      CURSOR_PROXY_PORT: "4545",
      CURSOR_PROXY_HEARTBEAT_MS: "2500",
      CURSOR_LOG_LEVEL: "debug",
      CURSOR_TOOL_AUTO_MODEL: "custom-model",
      CURSOR_MODEL_ALIASES: JSON.stringify({ "my-model": "my-model-v2" }),
      CURSOR_MODEL_DISCOVERY_ENABLED: "false",
      CURSOR_MODEL_DISCOVERY_CACHE_PATH: "custom-cache/models.json",
      CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS: "120000",
      CURSOR_FALLBACK_MODELS: JSON.stringify(["auto", "my-model-v2"]),
    } as NodeJS.ProcessEnv);

    expect(config.providerId).toBe("cursor-custom");
    expect(config.proxyHost).toBe("0.0.0.0");
    expect(config.proxyPort).toBe(4545);
    expect(config.heartbeatIntervalMs).toBe(2500);
    expect(config.logLevel).toBe("debug");
    expect(config.toolAutoModel).toBe("custom-model");
    expect(config.modelAliases["my-model"]).toBe("my-model-v2");
    expect(config.modelDiscoveryEnabled).toBe(false);
    expect(config.modelDiscoveryCachePath).toBe("custom-cache/models.json");
    expect(config.modelDiscoveryCacheTtlMs).toBe(120000);
    expect(config.fallbackModels).toEqual(["auto", "my-model-v2"]);
  });

  test("falls back to defaults when model aliases are invalid json", () => {
    const config = createCursorPluginConfigFromEnv({
      CURSOR_MODEL_ALIASES: "{" as unknown as string,
    } as NodeJS.ProcessEnv);

    expect(config.modelAliases["gpt-5"]).toBe("gpt-5.2");
    expect(config.modelAliases["sonnet-4"]).toBe("sonnet-4.5");
  });

  test("falls back to defaults when discovery env values are invalid", () => {
    const config = createCursorPluginConfigFromEnv({
      CURSOR_MODEL_DISCOVERY_ENABLED: "maybe",
      CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS: "not-a-number",
      CURSOR_FALLBACK_MODELS: "[]",
    } as NodeJS.ProcessEnv);

    expect(config.modelDiscoveryEnabled).toBe(true);
    expect(config.modelDiscoveryCacheTtlMs).toBe(86_400_000);
    expect(config.fallbackModels).toEqual(["auto", "gpt-5.2", "sonnet-4.5", "sonnet-4.5-thinking"]);
  });

  test("reads fallback models from comma-separated env", () => {
    const config = createCursorPluginConfigFromEnv({
      CURSOR_FALLBACK_MODELS: "auto, sonnet-4.5-thinking, gpt-5.2",
    } as NodeJS.ProcessEnv);

    expect(config.fallbackModels).toEqual(["auto", "sonnet-4.5-thinking", "gpt-5.2"]);
  });
});
