import fs from "node:fs";
import { CursorStorageError } from "../plugin/errors.js";
import { createLogger } from "./logger.js";
const log = createLogger("db");
function isBunRuntime() {
    return (typeof globalThis.Bun !== "undefined" ||
        typeof process?.versions?.bun === "string");
}
export async function getDbValue(dbPath, key) {
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    try {
        if (isBunRuntime()) {
            const mod = await import("bun:sqlite");
            const Database = mod.Database;
            const db = new Database(dbPath, { readonly: true });
            const row = db.query("SELECT value FROM ItemTable WHERE key = ?").get(key);
            db.close();
            return row?.value ?? null;
        }
        const mod = await import("better-sqlite3");
        const Database = (mod.default ?? mod);
        const db = new Database(dbPath, { readonly: true });
        const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
        const row = stmt.get(key);
        db.close();
        return row?.value ?? null;
    }
    catch (error) {
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
//# sourceMappingURL=db.js.map