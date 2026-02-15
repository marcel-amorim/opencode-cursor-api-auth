export declare function openAIError(status: number, message: string, details?: string): Response;
export declare function createChatCompletionResponse(model: string, content: string): {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
};
export declare function createToolCallsCompletionResponse(model: string, toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
}>): {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
            tool_calls: {
                id: string;
                type: string;
                function: {
                    name: string;
                    arguments: string;
                };
            }[];
        };
        finish_reason: string;
    }[];
};
export declare function createChatCompletionChunk(id: string, created: number, model: string, deltaContent: string, done?: boolean): {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        delta: {
            content: string;
        } | {
            content?: undefined;
        };
        finish_reason: string | null;
    }[];
};
//# sourceMappingURL=openai.d.ts.map