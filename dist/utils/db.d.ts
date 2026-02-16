declare const DB_TABLES: readonly ["ItemTable", "cursorDiskKV"];
type DbTable = (typeof DB_TABLES)[number];
export declare function getDbValue(dbPath: string, key: string): Promise<string | null>;
export declare function getDbValuesByLike(dbPath: string, pattern: string, limit?: number): Promise<Array<{
    table: DbTable;
    key: string;
    value: string;
}>>;
export {};
//# sourceMappingURL=db.d.ts.map