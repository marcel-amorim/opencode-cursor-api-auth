import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { CursorStorageError } from "../plugin/errors.js";
import { createLogger } from "./logger.js";

const log = createLogger("db");
const DB_TABLES = ["ItemTable", "cursorDiskKV"] as const;

type DbTable = (typeof DB_TABLES)[number];

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function readDbValueViaSqliteCli(dbPath: string, table: DbTable, key: string): string | null {
  try {
    const query = `SELECT value FROM ${table} WHERE key = ${quoteSqlString(key)} LIMIT 1;`;
    const output = execFileSync("/usr/bin/sqlite3", ["-readonly", "-noheader", dbPath, query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function listDbKeysByLikeViaSqliteCli(dbPath: string, table: DbTable, pattern: string, limit: number): string[] {
  try {
    const query = `SELECT key FROM ${table} WHERE key LIKE ${quoteSqlString(pattern)} LIMIT ${Math.max(1, limit)};`;
    const output = execFileSync("/usr/bin/sqlite3", ["-readonly", "-noheader", dbPath, query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readDbValueViaPython(dbPath: string, table: DbTable, key: string): string | null {
  const script = [
    "import sqlite3,sys",
    "db_path,table,key=sys.argv[1],sys.argv[2],sys.argv[3]",
    "try:",
    " conn=sqlite3.connect(db_path)",
    " cur=conn.cursor()",
    " row=cur.execute(f\"SELECT value FROM {table} WHERE key = ?\", (key,)).fetchone()",
    " if row and row[0] is not None:",
    "  sys.stdout.write(str(row[0]))",
    "except Exception:",
    " pass",
    "finally:",
    " try:",
    "  conn.close()",
    " except Exception:",
    "  pass",
  ].join("\n");

  try {
    const output = execFileSync("python3", ["-c", script, dbPath, table, key], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function listDbKeysByLikeViaPython(dbPath: string, table: DbTable, pattern: string, limit: number): string[] {
  const script = [
    "import sqlite3,sys",
    "db_path,table,pattern,limit=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4])",
    "try:",
    " conn=sqlite3.connect(db_path)",
    " cur=conn.cursor()",
    " rows=cur.execute(f\"SELECT key FROM {table} WHERE key LIKE ? LIMIT ?\", (pattern, limit)).fetchall()",
    " for row in rows:",
    "  if row and row[0] is not None:",
    "   sys.stdout.write(str(row[0])+\"\\n\")",
    "except Exception:",
    " pass",
    "finally:",
    " try:",
    "  conn.close()",
    " except Exception:",
    "  pass",
  ].join("\n");

  try {
    const output = execFileSync("python3", ["-c", script, dbPath, table, pattern, String(Math.max(1, limit))], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

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

  let lastError: unknown;

  if (isBunRuntime()) {
    try {
      const mod = await import("bun:sqlite");
      const Database = (mod as any).Database as any;
      const db = new Database(dbPath, { readonly: true });

      try {
        for (const table of DB_TABLES) {
          try {
            const query = `SELECT value FROM ${table} WHERE key = ?`;
            const row = db.query(query).get(key) as { value?: string } | undefined;
            if (typeof row?.value === "string") {
              return row.value;
            }
          } catch {
          }
        }
      } finally {
        db.close();
      }
    } catch (error) {
      lastError = error;
      log.debug("bun:sqlite read failed, falling back to better-sqlite3", {
        path: dbPath,
        key,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const mod = await import("better-sqlite3");
    const Database = ((mod as any).default ?? mod) as any;
    const db = new Database(dbPath, { readonly: true });

    try {
      for (const table of DB_TABLES) {
        try {
          const query = `SELECT value FROM ${table} WHERE key = ?`;
          const stmt = db.prepare(query);
          const row = stmt.get(key) as { value?: string } | undefined;
          if (typeof row?.value === "string") {
            return row.value;
          }
        } catch {
        }
      }
    } finally {
      db.close();
    }
  } catch (error) {
    lastError = error;
  }

  for (const table of DB_TABLES) {
    const cliValue = readDbValueViaSqliteCli(dbPath, table, key);
    if (typeof cliValue === "string") {
      return cliValue;
    }

    const pythonValue = readDbValueViaPython(dbPath, table, key);
    if (typeof pythonValue === "string") {
      return pythonValue;
    }
  }

  if (lastError) {
    const wrappedError = new CursorStorageError("Failed to read Cursor DB", dbPath, {
      cause: lastError instanceof Error ? lastError.message : String(lastError),
      key,
    });

    const meta = {
      path: dbPath,
      key,
      code: wrappedError.code,
    };

    if (key.startsWith("cursorAuth/")) {
      log.warn(wrappedError.message, meta);
    }
  }

  return null;
}

export async function getDbValuesByLike(
  dbPath: string,
  pattern: string,
  limit = 100,
): Promise<Array<{ table: DbTable; key: string; value: string }>> {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const rows: Array<{ table: DbTable; key: string; value: string }> = [];

  if (isBunRuntime()) {
    try {
      const mod = await import("bun:sqlite");
      const Database = (mod as any).Database as any;
      const db = new Database(dbPath, { readonly: true });

      try {
        for (const table of DB_TABLES) {
          const query = `SELECT key, value FROM ${table} WHERE key LIKE ? LIMIT ?`;
          try {
            const result = db.query(query).all(pattern, limit) as Array<{ key?: string; value?: string }>;
            for (const row of result) {
              if (typeof row.key === "string" && typeof row.value === "string") {
                rows.push({
                  table,
                  key: row.key,
                  value: row.value,
                });
              }
            }
          } catch {
          }
        }
      } finally {
        db.close();
      }

      if (rows.length > 0) {
        return rows;
      }
    } catch (error) {
      log.debug("bun:sqlite pattern query failed, falling back to better-sqlite3", {
        path: dbPath,
        pattern,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const mod = await import("better-sqlite3");
    const Database = ((mod as any).default ?? mod) as any;
    const db = new Database(dbPath, { readonly: true });

    try {
      for (const table of DB_TABLES) {
        const query = `SELECT key, value FROM ${table} WHERE key LIKE ? LIMIT ?`;
        try {
          const stmt = db.prepare(query);
          const result = stmt.all(pattern, limit) as Array<{ key?: string; value?: string }>;
          for (const row of result) {
            if (typeof row.key === "string" && typeof row.value === "string") {
              rows.push({
                table,
                key: row.key,
                value: row.value,
              });
            }
          }
        } catch {
        }
      }
    } finally {
      db.close();
    }

    if (rows.length > 0) {
      return rows;
    }
  } catch (error) {
    log.debug("Failed to query Cursor DB by pattern", {
      path: dbPath,
      pattern,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  for (const table of DB_TABLES) {
    let keys = listDbKeysByLikeViaSqliteCli(dbPath, table, pattern, limit);
    if (keys.length === 0) {
      keys = listDbKeysByLikeViaPython(dbPath, table, pattern, limit);
    }

    for (const key of keys) {
      const value = readDbValueViaSqliteCli(dbPath, table, key) ?? readDbValueViaPython(dbPath, table, key);
      if (typeof value === "string") {
        rows.push({ table, key, value });
      }
    }
  }

  return rows;
}
