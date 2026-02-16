function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function normalizeModelIds(models) {
    return [...new Set(models.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function formatModelName(modelId) {
    const formatted = modelId
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replaceAll("/", " ")
        .trim();
    if (formatted.length === 0) {
        return modelId;
    }
    return formatted
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
}
function modelRecordFor(modelId) {
    return {
        name: `Cursor ${formatModelName(modelId)}`,
    };
}
export function mergeModelIds(params) {
    const merged = [...params.defaultModels, ...params.discoveredModels, ...params.userModels];
    const normalized = normalizeModelIds(merged);
    if (!normalized.includes("auto")) {
        normalized.unshift("auto");
    }
    return normalized;
}
export function mergeProviderModels(userModels, discoveredModels, defaultModels) {
    const merged = {};
    for (const modelId of normalizeModelIds(defaultModels)) {
        merged[modelId] = modelRecordFor(modelId);
    }
    for (const modelId of normalizeModelIds(discoveredModels)) {
        merged[modelId] = modelRecordFor(modelId);
    }
    if (isRecord(userModels)) {
        for (const [modelId, definition] of Object.entries(userModels)) {
            if (isRecord(definition)) {
                merged[modelId] = definition;
            }
        }
    }
    if (!merged.auto) {
        merged.auto = modelRecordFor("auto");
    }
    return merged;
}
//# sourceMappingURL=model-merge.js.map