export declare function normalizeModelIds(models: string[]): string[];
export declare function mergeModelIds(params: {
    userModels: string[];
    discoveredModels: string[];
    defaultModels: string[];
}): string[];
export declare function mergeProviderModels(userModels: Record<string, unknown> | undefined, discoveredModels: string[], defaultModels: string[]): Record<string, Record<string, unknown>>;
//# sourceMappingURL=model-merge.d.ts.map