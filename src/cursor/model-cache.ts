import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CursorPluginConfig } from "../config/schema.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("model-cache");

type ModelCacheSource = "discovered" | "cache" | "defaults";

export interface ModelCacheEntry {
  version: 1;
  updatedAt: number;
  models: string[];
  source: ModelCacheSource;
}

export type ModelCacheReadResult =
  | {
      type: "hit";
      path: string;
      entry: ModelCacheEntry;
    }
  | {
      type: "miss";
      path: string;
      reason: "missing" | "invalid" | "expired";
    };

function normalizeModelList(models: string[]): string[] {
  return [...new Set(models.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isModelCacheEntry(value: unknown): value is ModelCacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.updatedAt !== "number" || !Array.isArray(record.models) || typeof record.source !== "string") {
    return false;
  }

  return record.models.every((item) => typeof item === "string");
}

export function resolveModelCachePath(_workspaceDirectory: string, cachePath: string): string {
  if (path.isAbsolute(cachePath)) {
    return cachePath;
  }

  const homeDirectory = os.homedir().trim();
  if (cachePath.startsWith("~/") && homeDirectory.length > 0) {
    return path.join(homeDirectory, cachePath.slice(2));
  }

  const globalCacheDirectory = homeDirectory.length > 0
    ? path.join(homeDirectory, ".opencode")
    : path.join(os.tmpdir(), "opencode");
  return path.join(globalCacheDirectory, cachePath);
}

export async function readModelCache(workspaceDirectory: string, config: CursorPluginConfig): Promise<ModelCacheReadResult> {
  const cachePath = resolveModelCachePath(workspaceDirectory, config.modelDiscoveryCachePath);

  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isModelCacheEntry(parsed)) {
      return {
        type: "miss",
        path: cachePath,
        reason: "invalid",
      };
    }

    const age = Date.now() - parsed.updatedAt;
    if (age > config.modelDiscoveryCacheTtlMs) {
      return {
        type: "miss",
        path: cachePath,
        reason: "expired",
      };
    }

    return {
      type: "hit",
      path: cachePath,
      entry: {
        ...parsed,
        models: normalizeModelList(parsed.models),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return {
        type: "miss",
        path: cachePath,
        reason: "missing",
      };
    }

    log.warn("Model cache read failed", {
      cachePath,
      message,
    });
    return {
      type: "miss",
      path: cachePath,
      reason: "invalid",
    };
  }
}

export async function writeModelCache(
  workspaceDirectory: string,
  config: CursorPluginConfig,
  models: string[],
  source: ModelCacheSource,
): Promise<void> {
  const cachePath = resolveModelCachePath(workspaceDirectory, config.modelDiscoveryCachePath);

  const entry: ModelCacheEntry = {
    version: 1,
    updatedAt: Date.now(),
    models: normalizeModelList(models),
    source,
  };

  try {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("Model cache write failed", {
      cachePath,
      message,
    });
  }
}
