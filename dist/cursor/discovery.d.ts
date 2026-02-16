export type ModelDiscoveryResult = {
    type: "success";
    models: string[];
    keysChecked: string[];
} | {
    type: "empty";
    keysChecked: string[];
} | {
    type: "failed";
    keysChecked: string[];
    error: string;
};
export declare function extractModelIdsFromPayload(payload: unknown): string[];
export declare function discoverCursorModels(dbPath?: string): Promise<ModelDiscoveryResult>;
//# sourceMappingURL=discovery.d.ts.map