import { beforeEach, describe, expect, test } from "bun:test";
import { CursorAuthPlugin } from "../plugin.js";
describe("CursorAuthPlugin model sync", () => {
    beforeEach(() => {
        globalThis.__opencode_cursor_proxy_server__ = undefined;
    });
    test("injects runtime models into provider config while keeping user overrides", async () => {
        const hooks = await CursorAuthPlugin({
            $: (() => ({
                quiet() {
                    return this;
                },
                async nothrow() {
                    return {
                        exitCode: 0,
                        text() {
                            return "";
                        },
                    };
                },
            })),
            directory: "/tmp/workspace",
            worktree: "/tmp/workspace",
            client: {},
            project: {},
        });
        const runtimeConfig = {
            provider: {
                cursor: {
                    models: {
                        "gpt-5.2": { name: "User GPT" },
                        "custom-model": { name: "Custom" },
                    },
                },
            },
        };
        await hooks.config?.(runtimeConfig);
        expect(runtimeConfig.provider.cursor.models.auto.name).toContain("Auto");
        expect(runtimeConfig.provider.cursor.models["custom-model"].name).toBe("Custom");
        expect(runtimeConfig.provider.cursor.models["gpt-5.2"].name).toBe("User GPT");
    });
    test("sets chat params only for cursor provider", async () => {
        const hooks = await CursorAuthPlugin({
            $: (() => ({
                quiet() {
                    return this;
                },
                async nothrow() {
                    return {
                        exitCode: 0,
                        text() {
                            return "";
                        },
                    };
                },
            })),
            directory: "/tmp/workspace",
            worktree: "/tmp/workspace",
            client: {},
            project: {},
        });
        const outputA = { options: {} };
        await hooks["chat.params"]?.({
            sessionID: "s1",
            agent: "a1",
            model: { providerID: "cursor", modelID: "auto" },
            provider: {},
            message: {},
        }, outputA);
        expect(outputA.options.baseURL).toBe("http://127.0.0.1:32123/v1");
        expect(outputA.options.apiKey).toBe("cursor-agent");
        const outputB = { options: {} };
        await hooks["chat.params"]?.({
            sessionID: "s2",
            agent: "a1",
            model: { providerID: "openai", modelID: "gpt-5" },
            provider: {},
            message: {},
        }, outputB);
        expect(outputB.options.baseURL).toBe(undefined);
        expect(outputB.options.apiKey).toBe(undefined);
    });
});
//# sourceMappingURL=plugin.model-sync.test.js.map