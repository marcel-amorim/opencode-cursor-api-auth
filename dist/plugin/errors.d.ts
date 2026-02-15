export declare class CursorPluginError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
export declare class CursorProxyError extends CursorPluginError {
    readonly status: number;
    constructor(message: string, status: number, details?: Record<string, unknown>);
}
export declare class CursorAuthError extends CursorPluginError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class CursorCommandError extends CursorPluginError {
    readonly command: string;
    readonly exitCode: number;
    constructor(command: string, exitCode: number, details?: Record<string, unknown>);
}
export declare class CursorStorageError extends CursorPluginError {
    readonly path: string;
    constructor(message: string, path: string, details?: Record<string, unknown>);
}
//# sourceMappingURL=errors.d.ts.map