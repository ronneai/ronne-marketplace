import { describe, expect, it } from "vitest";
import { checkLicenses, isExpressionAllowed } from "./licenses.js";

const allowed = new Set(["MIT", "Apache-2.0", "ISC"]);

describe("isExpressionAllowed", () => {
  it.each([
    ["MIT", true],
    ["GPL-3.0-only", false],
    ["MIT OR Apache-2.0", true],
    ["GPL-3.0-only OR MIT", true],
    ["MIT AND ISC", true],
    ["MIT AND GPL-3.0-only", false],
    ["(MIT OR GPL-3.0-only) AND ISC", true],
    ["(MIT AND GPL-3.0-only) OR AGPL-3.0-only", false],
    ["Apache-2.0 WITH LLVM-exception", true],
    ["Apache-2.0+", true],
    ["mit or apache-2.0", false],
    ["", false],
    ["MIT OR", false],
    ["(MIT", false],
    ["UNLICENSED", false],
    ["Unknown", false],
  ])("%j → %s", (expression, expected) => {
    expect(isExpressionAllowed(expression, allowed)).toBe(expected);
  });
});

describe("checkLicenses", () => {
  const policy = {
    allowed: ["MIT", "Apache-2.0"],
    exceptions: [
      { id: "E-4", package: "lightningcss-*", license: "MPL-2.0" },
      { id: "E-9", package: "gone", license: "MPL-2.0" },
    ],
  };

  it("passes allowed licenses and matching exceptions, and fails the rest", () => {
    const report = {
      MIT: [{ name: "a", versions: ["1.0.0"], license: "MIT" }],
      "MPL-2.0": [
        { name: "lightningcss-linux-x64-gnu", versions: ["1.32.0"], license: "MPL-2.0" },
        { name: "other-mpl", versions: ["2.0.0"], license: "MPL-2.0" },
      ],
      "GPL-3.0-only": [{ name: "gpl-fixture", versions: ["0.1.0"], license: "GPL-3.0-only" }],
    };

    const result = checkLicenses(report, policy);

    expect(result.checked).toBe(4);
    expect(result.violations).toEqual([
      { name: "other-mpl", versions: ["2.0.0"], license: "MPL-2.0" },
      { name: "gpl-fixture", versions: ["0.1.0"], license: "GPL-3.0-only" },
    ]);
    expect(result.unusedExceptions).toEqual(["E-9 gone"]);
  });

  it("treats a package with no license as a violation", () => {
    const report = { Unknown: [{ name: "mystery", versions: ["1.0.0"] }] };
    expect(checkLicenses(report, policy).violations).toHaveLength(1);
  });
});
