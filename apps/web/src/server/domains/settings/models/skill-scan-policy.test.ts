import { describe, expect, it } from "vitest";
import {
  blockScoreFrom,
  DEFAULT_SKILL_SCAN_POLICY,
  skillScanPolicyFrom,
  skillScanTypesFrom,
} from "./skill-scan-policy";

describe("skillScanTypesFrom", () => {
  it.each([
    ["skill", ["skill"]],
    ["agent,skill, skill ", ["skill", "agent"]],
    [
      ["mcp-server", "skill"],
      ["skill", "mcp-server"],
    ],
    ["skill,plugin", ["skill"]],
    ["plugin", null],
    ["", null],
    [[], null],
  ])("reads %j as %j", (value, expected) => {
    expect(skillScanTypesFrom(value)).toEqual(expected);
  });
});

describe("skillScanPolicyFrom", () => {
  it("is off, skills, static, until root sets it", () => {
    expect(skillScanPolicyFrom({ enabled: null, types: null, analysis: null })).toEqual(
      DEFAULT_SKILL_SCAN_POLICY,
    );
  });

  it("reads what root set", () => {
    expect(
      skillScanPolicyFrom({ enabled: "true", types: "skill,agent", analysis: "semantic" }),
    ).toEqual({
      enabled: true,
      types: ["skill", "agent"],
      analysis: "semantic",
    });
  });

  it("reads a broken value as the default", () => {
    expect(skillScanPolicyFrom({ enabled: "yes", types: "nothing", analysis: "llm" })).toEqual(
      DEFAULT_SKILL_SCAN_POLICY,
    );
  });
});

describe("blockScoreFrom (137)", () => {
  it("reads a whole number from 1 to 100", () => {
    expect(blockScoreFrom("1")).toBe(1);
    expect(blockScoreFrom(" 70 ")).toBe(70);
    expect(blockScoreFrom("100")).toBe(100);
  });

  it("reads anything else as no threshold", () => {
    for (const value of ["", "0", "101", "7.5", "1e2", "0x40", "-5", "abc", null, undefined])
      expect(blockScoreFrom(value)).toBeNull();
  });
});
