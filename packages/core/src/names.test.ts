import { describe, expect, it } from "vitest";
import {
  canonicalItemName,
  formatItemName,
  formatScopeName,
  ITEM_NAME_MAX_LENGTH,
  isValidName,
  nameProblem,
  normalizeScopeName,
  normalizeWorkspaceName,
  parseItemName,
  parseScopeName,
  sameItemName,
  shortItemName,
  typedNameParts,
} from "./names.js";

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
      expect(nameProblem(name, "workspace"), name).toBe("reserved");
      expect(isValidName(name, "item"), name).toBe(true);
    }
  });

  it("reserves global for workspaces only, and checks workspace names like the others", () => {
    expect(nameProblem("global", "workspace")).toBe("reserved");
    expect(isValidName("global", "scope")).toBe(true);
    expect(isValidName("global", "item")).toBe(true);
    expect(isValidName("acme", "workspace")).toBe(true);
    expect(nameProblem("Acme", "workspace")).toBe("characters");
    expect(nameProblem("-acme", "workspace")).toBe("edges");
    expect(nameProblem("a".repeat(65), "workspace")).toBe("too_long");
  });
});

describe("normalizeWorkspaceName", () => {
  it("trims and lowercases, and keeps an @ for the name check to refuse", () => {
    expect(normalizeWorkspaceName("  Acme ")).toBe("acme");
    expect(nameProblem(normalizeWorkspaceName("@acme"), "workspace")).toBe("characters");
  });
});

describe("normalizeScopeName and parseItemName", () => {
  it("strips a leading @, trims and lowercases what was typed", () => {
    expect(normalizeScopeName("  @Platform ")).toBe("platform");
    expect(normalizeScopeName("team")).toBe("team");
  });

  it("splits a full item name, and refuses anything else", () => {
    expect(parseItemName("@platform/code-reviewer")).toEqual({
      workspace: "global",
      scope: "platform",
      name: "code-reviewer",
    });
    expect(parseItemName("@acme/platform/code-reviewer")).toEqual({
      workspace: "acme",
      scope: "platform",
      name: "code-reviewer",
    });
    for (const bad of [
      "platform/code-reviewer",
      "@platform",
      "@Platform/x",
      "@a/b/c/d",
      "@a/-b",
      "@/x",
      "@a//x",
      "@a/b/",
      "@a/b.c",
      `@${"a".repeat(65)}/x`,
    ]) {
      expect(parseItemName(bad), bad).toBeNull();
    }
  });

  it("takes the longest names, three of 64", () => {
    const long = "x".repeat(64);
    const name = `@${long}/${long}/${long}`;
    expect(name.length).toBe(ITEM_NAME_MAX_LENGTH);
    expect(parseItemName(name)).not.toBeNull();
  });
});

describe("formatItemName and the global short form (118)", () => {
  it("writes global's items short, and the others in full", () => {
    expect(formatItemName({ workspace: "global", scope: "team", name: "lint" })).toBe("@team/lint");
    expect(formatItemName({ scope: "team", name: "lint" })).toBe("@team/lint");
    expect(formatItemName({ workspace: "acme", scope: "team", name: "lint" })).toBe(
      "@acme/team/lint",
    );
  });

  it("gives one way to write each name", () => {
    expect(canonicalItemName("@global/team/lint")).toBe("@team/lint");
    expect(canonicalItemName("@team/lint")).toBe("@team/lint");
    expect(canonicalItemName("@acme/team/lint")).toBe("@acme/team/lint");
    expect(canonicalItemName("team/lint")).toBeNull();
    expect(sameItemName("@global/team/lint", "@team/lint")).toBe(true);
    expect(sameItemName("@acme/team/lint", "@team/lint")).toBe(false);
    expect(sameItemName("nope", "nope")).toBe(false);
  });

  it("reads a search as a name being typed", () => {
    expect(typedNameParts("@team/re")).toEqual({ workspace: null, scope: "team", name: "re" });
    expect(typedNameParts("acme/team/")).toEqual({ workspace: "acme", scope: "team", name: "" });
    expect(typedNameParts("lint")).toBeNull();
  });

  it("takes the item's own name from either form", () => {
    expect(shortItemName("@team/lint")).toBe("lint");
    expect(shortItemName("@acme/team/lint")).toBe("lint");
  });

  it("reads and writes scopes in both forms", () => {
    expect(parseScopeName("@team")).toEqual({ workspace: "global", scope: "team" });
    expect(parseScopeName("@acme/team")).toEqual({ workspace: "acme", scope: "team" });
    for (const bad of ["team", "@a/b/c", "@A", "@"]) expect(parseScopeName(bad), bad).toBeNull();
    expect(formatScopeName({ workspace: "global", scope: "team" })).toBe("@team");
    expect(formatScopeName({ workspace: "acme", scope: "team" })).toBe("@acme/team");
  });
});
