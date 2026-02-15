import fs from "node:fs";
import { CursorStorageError } from "../plugin/errors.js";
import { createLogger } from "./logger.js";

const log = createLogger("db");

function isBunRuntime(): boolean {
  return (
    typeof (globalThis as any).Bun !== "undefined" ||
    typeof (process as any)?.versions?.bun === "string"
  );
}

export async function getDbValue(dbPath: string, key: string): Promise<string | null> {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    if (isBunRuntime()) {
      const mod = await import("bun:sqlite");
      const Database = (mod as any).Database as any;
      const db = new Database(dbPath, { readonly: true });
      const row = db.query("SELECT value FROM ItemTable WHERE key = ?").get(key) as
        | { value?: string }
        | undefined;
      db.close();
      return row?.value ?? null;
    }

    const mod = await import("better-sqlite3");
    const Database = ((mod as any).default ?? mod) as any;
    const db = new Database(dbPath, { readonly: true });
    const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
    const row = stmt.get(key) as { value?: string } | undefined;
    db.close();
    return row?.value ?? null;
  } catch (error) {
    const wrappedError = new CursorStorageError("Failed to read Cursor DB", dbPath, {
      cause: error instanceof Error ? error.message : String(error),
      key,
    });
    log.warn(wrappedError.message, {
      path: dbPath,
      key,
      code: wrappedError.code,
    });
    return null;
  }
}
