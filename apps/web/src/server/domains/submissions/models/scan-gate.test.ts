import { describe, expect, it } from "vitest";
import { type ScanGatePolicy, type ScanState, scanBlockedEnglish, scanGate } from "./scan-gate";

const policy = (overrides: Partial<ScanGatePolicy> = {}): ScanGatePolicy => ({
  enabled: true,
  types: ["skill"],
  blockScore: 70,
  ...overrides,
});
const shared = { type: "skill", authorId: "author", workspace: { ownerId: null } };
const done = (score: number): ScanState => ({ status: "done", score });

describe("scanGate (137)", () => {
  it("blocks a finished scan at or above the threshold, with the score", () => {
    expect(scanGate(policy(), shared, done(70))).toEqual({
      blocked: true,
      by: "score",
      threshold: 70,
      score: 70,
    });
    expect(scanGate(policy(), shared, done(100))).toMatchObject({ blocked: true, by: "score" });
  });

  it("lets a finished scan under the threshold through", () => {
    expect(scanGate(policy(), shared, done(69))).toEqual({ blocked: false, threshold: 70 });
  });

  it("fails closed: waiting, running, failed and missing scans block", () => {
    expect(scanGate(policy(), shared, { status: "queued", score: null })).toMatchObject({
      blocked: true,
      by: "pending",
    });
    expect(scanGate(policy(), shared, { status: "running", score: null })).toMatchObject({
      by: "pending",
    });
    expect(scanGate(policy(), shared, { status: "failed", score: null })).toMatchObject({
      by: "failed",
    });
    expect(scanGate(policy(), shared, null)).toMatchObject({ blocked: true, by: "none" });
    // A done row with no score is a broken one: it doesn't pass.
    expect(scanGate(policy(), shared, { status: "done", score: null })).toMatchObject({
      by: "failed",
    });
  });

  it("is open with no threshold, with scanning off, or with no policy at all", () => {
    expect(scanGate(policy({ blockScore: null }), shared, null)).toEqual({
      blocked: false,
      threshold: null,
    });
    expect(scanGate(policy({ enabled: false }), shared, done(100)).blocked).toBe(false);
    expect(scanGate(undefined, shared, null).blocked).toBe(false);
  });

  it("is open for a type root doesn't scan, and for the owner's own in a personal workspace (114)", () => {
    expect(scanGate(policy(), { ...shared, type: "rule" }, null).blocked).toBe(false);
    const personal = { type: "skill", authorId: "u1", workspace: { ownerId: "u1" } };
    expect(scanGate(policy(), personal, null).blocked).toBe(false);
  });

  it("gates someone else's submission in a personal workspace, as a moved scope brings (115)", () => {
    const moved = { type: "skill", authorId: "author", workspace: { ownerId: "admin" } };
    expect(scanGate(policy(), moved, done(99))).toMatchObject({ blocked: true, by: "score" });
  });

  it("says why in English for each block", () => {
    expect(scanBlockedEnglish("score", 90, 70)).toBe(
      "Approval is blocked: the security scan's score, 90, is at or above the threshold, 70.",
    );
    expect(scanBlockedEnglish("pending", null, 70)).toMatch(/waits for the security scan/);
    expect(scanBlockedEnglish("failed", null, 70)).toMatch(/didn't finish/);
    expect(scanBlockedEnglish("none", null, 70)).toMatch(/wasn't scanned/);
  });
});
