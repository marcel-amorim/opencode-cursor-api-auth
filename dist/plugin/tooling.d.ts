import type { ExtractedChatCompletionInput, ToolCallPlan, ToolDef } from "./types.js";
export declare function normalizeCursorAgentModel(model: string | undefined, aliases: Record<string, string>): string;
export declare function extractPromptFromChatCompletions(body: unknown): ExtractedChatCompletionInput;
export declare function parseToolCallPlan(output: string): ToolCallPlan | null;
export declare function buildToolCallingPrompt(conversation: string, tools: ToolDef[], workspaceDirectory: string): string;
//# sourceMappingURL=tooling.d.ts.map