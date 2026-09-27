import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("rmk", () => {
  it("prints the package version with --version", () => {
    expect(run(["--version"])).toEqual({ exitCode: 0, stdout: `${version}\n`, stderr: "" });
  });

  it("prints usage and exits with 2 when nothing is asked for", () => {
    const result = run([]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Usage");
  });

  it("exits with 2 on an unknown option", () => {
    expect(run(["--nope"]).exitCode).toBe(2);
  });
});
