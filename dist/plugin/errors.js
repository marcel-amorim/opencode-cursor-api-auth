export class CursorPluginError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.name = "CursorPluginError";
        this.code = code;
        this.details = details;
    }
}
export class CursorProxyError extends CursorPluginError {
    status;
    constructor(message, status, details) {
        super(message, "CURSOR_PROXY_ERROR", details);
        this.name = "CursorProxyError";
        this.status = status;
    }
}
export class CursorAuthError extends CursorPluginError {
    constructor(message, details) {
        super(message, "CURSOR_AUTH_ERROR", details);
        this.name = "CursorAuthError";
    }
}
export class CursorCommandError extends CursorPluginError {
    command;
    exitCode;
    constructor(command, exitCode, details) {
        super(`Command failed: ${command} (exit ${exitCode})`, "CURSOR_COMMAND_ERROR", details);
        this.name = "CursorCommandError";
        this.command = command;
        this.exitCode = exitCode;
    }
}
export class CursorStorageError extends CursorPluginError {
    path;
    constructor(message, path, details) {
        super(message, "CURSOR_STORAGE_ERROR", details);
        this.name = "CursorStorageError";
        this.path = path;
    }
}
//# sourceMappingURL=errors.js.map