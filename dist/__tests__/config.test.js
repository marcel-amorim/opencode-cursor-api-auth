import { describe, expect, test } from "bun:test";
import { createCursorPluginConfigFromEnv } from "../config/loader.js";
describe("createCursorPluginConfigFromEnv", () => {
    test("applies defaults when env is empty", () => {
        const config = createCursorPluginConfigFromEnv({});
        expect(config.providerId).toBe("cursor");
        expect(config.proxyHost).toBe("127.0.0.1");
        expect(config.proxyPort).toBe(32123);
        expect(config.logLevel).toBe("warn");
        expect(config.modelAliases["gpt-5"]).toBe("gpt-5.2");
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
        });
        expect(config.providerId).toBe("cursor-custom");
        expect(config.proxyHost).toBe("0.0.0.0");
        expect(config.proxyPort).toBe(4545);
        expect(config.heartbeatIntervalMs).toBe(2500);
        expect(config.logLevel).toBe("debug");
        expect(config.toolAutoModel).toBe("custom-model");
        expect(config.modelAliases["my-model"]).toBe("my-model-v2");
    });
    test("falls back to defaults when model aliases are invalid json", () => {
        const config = createCursorPluginConfigFromEnv({
            CURSOR_MODEL_ALIASES: "{",
        });
        expect(config.modelAliases["gpt-5"]).toBe("gpt-5.2");
        expect(config.modelAliases["sonnet-4"]).toBe("sonnet-4.5");
    });
});
//# sourceMappingURL=config.test.js.map