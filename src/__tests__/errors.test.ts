import { describe, expect, test } from "bun:test";
import {
  CursorAuthError,
  CursorCommandError,
  CursorPluginError,
  CursorProxyError,
  CursorStorageError,
} from "../plugin/errors.js";

describe("plugin errors", () => {
  test("creates base plugin error", () => {
    const error = new CursorPluginError("base", "BASE", { foo: "bar" });

    expect(error.name).toBe("CursorPluginError");
    expect(error.code).toBe("BASE");
    expect(error.details).toEqual({ foo: "bar" });
  });

  test("creates proxy error with status", () => {
    const error = new CursorProxyError("proxy failed", 502);

    expect(error.name).toBe("CursorProxyError");
    expect(error.code).toBe("CURSOR_PROXY_ERROR");
    expect(error.status).toBe(502);
  });

  test("creates auth and storage errors", () => {
    const authError = new CursorAuthError("auth failed");
    const storageError = new CursorStorageError("storage failed", "/tmp/auth.db");

    expect(authError.code).toBe("CURSOR_AUTH_ERROR");
    expect(storageError.code).toBe("CURSOR_STORAGE_ERROR");
    expect(storageError.path).toBe("/tmp/auth.db");
  });

  test("creates command error with command details", () => {
    const error = new CursorCommandError("cursor-agent whoami", 1);

    expect(error.code).toBe("CURSOR_COMMAND_ERROR");
    expect(error.command).toBe("cursor-agent whoami");
    expect(error.exitCode).toBe(1);
  });
});
