import { createLogger } from "../utils/logger.js";
import { discoverCursorModels } from "./discovery.js";
import { readModelCache, writeModelCache } from "./model-cache.js";
import { mergeModelIds, mergeProviderModels, normalizeModelIds } from "./model-merge.js";
const log = createLogger("model-sync");
export async function syncCursorModels(workspaceDirectory, config) {
    const warnings = [];
    const defaultModels = normalizeModelIds(config.fallbackModels);
    if (!config.modelDiscoveryEnabled) {
        return {
            source: "defaults",
            models: mergeModelIds({
                userModels: [],
                discoveredModels: [],
                defaultModels,
            }),
            warnings,
        };
    }
    const discovery = await discoverCursorModels();
    if (discovery.type === "success" && discovery.models.length > 0) {
        const merged = mergeModelIds({
            userModels: [],
            discoveredModels: discovery.models,
            defaultModels,
        });
        await writeModelCache(workspaceDirectory, config, merged, "discovered");
        log.info("Model startup sync completed", {
            source: "discovered",
            count: merged.length,
        });
        return {
            source: "discovered",
            models: merged,
            warnings,
        };
    }
    if (discovery.type === "failed") {
        warnings.push(`discovery_failed:${discovery.error}`);
    }
    const cache = await readModelCache(workspaceDirectory, config);
    if (cache.type === "hit") {
        if (cache.entry.models.length > 0) {
            const merged = mergeModelIds({
                userModels: [],
                discoveredModels: cache.entry.models,
                defaultModels,
            });
            log.info("Model startup sync completed", {
                source: "cache",
                count: merged.length,
            });
            return {
                source: "cache",
                models: merged,
                warnings,
            };
        }
        warnings.push("cache_empty");
    }
    else {
        warnings.push(`cache_${cache.reason}`);
    }
    const merged = mergeModelIds({
        userModels: [],
        discoveredModels: [],
        defaultModels,
    });
    const cacheReason = cache.type === "hit" ? "empty" : cache.reason;
    await writeModelCache(workspaceDirectory, config, merged, "defaults");
    log.warn("Model startup sync fell back to defaults", {
        reason: cacheReason,
        warnings,
    });
    return {
        source: "defaults",
        models: merged,
        warnings,
    };
}
export function buildRuntimeProviderModels(userModels, syncedModels, defaultModels) {
    return mergeProviderModels(userModels, syncedModels, defaultModels);
}
//# sourceMappingURL=model-sync.js.map