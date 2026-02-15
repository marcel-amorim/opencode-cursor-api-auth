import { describe, expect, test } from "bun:test";
import { buildAuthFailureMessage } from "../cursor/auth.js";
describe("buildAuthFailureMessage", () => {
    test("includes both local and agent reasons", () => {
        const message = buildAuthFailureMessage("local missing", "agent missing");
        expect(message).toContain("No authentication found.");
        expect(message).toContain("Checked Local DB: local missing");
        expect(message).toContain("Checked Agent Config: agent missing");
    });
    test("normalizes empty reasons", () => {
        const message = buildAuthFailureMessage("", undefined);
        expect(message).toContain("Checked Local DB: Unknown error");
        expect(message).toContain("Checked Agent Config: Unknown error");
    });
});
//# sourceMappingURL=auth.test.js.map