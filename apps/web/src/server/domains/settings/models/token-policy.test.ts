import { describe, expect, it } from "vitest";
import {
  capFor,
  capWithin,
  DEFAULT_TOKEN_POLICY,
  storedTokenCap,
  tokenCapFrom,
  tokenPolicyFrom,
} from "./token-policy";

describe("a token cap as a form or a request gives it (162)", () => {
  it.each([
    [30, 30],
    [90, 90],
    [365, 365],
    ["30", 30],
    ["90", 90],
    ["365", 365],
    ["none", null],
  ])("reads %j as %j", (value, cap) => {
    expect(tokenCapFrom(value)).toBe(cap);
  });

  it.each([
    0,
    1,
    7,
    60,
    366,
    -30,
    30.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "",
    null,
    " 30",
    "30 ",
    "030",
    "0365",
    "-0",
    -0,
    "30.0",
    "0x1e",
    "1e2",
    "+90",
    "forever",
    "None",
    undefined,
    true,
    {},
    [30],
  ])("refuses %j", (value) => {
    expect(tokenCapFrom(value)).toBeUndefined();
  });

  it("is stored as its days, or none for no limit", () => {
    expect(storedTokenCap(90)).toBe("90");
    expect(storedTokenCap(null)).toBe("none");
    for (const cap of [30, 90, 365, null] as const)
      expect(tokenCapFrom(storedTokenCap(cap))).toBe(cap);
  });
});

describe("one cap within another", () => {
  it("counts no limit as the longest", () => {
    expect(capWithin(30, 90)).toBe(true);
    expect(capWithin(90, 90)).toBe(true);
    expect(capWithin(365, 90)).toBe(false);
    expect(capWithin(365, null)).toBe(true);
    expect(capWithin(null, null)).toBe(true);
    expect(capWithin(null, 365)).toBe(false);
  });
});

describe("the policy from what instance_settings holds", () => {
  it("is 365 days, and 90 for reviewers and root, while nothing is set", () => {
    expect(DEFAULT_TOKEN_POLICY).toEqual({ maxDays: 365, reviewersMaxDays: 90 });
    expect(tokenPolicyFrom({ maxDays: null, reviewersMaxDays: null })).toEqual(
      DEFAULT_TOKEN_POLICY,
    );
  });

  it("reads what root set, no limit included", () => {
    expect(tokenPolicyFrom({ maxDays: "90", reviewersMaxDays: "30" })).toEqual({
      maxDays: 90,
      reviewersMaxDays: 30,
    });
    expect(tokenPolicyFrom({ maxDays: "none", reviewersMaxDays: "none" })).toEqual({
      maxDays: null,
      reviewersMaxDays: null,
    });
  });

  it("reads a value that isn't a cap (a hand edit) as the default, an empty one included", () => {
    expect(tokenPolicyFrom({ maxDays: "45", reviewersMaxDays: "forever" })).toEqual(
      DEFAULT_TOKEN_POLICY,
    );
    expect(tokenPolicyFrom({ maxDays: "", reviewersMaxDays: "" })).toEqual(DEFAULT_TOKEN_POLICY);
    expect(tokenPolicyFrom({ maxDays: "030", reviewersMaxDays: "090" })).toEqual(
      DEFAULT_TOKEN_POLICY,
    );
  });

  it("never reads the reviewers' cap longer than everyone's", () => {
    // Everyone's set alone, below the reviewers' default.
    expect(tokenPolicyFrom({ maxDays: "30", reviewersMaxDays: null })).toEqual({
      maxDays: 30,
      reviewersMaxDays: 30,
    });
    // A hand edit.
    expect(tokenPolicyFrom({ maxDays: "90", reviewersMaxDays: "none" })).toEqual({
      maxDays: 90,
      reviewersMaxDays: 90,
    });
  });

  it("gives reviewers theirs, and everyone else everyone's", () => {
    const policy = { maxDays: 365, reviewersMaxDays: 30 } as const;
    expect(capFor(policy, true)).toBe(30);
    expect(capFor(policy, false)).toBe(365);
  });
});
