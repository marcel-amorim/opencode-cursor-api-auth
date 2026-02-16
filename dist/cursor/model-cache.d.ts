import type { CursorPluginConfig } from "../config/schema.js";
type ModelCacheSource = "discovered" | "cache" | "defaults";
export interface ModelCacheEntry {
    version: 1;
    updatedAt: number;
    models: string[];
    source: ModelCacheSource;
}
export type ModelCacheReadResult = {
    type: "hit";
    path: string;
    entry: ModelCacheEntry;
} | {
    type: "miss";
    path: string;
    reason: "missing" | "invalid" | "expired";
};
export declare function resolveModelCachePath(workspaceDirectory: string, cachePath: string): string;
export declare function readModelCache(workspaceDirectory: string, config: CursorPluginConfig): Promise<ModelCacheReadResult>;
export declare function writeModelCache(workspaceDirectory: string, config: CursorPluginConfig, models: string[], source: ModelCacheSource): Promise<void>;
export {};
//# sourceMappingURL=model-cache.d.ts.map