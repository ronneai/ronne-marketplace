import { describe, expect, it } from "vitest";
import { toItemName } from "./text.js";

describe("toItemName", () => {
  it("keeps a valid name, and makes anything else lowercase with single hyphens", () => {
    expect(toItemName("review")).toBe("review");
    expect(toItemName("My Skill!")).toBe("my-skill");
    expect(toItemName("--Deploy__Tool--")).toBe("deploy-tool");
    expect(toItemName("a---b")).toBe("a---b");
    expect(toItemName("A---B")).toBe("a-b");
    expect(toItemName("!!!")).toBe("");
    expect(toItemName("")).toBe("");
  });

  it("cuts at 64 characters without leaving a hyphen at the end", () => {
    const name = toItemName(`${"a".repeat(63)} b`);
    expect(name).toBe("a".repeat(63));
  });

  it("stays fast on long runs of hyphens and other characters", () => {
    const started = performance.now();
    expect(toItemName(`${"-".repeat(100_000)}x${"-".repeat(100_000)}`)).toBe("x");
    expect(toItemName(`a${" -".repeat(100_000)}!`)).toBe("a");
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
