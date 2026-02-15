export interface ToolDef {
    type?: string;
    function?: {
        name?: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}
export type ToolCallPlan = {
    action: "final";
    content: string;
} | {
    action: "tool_call";
    tool_calls: Array<{
        name: string;
        arguments: Record<string, unknown>;
    }>;
};
export interface ExtractedChatCompletionInput {
    prompt: string;
    model?: string;
    stream: boolean;
    tools: ToolDef[];
}
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
//# sourceMappingURL=types.d.ts.map