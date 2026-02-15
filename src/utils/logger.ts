import { getCursorPluginConfig } from "../config/loader.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveLogLevel(): LogLevel {
  const fromConfig = getCursorPluginConfig().logLevel;
  if (fromConfig in LOG_LEVEL_PRIORITY) {
    return fromConfig;
  }
  return "warn";
}

function shouldLog(target: LogLevel, current: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[target] >= LOG_LEVEL_PRIORITY[current];
}

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta || Object.keys(meta).length === 0) {
    return undefined;
  }
  return meta;
}

export function createLogger(scope: string) {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
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
    debug(message: string, meta?: Record<string, unknown>) {
      write("debug", message, meta);
    },
    info(message: string, meta?: Record<string, unknown>) {
      write("info", message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      write("warn", message, meta);
    },
    error(message: string, meta?: Record<string, unknown>) {
      write("error", message, meta);
    },
  };
}
