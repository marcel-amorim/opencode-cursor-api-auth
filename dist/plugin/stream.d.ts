import type { CursorStreamEvent } from "./types.js";
export declare function parseCursorStreamLine(line: string): CursorStreamEvent | null;
export declare function parseCursorStreamFallbackLine(line: string): CursorStreamEvent | null;
export declare function mergeAssistantContent(current: string, incoming: string): {
    next: string;
    emit: string;
};
export declare function sanitizeThinkingText(text: string, inFence: boolean, inPlanJson: boolean): {
    text: string;
    inFence: boolean;
    inPlanJson: boolean;
};
//# sourceMappingURL=stream.d.ts.map