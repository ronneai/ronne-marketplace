import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { bothRanges } from "./versions.js";

describe("bothRanges (118)", () => {
  it("needs both ranges, whatever their form, in either order", () => {
    for (const [a, b] of [
      ["^1.0.0 || ^2.0.0", "^2.0.0"],
      ["^2.0.0", "^1.0.0 || ^2.0.0"],
    ] as const) {
      const range = bothRanges(a, b) ?? "";
      expect(satisfies("2.1.0", range), range).toBe(true);
      expect(satisfies("1.0.0", range), range).toBe(false);
    }
    const hyphen = bothRanges("1.0.0 - 1.5.0", ">=1.2.0") ?? "";
    expect(satisfies("1.3.0", hyphen)).toBe(true);
    expect(satisfies("1.1.0", hyphen)).toBe(false);
    expect(satisfies("1.6.0", hyphen)).toBe(false);
    expect(satisfies("3.0.0", bothRanges("*", ">=2.0.0") ?? "")).toBe(true);
  });

  it("is null when either isn't a range", () => {
    expect(bothRanges("latest", "^1.0.0")).toBeNull();
    expect(bothRanges("^1.0.0", "next")).toBeNull();
  });

  it("is null when the two would make too many alternatives to build", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `${i}.0.0`).join(" || ");
    expect(bothRanges(many(8), many(8))).not.toBeNull();
    expect(bothRanges(many(3000), many(3000))).toBeNull();
    // One long alternative, repeated for each of 64 short ones.
    const long = Array.from({ length: 2000 }, (_, i) => `<99999.0.${i}`).join(" ");
    const short = Array.from({ length: 64 }, (_, i) => `<1.0.${i + 1}`).join(" || ");
    expect(bothRanges(long, short)).toBeNull();
    expect(bothRanges("^1.0.0", short)).not.toBeNull();
  });
});
