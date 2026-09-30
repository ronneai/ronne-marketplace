import { describe, expect, it } from "vitest";
import { listOf } from "./shared.js";

describe("listOf", () => {
  it("reads a YAML list, a comma-separated string, or one split on another separator", () => {
    expect(listOf(["Read", " Grep "])).toEqual(["Read", "Grep"]);
    expect(listOf("Read,  Grep ,Bash")).toEqual(["Read", "Grep", "Bash"]);
    expect(listOf("issue branch, env", /[\s,]+/)).toEqual(["issue", "branch", "env"]);
    expect(listOf(undefined)).toEqual([]);
    expect(listOf(" , ")).toEqual([]);
  });

  it("stays fast on long runs of spaces with no separator", () => {
    const started = performance.now();
    expect(listOf(`a${" ".repeat(100_000)}b`)).toEqual([`a${" ".repeat(100_000)}b`]);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
