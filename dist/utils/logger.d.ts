export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export declare function createLogger(scope: string): {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
};
//# sourceMappingURL=logger.d.ts.map