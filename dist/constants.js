import { getCursorPluginConfig } from "./config/loader.js";
import { MODEL_MERGE_PRECEDENCE } from "./config/defaults.js";
const config = getCursorPluginConfig();
export const CURSOR_PROVIDER_ID = config.providerId;
export const CURSOR_PROXY_HOST = config.proxyHost;
export const CURSOR_PROXY_DEFAULT_PORT = config.proxyPort;
export const CURSOR_PROXY_DEFAULT_BASE_URL = `http://${config.proxyHost}:${config.proxyPort}/v1`;
export const CURSOR_MODEL_ALIASES = config.modelAliases;
export const CURSOR_TOOL_AUTO_MODEL = config.toolAutoModel;
export const CURSOR_MODEL_DISCOVERY_ENABLED = config.modelDiscoveryEnabled;
export const CURSOR_MODEL_DISCOVERY_CACHE_PATH = config.modelDiscoveryCachePath;
export const CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS = config.modelDiscoveryCacheTtlMs;
export const CURSOR_FALLBACK_MODELS = config.fallbackModels;
export const CURSOR_MODEL_MERGE_PRECEDENCE = MODEL_MERGE_PRECEDENCE;
//# sourceMappingURL=constants.js.map