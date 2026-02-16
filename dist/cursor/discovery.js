import { getDbValue, getDbValuesByLike } from "../utils/db.js";
import { getCursorStateDbPath } from "../utils/platform.js";
import { createLogger } from "../utils/logger.js";
const log = createLogger("model-discovery");
const MODEL_DISCOVERY_KEYS = [
    "cursor/lastSingleModelPreference",
    "cursor/bestOfNEnsemblePreferences",
    "composer.composerData",
    "workbench.panel.aichat.view.aichat.chatdata",
    "aiService.prompts",
    "aiService.generations",
];
const MODEL_DISCOVERY_KEY_PATTERNS = ["composerData:%"];
const MODEL_FIELDS = new Set([
    "model",
    "modelid",
    "model_id",
    "modelname",
    "defaultmodel",
    "selectedmodel",
    "chatmodel",
    "underlyingmodel",
    "targetmodel",
]);
const MODEL_HINTS = [
    "gpt",
    "sonnet",
    "claude",
    "gemini",
    "deepseek",
    "llama",
    "mistral",
    "qwen",
    "grok",
    "o1",
    "o3",
    "o4",
];
const MODEL_ID_BLACKLIST = new Set(["default", "none", "null", "undefined"]);
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeModelIdCandidate(value) {
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > 100) {
        return null;
    }
    if (normalized.includes(" ") || normalized.startsWith("http://") || normalized.startsWith("https://")) {
        return null;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/.test(normalized)) {
        return null;
    }
    const lower = normalized.toLowerCase();
    if (MODEL_ID_BLACKLIST.has(lower)) {
        return null;
    }
    return normalized;
}
function looksLikeModelId(value) {
    const normalized = normalizeModelIdCandidate(value);
    if (!normalized) {
        return false;
    }
    const lower = normalized.toLowerCase();
    if (lower === "auto") {
        return true;
    }
    return MODEL_HINTS.some((hint) => lower.includes(hint));
}
function walkForModelIds(value, keyHint, output) {
    if (typeof value === "string") {
        const lowerKey = keyHint ? keyHint.toLowerCase() : "";
        if (lowerKey.length > 0 && MODEL_FIELDS.has(lowerKey)) {
            const candidate = normalizeModelIdCandidate(value);
            if (candidate) {
                output.add(candidate);
            }
            return;
        }
        if (looksLikeModelId(value)) {
            output.add(value.trim());
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            walkForModelIds(item, keyHint, output);
        }
        return;
    }
    if (!isRecord(value)) {
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();
        if (typeof child === "string" && MODEL_FIELDS.has(normalizedKey)) {
            const candidate = normalizeModelIdCandidate(child);
            if (candidate) {
                output.add(candidate);
            }
            continue;
        }
        if (typeof child === "string" && looksLikeModelId(child)) {
            output.add(child.trim());
            continue;
        }
        walkForModelIds(child, normalizedKey, output);
    }
}
export function extractModelIdsFromPayload(payload) {
    const output = new Set();
    walkForModelIds(payload, null, output);
    return [...output].sort((a, b) => a.localeCompare(b));
}
function parseJson(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export async function discoverCursorModels(dbPath = getCursorStateDbPath()) {
    const keysChecked = [];
    try {
        const models = new Set();
        for (const key of MODEL_DISCOVERY_KEYS) {
            keysChecked.push(key);
            const raw = await getDbValue(dbPath, key);
            if (!raw) {
                continue;
            }
            const parsed = parseJson(raw);
            if (!parsed) {
                continue;
            }
            for (const model of extractModelIdsFromPayload(parsed)) {
                models.add(model);
            }
        }
        for (const pattern of MODEL_DISCOVERY_KEY_PATTERNS) {
            keysChecked.push(pattern);
            const rows = await getDbValuesByLike(dbPath, pattern, 300);
            for (const row of rows) {
                const parsed = parseJson(row.value);
                if (!parsed) {
                    continue;
                }
                for (const model of extractModelIdsFromPayload(parsed)) {
                    models.add(model);
                }
            }
        }
        const normalized = [...models].sort((a, b) => a.localeCompare(b));
        if (normalized.length === 0) {
            return {
                type: "empty",
                keysChecked,
            };
        }
        return {
            type: "success",
            models: normalized,
            keysChecked,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("Model discovery failed", {
            message,
            dbPath,
        });
        return {
            type: "failed",
            keysChecked,
            error: message,
        };
    }
}
//# sourceMappingURL=discovery.js.map