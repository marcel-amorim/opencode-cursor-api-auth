import { getCursorStateDbPath } from "../utils/platform.js";
import { getDbValue } from "../utils/db.js";
import { decodeJWT } from "../utils/jwt.js";
import type { CursorAuthResult } from "./types.js";
import { CursorStorageError } from "../plugin/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("local-auth");

export async function loginLocal(): Promise<CursorAuthResult> {
  const dbPath = getCursorStateDbPath();

  try {
    const accessToken = await getDbValue(dbPath, "cursorAuth/accessToken");
    const refreshToken = await getDbValue(dbPath, "cursorAuth/refreshToken");
    let email = await getDbValue(dbPath, "cursorAuth/cachedEmail");

    if (!accessToken) {
      return {
        type: "failed",
        error: "No access token found in local Cursor installation.",
      };
    }

    if (!email) {
      const payload = decodeJWT(accessToken);
      if (payload && typeof payload.email === "string") {
        email = payload.email;
      }
    }

    let expiresAt: number | undefined;
    const payload = decodeJWT(accessToken);
    if (payload && typeof payload.exp === "number") {
      expiresAt = payload.exp * 1000;
    }

    return {
      type: "success",
      source: "local",
      token: {
        accessToken,
        refreshToken: refreshToken || "",
        email: email || undefined,
        expiresAt,
      },
    };
  } catch (error) {
    const wrappedError = new CursorStorageError("Failed to read local Cursor auth state", dbPath, {
      cause: error instanceof Error ? error.message : String(error),
    });
    log.warn("Local auth lookup failed", {
      path: dbPath,
      message: wrappedError.message,
    });
    return {
      type: "failed",
      error: wrappedError.message,
    };
  }
}
