import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENGINES_NODE,
  MIN_NODE,
  MIN_NODE_23,
  nodeTooOld,
  nodeTooOldMessage,
} from "./node-version.js";

describe("the Node.js version check (082)", () => {
  it("needs N-API 10: 22.14 or later, and 23.6 or later on 23 (#315)", () => {
    expect(MIN_NODE).toBe("22.14.0");
    expect(MIN_NODE_23).toBe("23.6.0");
    for (const v of ["20.18.0", "22.0.0", "22.12.0", "22.13.1", "23.0.0", "23.5.0"])
      expect(nodeTooOld(v)).toBe(true);
    for (const v of ["22.14.0", "22.23.3", "23.6.0", "24.0.0", "26.1.0"])
      expect(nodeTooOld(v)).toBe(false);
  });

  it("names the version to install", () => {
    expect(nodeTooOldMessage("22.13.1")).toBe(
      "Node.js 22.14.0 or later is needed; this is 22.13.1.",
    );
    expect(nodeTooOldMessage("23.5.0")).toBe(
      "Node.js 22.14.0 or later is needed, and on Node.js 23, 23.6.0 or later; this is 23.5.0.",
    );
  });

  it("asks npm for the same versions in engines", () => {
    expect(ENGINES_NODE).toBe("^22.14.0 || >=23.6.0");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      engines: { node: string };
    };
    expect(pkg.engines.node).toBe(ENGINES_NODE);
  });
});
