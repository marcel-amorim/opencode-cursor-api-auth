export class CursorPluginError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CursorPluginError";
    this.code = code;
    this.details = details;
  }
}

export class CursorProxyError extends CursorPluginError {
  readonly status: number;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "CURSOR_PROXY_ERROR", details);
    this.name = "CursorProxyError";
    this.status = status;
  }
}

export class CursorAuthError extends CursorPluginError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CURSOR_AUTH_ERROR", details);
    this.name = "CursorAuthError";
  }
}

export class CursorCommandError extends CursorPluginError {
  readonly command: string;
  readonly exitCode: number;

  constructor(command: string, exitCode: number, details?: Record<string, unknown>) {
    super(`Command failed: ${command} (exit ${exitCode})`, "CURSOR_COMMAND_ERROR", details);
    this.name = "CursorCommandError";
    this.command = command;
    this.exitCode = exitCode;
  }
}

export class CursorStorageError extends CursorPluginError {
  readonly path: string;

  constructor(message: string, path: string, details?: Record<string, unknown>) {
    super(message, "CURSOR_STORAGE_ERROR", details);
    this.name = "CursorStorageError";
    this.path = path;
  }
}
