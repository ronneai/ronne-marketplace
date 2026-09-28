import { describe, expect, it } from "vitest";
import { DEPENDENCY_TYPES, ITEM_TYPES, mayDependOn, mayHaveDependencies } from "./index.js";
import {
  defaultTag,
  highestMatching,
  highestStable,
  nextVersion,
  supersededBy,
  tagProblem,
} from "./versions.js";

describe("DEPENDENCY_TYPES", () => {
  it("matches manifest spec §3", () => {
    expect(mayDependOn("bundle", "hook")).toBe(true);
    expect(mayDependOn("agent", "skill")).toBe(true);
    expect(mayDependOn("agent", "agent")).toBe(false);
    expect(mayDependOn("skill", "mcp-server")).toBe(true);
    expect(mayDependOn("skill", "rule")).toBe(false);
    expect(mayDependOn("command", "mcp-server")).toBe(true);
    expect(ITEM_TYPES.filter(mayHaveDependencies)).toEqual(["skill", "agent", "command", "bundle"]);
    expect(Object.keys(DEPENDENCY_TYPES).sort()).toEqual([...ITEM_TYPES].sort());
  });
});

describe("highestMatching", () => {
  const versions = ["1.0.0", "1.2.0", "1.10.1", "2.0.0-beta.1", "2.0.0", "not-a-version"];

  it("picks the highest version the range accepts", () => {
    expect(highestMatching(versions, "^1.0.0")).toBe("1.10.1");
    expect(highestMatching(versions, "~1.2.0")).toBe("1.2.0");
    expect(highestMatching(versions, ">=2 <3")).toBe("2.0.0");
    expect(highestMatching(versions, "1.2.0")).toBe("1.2.0");
  });

  it("returns null when nothing matches, and leaves pre-releases to ranges that name them", () => {
    expect(highestMatching(versions, "^3.0.0")).toBeNull();
    expect(highestMatching(["2.0.0-beta.1"], "^2.0.0")).toBeNull();
    expect(highestMatching(["2.0.0-beta.1"], "^2.0.0-beta.0")).toBe("2.0.0-beta.1");
    expect(highestMatching([], "*")).toBeNull();
  });
});

describe("nextVersion", () => {
  const stable = (bump: "major" | "minor" | "patch" = "patch") => ({
    kind: "stable" as const,
    bump,
  });
  const pre = (id: string, bump: "major" | "minor" | "patch" = "minor") => ({
    kind: "prerelease" as const,
    id,
    bump,
  });

  it.each([
    [[], stable(), "1.0.0"],
    [[], pre("beta"), "1.0.0-beta.1"],
    [["1.0.0"], stable("patch"), "1.0.1"],
    [["1.0.0"], stable("minor"), "1.1.0"],
    [["1.0.0"], stable("major"), "2.0.0"],
    [["1.0.0"], pre("beta", "minor"), "1.1.0-beta.1"],
    [["1.0.0"], pre("rc", "patch"), "1.0.1-rc.1"],
    [["1.0.0", "1.1.0-beta.1", "1.1.0-beta.2"], pre("beta"), "1.1.0-beta.3"],
    [["1.1.0-beta.2"], stable("minor"), "1.1.0"],
    [["1.1.0-beta.2"], stable("patch"), "1.1.0"],
    [["1.1.0-alpha.3"], pre("beta"), "1.1.0-beta.1"],
    [["2.0.0", "1.5.0", "not-a-version"], stable("patch"), "2.0.1"],
  ] as const)("%j then %j is %s", (published, choice, expected) => {
    expect(nextVersion(published, choice)).toBe(expected);
  });

  it("refuses a pre-release that would sort below what's published, and bad ids", () => {
    expect(nextVersion(["1.1.0-beta.2"], pre("alpha"))).toBeNull();
    expect(nextVersion([], pre("Beta"))).toBeNull();
    expect(nextVersion([], pre("1rc"))).toBeNull();
    expect(nextVersion([], pre(""))).toBeNull();
  });
});

describe("tags", () => {
  it("defaults stable versions to latest and pre-releases to next", () => {
    expect(defaultTag("1.2.0")).toBe("latest");
    expect(defaultTag("1.2.0-beta.1")).toBe("next");
  });

  it("refuses bad names, names that read as ranges, and latest on a pre-release", () => {
    expect(tagProblem("latest", "1.0.0")).toBeNull();
    expect(tagProblem("next", "1.1.0-beta.1")).toBeNull();
    expect(tagProblem("stable-2", "2.0.0")).toBeNull();
    expect(tagProblem("Latest", "1.0.0")).toContain("lowercase");
    expect(tagProblem("x", "1.0.0")).toContain("version range");
    expect(tagProblem("v1", "1.0.0")).toContain("version range");
    expect(tagProblem("latest", "1.1.0-beta.1")).toContain("stable version");
  });
});

describe("highestStable", () => {
  it("skips pre-releases and invalid versions", () => {
    expect(highestStable(["1.0.0", "1.2.0", "2.0.0-beta.1", "x"])).toBe("1.2.0");
    expect(highestStable(["2.0.0-beta.1"])).toBeNull();
    expect(highestStable([])).toBeNull();
  });
});

describe("supersededBy", () => {
  it("finds the newest stable version after a stable base, ignoring pre-releases", () => {
    expect(supersededBy("1.0.0", ["1.0.0", "1.1.0", "1.0.1", "2.0.0-beta.1"])).toBe("1.1.0");
    expect(supersededBy("1.0.0", ["1.0.0", "1.1.0-beta.1"])).toBeNull();
    expect(supersededBy("1.1.0", ["1.0.0", "1.1.0"])).toBeNull();
  });

  it("counts newer pre-releases of the same line after a pre-release base, and any newer stable", () => {
    expect(supersededBy("2.0.0-beta.1", ["2.0.0-beta.1", "2.0.0-beta.2"])).toBe("2.0.0-beta.2");
    expect(supersededBy("2.0.0-beta.1", ["2.0.0-beta.2", "2.0.0"])).toBe("2.0.0");
    expect(supersededBy("2.0.0-beta.1", ["2.1.0-beta.1"])).toBeNull();
    expect(supersededBy("x", ["1.0.0"])).toBeNull();
  });
});
