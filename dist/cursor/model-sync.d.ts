import type { CursorPluginConfig } from "../config/schema.js";
export type ModelSyncSource = "discovered" | "cache" | "defaults";
export interface ModelSyncResult {
    source: ModelSyncSource;
    models: string[];
    warnings: string[];
}
export declare function syncCursorModels(workspaceDirectory: string, config: CursorPluginConfig): Promise<ModelSyncResult>;
export declare function buildRuntimeProviderModels(userModels: Record<string, unknown> | undefined, syncedModels: string[], defaultModels: string[]): Record<string, Record<string, unknown>>;
//# sourceMappingURL=model-sync.d.ts.map