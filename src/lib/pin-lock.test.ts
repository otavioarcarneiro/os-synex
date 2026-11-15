import { describe, expect, it } from "vitest";
import { pinAfterFailure } from "./pin-lock";
const now = new Date("2026-11-15T12:00:00Z");
describe("master PIN lock", () => {
  it("does not lock after 2 errors", () => expect(pinAfterFailure(1, now).lockedUntil).toBeNull());
  it("locks 15 minutes on the 3rd error", () => expect(pinAfterFailure(2, now).lockedUntil).toBe("2026-11-15T12:15:00.000Z"));
});
