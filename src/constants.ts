import { getCursorPluginConfig } from "./config/loader.js";

const config = getCursorPluginConfig();

export const CURSOR_PROVIDER_ID = config.providerId;
export const CURSOR_API_BASE_URL = config.apiBaseUrl;
export const CURSOR_PROXY_HOST = config.proxyHost;
export const CURSOR_PROXY_DEFAULT_PORT = config.proxyPort;
export const CURSOR_PROXY_DEFAULT_BASE_URL = `http://${config.proxyHost}:${config.proxyPort}/v1`;
export const CURSOR_MODEL_ALIASES = config.modelAliases;
export const CURSOR_TOOL_AUTO_MODEL = config.toolAutoModel;
