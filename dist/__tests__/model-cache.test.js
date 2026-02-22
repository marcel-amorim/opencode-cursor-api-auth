import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCursorPluginConfigFromEnv } from "../config/loader.js";
import { readModelCache, resolveModelCachePath, writeModelCache } from "../cursor/model-cache.js";
function createConfig(cachePath) {
    return createCursorPluginConfigFromEnv({
        CURSOR_MODEL_DISCOVERY_CACHE_PATH: cachePath,
        CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS: "60000",
    });
}
describe("model cache", () => {
    test("resolves relative cache path under global opencode directory", () => {
        const resolved = resolveModelCachePath("/workspace/ignored", "models-cache.json");
        const homeDirectory = os.homedir().trim();
        const expectedBaseDirectory = homeDirectory.length > 0
            ? path.join(homeDirectory, ".opencode")
            : path.join(os.tmpdir(), "opencode");
        expect(resolved).toBe(path.join(expectedBaseDirectory, "models-cache.json"));
    });
    test("writes and reads cache entry", async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), "cursor-model-cache-"));
        const config = createConfig(path.join(tempDir, "models-cache.json"));
        await writeModelCache(tempDir, config, ["gpt-5.2", "auto"], "discovered");
        const result = await readModelCache(tempDir, config);
        expect(result.type).toBe("hit");
        if (result.type === "hit") {
            expect(result.entry.models).toEqual(["auto", "gpt-5.2"]);
            expect(result.entry.source).toBe("discovered");
        }
        await rm(tempDir, { recursive: true, force: true });
    });
    test("returns expired for stale cache entries", async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), "cursor-model-cache-"));
        const config = createConfig(path.join(tempDir, "models-cache.json"));
        const cachePath = resolveModelCachePath(tempDir, config.modelDiscoveryCachePath);
        writeFileSync(cachePath, JSON.stringify({
            version: 1,
            updatedAt: Date.now() - 120000,
            models: ["auto", "gpt-5.2"],
            source: "discovered",
        }), "utf8");
        const result = await readModelCache(tempDir, config);
        expect(result.type).toBe("miss");
        if (result.type === "miss") {
            expect(result.reason).toBe("expired");
        }
        await rm(tempDir, { recursive: true, force: true });
    });
    test("returns invalid for corrupt cache payload", async () => {
        const tempDir = mkdtempSync(path.join(os.tmpdir(), "cursor-model-cache-"));
        const config = createConfig(path.join(tempDir, "models-cache.json"));
        const cachePath = resolveModelCachePath(tempDir, config.modelDiscoveryCachePath);
        writeFileSync(cachePath, "{", "utf8");
        const result = await readModelCache(tempDir, config);
        expect(result.type).toBe("miss");
        if (result.type === "miss") {
            expect(result.reason).toBe("invalid");
        }
        await rm(tempDir, { recursive: true, force: true });
    });
});
//# sourceMappingURL=model-cache.test.js.map