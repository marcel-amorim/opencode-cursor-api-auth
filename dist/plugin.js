import { getCursorPluginConfig } from "./config/loader.js";
import { buildRuntimeProviderModels, syncCursorModels } from "./cursor/model-sync.js";
import { CursorCommandError } from "./plugin/errors.js";
import { ensureCursorProxyServer } from "./plugin/proxy.js";
import { parseCursorStreamLine } from "./plugin/stream.js";
import { createLogger } from "./utils/logger.js";
const log = createLogger("plugin");
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
async function authorizeCursorAgent($) {
    const check = await $ `cursor-agent --version`.quiet().nothrow();
    if (check.exitCode !== 0) {
        const error = new CursorCommandError("cursor-agent --version", check.exitCode, {
            output: check.text(),
        });
        log.warn("cursor-agent is unavailable", { message: error.message });
        return { type: "failed" };
    }
    const whoami = await $ `cursor-agent whoami`.quiet().nothrow();
    if (whoami.exitCode !== 0) {
        const error = new CursorCommandError("cursor-agent whoami", whoami.exitCode, {
            output: whoami.text(),
        });
        log.warn("cursor-agent whoami failed", { message: error.message });
        return { type: "failed" };
    }
    if (whoami.text().includes("Not logged in")) {
        const login = await $ `cursor-agent login`.nothrow();
        if (login.exitCode !== 0) {
            const error = new CursorCommandError("cursor-agent login", login.exitCode, {
                output: login.text(),
            });
            log.warn("cursor-agent login failed", { message: error.message });
            return { type: "failed" };
        }
    }
    return {
        type: "success",
        key: "cursor-agent",
    };
}
export { parseCursorStreamLine, ensureCursorProxyServer };
export const CursorAuthPlugin = async ({ $, directory }) => {
    const config = getCursorPluginConfig();
    const proxyBaseURL = await ensureCursorProxyServer(directory, config);
    const modelSync = await syncCursorModels(directory, config);
    return {
        async config(opencodeConfig) {
            if (!config.modelDiscoveryEnabled || !isRecord(opencodeConfig)) {
                return;
            }
            let providers;
            if (isRecord(opencodeConfig.provider)) {
                providers = opencodeConfig.provider;
            }
            else {
                providers = {};
                opencodeConfig.provider = providers;
            }
            let providerConfig;
            if (isRecord(providers[config.providerId])) {
                providerConfig = providers[config.providerId];
            }
            else {
                providerConfig = {};
                providers[config.providerId] = providerConfig;
            }
            const existingModels = isRecord(providerConfig.models) ? providerConfig.models : undefined;
            providerConfig.models = buildRuntimeProviderModels(existingModels, modelSync.models, config.fallbackModels);
            if (modelSync.warnings.length > 0) {
                log.warn("Startup model sync completed with warnings", {
                    source: modelSync.source,
                    warnings: modelSync.warnings,
                });
            }
        },
        auth: {
            provider: config.providerId,
            async loader(_getAuth) {
                return {};
            },
            methods: [
                {
                    label: "Login via cursor-agent (opens browser)",
                    type: "api",
                    authorize: async () => authorizeCursorAgent($),
                },
            ],
        },
        async "chat.params"(input, output) {
            if (input.model.providerID !== config.providerId) {
                return;
            }
            output.options.baseURL = proxyBaseURL;
            output.options.apiKey = output.options.apiKey || "cursor-agent";
        },
    };
};
//# sourceMappingURL=plugin.js.map