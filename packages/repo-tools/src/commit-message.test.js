import { describe, expect, it } from "vitest";
import { checkSubject } from "./commit-message.js";

describe("checkSubject", () => {
  it.each([
    "[feat] 001: Add CI workflow on Node 22 and 24",
    "[bugfix] 003: Keep AUTH_SECRET when setup reruns",
    "[docs]: Add dependency policy",
    "[chore]: Bump next from 16.3.6 to 16.3.7",
    "[feat] 001: Add CI workflow (#12)",
    "[docs]: Add dependency policy\n\nLonger body text.",
    'Merge branch "main" into feat/x',
    'Revert "[feat] 001: Add CI workflow"',
    "fixup! [feat] 001: Add CI workflow",
  ])("accepts %j", (message) => {
    expect(checkSubject(message)).toEqual({ valid: true });
  });

  it.each([
    ["no type", "Add CI workflow"],
    ["an unknown type", "[fix] 001: Add CI workflow"],
    ["a non-numeric id", "[feat] ci: Add CI workflow"],
    ["a 2-digit id", "[feat] 01: Add CI workflow"],
    ["a missing space after the colon", "[feat] 001:Add CI workflow"],
    ["an empty description", "[docs]: "],
    ["a lowercase description", "[docs]: add dependency policy"],
    ["a trailing full stop", "[docs]: Add dependency policy."],
    ["a space before the colon", "[docs] : Add dependency policy"],
    ["Conventional Commits style", "feat(001): add CI workflow"],
    ["a subject over 72 characters", `[feat] 001: ${"A".repeat(61)}`],
  ])("rejects %s", (_label, message) => {
    expect(checkSubject(message).valid).toBe(false);
  });

  it("can skip the length rule, but not the others", () => {
    const long = "[chore]: Bump the npm-dependencies group across 3 directories with 5 updates";
    expect(checkSubject(long).valid).toBe(false);
    expect(checkSubject(long, { checkLength: false })).toEqual({ valid: true });
    expect(checkSubject("Bump next", { checkLength: false }).valid).toBe(false);
  });

  it("doesn't count the squash-merge suffix towards the length", () => {
    expect(checkSubject(`[feat] 001: ${"A".repeat(60)} (#123)`)).toEqual({ valid: true });
  });
});
