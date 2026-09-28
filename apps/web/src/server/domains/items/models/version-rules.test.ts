import { describe, expect, it } from "vitest";
import {
  latestAfterYank,
  MAX_TAGS,
  messageFrom,
  moveTagProblem,
  removeTagProblem,
} from "./version-rules";

const v = (id: string, version: string, yanked = false) => ({ id, version, yanked });

describe("latestAfterYank", () => {
  const versions = [v("a", "1.0.0"), v("b", "1.1.0"), v("c", "1.2.0"), v("d", "2.0.0-beta.1")];

  it.each([
    ["the latest version, so latest moves back to the next stable one", "c", "b"],
    ["an older version, so latest stays on the highest", "a", "c"],
  ])("yanking %s", (_what, yanked, expected) => {
    expect(latestAfterYank(versions, yanked)?.id).toBe(expected);
  });

  it("skips versions already yanked, never picks a pre-release, and can find nothing", () => {
    expect(latestAfterYank([v("a", "1.0.0", true), v("b", "1.1.0")], "b")).toBeNull();
    expect(latestAfterYank([v("a", "1.0.0"), v("b", "2.0.0-beta.1")], "a")).toBeNull();
  });
});

describe("moveTagProblem", () => {
  it("allows a new or moved tag within the rules", () => {
    expect(moveTagProblem("latest", v("a", "1.0.0"), 1, false)).toBeNull();
    expect(moveTagProblem("next", v("b", "2.0.0-beta.1"), 1, true)).toBeNull();
  });

  it("refuses latest on a pre-release, ranges, yanked targets and too many tags", () => {
    expect(moveTagProblem("latest", v("b", "2.0.0-beta.1"), 1, false)).toContain("stable version");
    expect(moveTagProblem("x", v("a", "1.0.0"), 1, true)).toContain("version range");
    expect(moveTagProblem("stable", v("a", "1.0.0", true), 1, true)).toContain("yanked");
    expect(moveTagProblem("more", v("a", "1.0.0"), MAX_TAGS, true)).toContain(
      `at most ${MAX_TAGS}`,
    );
    // Moving an existing tag doesn't count against the limit.
    expect(moveTagProblem("more", v("a", "1.0.0"), MAX_TAGS, false)).toBeNull();
  });
});

describe("removeTagProblem and messageFrom", () => {
  it("keeps latest, and lets any other tag go", () => {
    expect(removeTagProblem("latest")).toContain("can't be removed");
    expect(removeTagProblem("next")).toBeNull();
  });

  it("trims messages and holds them to 1 to 300 characters", () => {
    expect(messageFrom("  Use 2.x.  ")).toBe("Use 2.x.");
    expect(messageFrom("   ")).toBeNull();
    expect(messageFrom("x".repeat(301))).toBeNull();
  });
});
