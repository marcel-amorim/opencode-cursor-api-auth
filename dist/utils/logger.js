import { getCursorPluginConfig } from "../config/loader.js";
const LOG_LEVEL_PRIORITY = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100,
};
function resolveLogLevel() {
    const fromConfig = getCursorPluginConfig().logLevel;
    if (fromConfig in LOG_LEVEL_PRIORITY) {
        return fromConfig;
    }
    return "warn";
}
function shouldLog(target, current) {
    return LOG_LEVEL_PRIORITY[target] >= LOG_LEVEL_PRIORITY[current];
}
function safeMeta(meta) {
    if (!meta || Object.keys(meta).length === 0) {
        return undefined;
    }
    return meta;
}
export function createLogger(scope) {
    const write = (level, message, meta) => {
        const currentLevel = resolveLogLevel();
        if (!shouldLog(level, currentLevel)) {
            return;
        }
        const prefix = `[cursor-auth:${scope}]`;
        const payload = safeMeta(meta);
        if (level === "error") {
            console.error(prefix, message, payload ?? "");
            return;
        }
        if (level === "warn") {
            console.warn(prefix, message, payload ?? "");
            return;
        }
        if (level === "info") {
            console.info(prefix, message, payload ?? "");
            return;
        }
        console.debug(prefix, message, payload ?? "");
    };
    return {
        debug(message, meta) {
            write("debug", message, meta);
        },
        info(message, meta) {
            write("info", message, meta);
        },
        warn(message, meta) {
            write("warn", message, meta);
        },
        error(message, meta) {
            write("error", message, meta);
        },
    };
}
//# sourceMappingURL=logger.js.map