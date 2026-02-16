export const DEFAULT_MODEL_ALIASES = {
    "gpt-5": "gpt-5.2",
    "sonnet-4": "sonnet-4.5",
};
export const DEFAULT_FALLBACK_MODELS = ["auto", "gpt-5.2", "sonnet-4.5", "sonnet-4.5-thinking"];
export const MODEL_MERGE_PRECEDENCE = ["user", "discovered", "defaults"];
export const DEFAULT_MODEL_DISCOVERY_CACHE_PATH = ".cursor-models-cache.json";
export const DEFAULT_MODEL_DISCOVERY_CACHE_TTL_MS = 86_400_000;
//# sourceMappingURL=defaults.js.map