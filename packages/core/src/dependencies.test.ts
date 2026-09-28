import { describe, expect, it } from "vitest";
import { DEPENDENCY_TYPES, ITEM_TYPES, mayDependOn, mayHaveDependencies } from "./index.js";
import { highestMatching } from "./versions.js";

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
