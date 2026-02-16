import { describe, expect, spyOn, test } from "bun:test";
import { discoverCursorModels, extractModelIdsFromPayload } from "../cursor/discovery.js";
import * as dbUtils from "../utils/db.js";

describe("extractModelIdsFromPayload", () => {
  test("extracts model ids from nested payload", () => {
    const payload = {
      sessions: [
        {
          model: "gpt-5.2",
          details: {
            selectedModel: "sonnet-4.5-thinking",
          },
        },
      ],
    };

    expect(extractModelIdsFromPayload(payload)).toEqual(["gpt-5.2", "sonnet-4.5-thinking"]);
  });
});

describe("discoverCursorModels", () => {
  test("returns discovered models from known keys", async () => {
    spyOn(dbUtils, "getDbValue").mockImplementation(async (...args: unknown[]) => {
      const key = String(args[1] ?? "");
      if (key === "composer.composerData") {
        return JSON.stringify({
          sessions: [
            {
              selectedModel: "sonnet-4.5",
            },
            {
              model: "gpt-5.2",
            },
          ],
        });
      }

      return null;
    });

    const result = await discoverCursorModels("/tmp/mock-state.vscdb");

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.models).toEqual(["gpt-5.2", "sonnet-4.5"]);
      expect(result.keysChecked.length > 0).toBe(true);
    }
  });

  test("returns empty when no models are found", async () => {
    spyOn(dbUtils, "getDbValue").mockImplementation(async () => null);
    spyOn(dbUtils, "getDbValuesByLike").mockImplementation(async () => []);

    const result = await discoverCursorModels("/tmp/mock-state.vscdb");

    expect(result.type).toBe("empty");
    if (result.type === "empty") {
      expect(result.keysChecked.length > 0).toBe(true);
    }
  });

  test("returns failed on read exception", async () => {
    spyOn(dbUtils, "getDbValue").mockImplementation(async () => {
      throw new Error("db-read-failure");
    });

    const result = await discoverCursorModels("/tmp/mock-state.vscdb");

    expect(result.type).toBe("failed");
    if (result.type === "failed") {
      expect(result.error).toContain("db-read-failure");
    }
  });

  test("reads model names from composerData pattern rows", async () => {
    spyOn(dbUtils, "getDbValue").mockImplementation(async () => null);
    spyOn(dbUtils, "getDbValuesByLike").mockImplementation(async () => [
      {
        table: "cursorDiskKV",
        key: "composerData:abc",
        value: JSON.stringify({
          conversationMap: {
            one: {
              modelName: "claude-4.5-sonnet",
            },
          },
        }),
      },
    ]);

    const result = await discoverCursorModels("/tmp/mock-state.vscdb");

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.models).toEqual(["claude-4.5-sonnet"]);
    }
  });
});
