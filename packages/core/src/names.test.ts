import { describe, expect, it } from "vitest";
import { isValidName, nameProblem, normalizeScopeName, parseItemName } from "./names.js";

describe("nameProblem", () => {
  it("accepts lowercase letters, digits and inner hyphens, up to 64 characters", () => {
    for (const name of ["a", "platform", "code-review", "a1", "team-2", "x".repeat(64)]) {
      expect(nameProblem(name), name).toBeNull();
    }
  });

  it("names each problem", () => {
    expect(nameProblem("")).toBe("empty");
    expect(nameProblem("x".repeat(65))).toBe("too_long");
    expect(nameProblem("Platform")).toBe("characters");
    expect(nameProblem("my_team")).toBe("characters");
    expect(nameProblem("team.one")).toBe("characters");
    expect(nameProblem("café")).toBe("characters");
    expect(nameProblem("-team")).toBe("edges");
    expect(nameProblem("team-")).toBe("edges");
    expect(nameProblem("-")).toBe("edges");
  });

  it("reserves some scope names, but not item names", () => {
    for (const name of [
      "ronne",
      "ronneai",
      "rmk",
      "admin",
      "root",
      "system",
      "api",
      "www",
      "internal",
    ]) {
      expect(nameProblem(name, "scope"), name).toBe("reserved");
      expect(isValidName(name, "item"), name).toBe(true);
    }
  });
});

describe("normalizeScopeName and parseItemName", () => {
  it("strips a leading @, trims and lowercases what was typed", () => {
    expect(normalizeScopeName("  @Platform ")).toBe("platform");
    expect(normalizeScopeName("team")).toBe("team");
  });

  it("splits a full item name, and refuses anything else", () => {
    expect(parseItemName("@platform/code-reviewer")).toEqual({
      scope: "platform",
      name: "code-reviewer",
    });
    for (const bad of [
      "platform/code-reviewer",
      "@platform",
      "@Platform/x",
      "@a/b/c",
      "@a/-b",
      "@/x",
    ]) {
      expect(parseItemName(bad), bad).toBeNull();
    }
  });
});
