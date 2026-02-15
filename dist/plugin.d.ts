import type { Plugin } from "@opencode-ai/plugin";
export type CursorStreamEvent = {
    type: "thinking";
    text: string;
} | {
    type: "content";
    text: string;
} | {
    type: "result";
    text: string;
};
export declare function parseCursorStreamLine(line: string): CursorStreamEvent | null;
export declare function ensureCursorProxyServer(workspaceDirectory: string): Promise<string>;
export declare const CursorAuthPlugin: Plugin;
//# sourceMappingURL=plugin.d.ts.map