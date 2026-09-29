import { describe, expect, it } from "vitest";
import { isVersion, sharedVersion, withVersion } from "./release.js";

const pkg = (name, version) =>
  `{\n  "name": "${name}",\n  "version": "${version}",\n  "description": "x"\n}\n`;
const texts = (core, cli, mcp) => ({
  core: pkg("@ronneai/core", core),
  cli: pkg("@ronneai/rmk", cli),
  mcp: pkg("@ronneai/mcp", mcp),
});

describe("release versions", () => {
  it("knows a version", () => {
    for (const v of ["0.1.0", "1.0.0", "1.2.3-beta.1"]) expect(isVersion(v)).toBe(true);
    for (const v of ["v0.1.0", "0.1", "01.0.0", "1.0.0+build", ""])
      expect(isVersion(v)).toBe(false);
  });

  it("sets one version everywhere, changing nothing else", () => {
    const next = withVersion(texts("0.0.0", "0.0.0", "0.0.0"), "0.1.0");
    expect(next.cli).toBe(pkg("@ronneai/rmk", "0.1.0"));
    expect(sharedVersion(next)).toBe("0.1.0");
    expect(() => withVersion(texts("0", "0", "0"), "one")).toThrow(/isn't a version/);
  });

  it("names the packages whose versions differ", () => {
    expect(() => sharedVersion(texts("0.1.0", "0.1.0", "0.2.0"))).toThrow(
      "The published packages have different versions: core 0.1.0, cli 0.1.0, mcp 0.2.0. Run pnpm release:version.",
    );
  });

  it("checks a tag against the packages' version, as the release workflow does", async () => {
    const { execFileSync } = await import("node:child_process");
    const script = new URL("./release-check.js", import.meta.url).pathname;
    const run = (tag) => {
      try {
        return {
          code: 0,
          out: execFileSync("node", [script, tag], { encoding: "utf8", stdio: "pipe" }),
        };
      } catch (error) {
        return { code: error.status, out: String(error.stderr) };
      }
    };
    const { readFileSync } = await import("node:fs");
    const version = JSON.parse(
      readFileSync(new URL("../../cli/package.json", import.meta.url), "utf8"),
    ).version;
    expect(run(`v${version}`)).toEqual({ code: 0, out: `${version}\n` });
    expect(run("v999.0.0")).toMatchObject({
      code: 1,
      out: expect.stringContaining("doesn't match"),
    });
  });
});
