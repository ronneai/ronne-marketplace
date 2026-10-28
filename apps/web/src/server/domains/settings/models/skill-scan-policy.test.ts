import { describe, expect, it } from "vitest";
import {
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
