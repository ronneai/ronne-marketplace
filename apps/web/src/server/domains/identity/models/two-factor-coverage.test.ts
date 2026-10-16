import { describe, expect, it } from "vitest";
import { type CoverageRow, coverageOf, coveredBy } from "./two-factor-coverage";

const user = (
  workspaces: Record<string, "admin" | "moderator" | "user"> = { global: "user" },
  personal: string | null = "mine",
) => ({
  role: "user" as const,
  workspaces: { ...workspaces, ...(personal ? { [personal]: "admin" as const } : {}) },
  personal,
});

describe("coveredBy", () => {
  const cases = [
    ["a user", user(), [false, false, true]],
    ["a moderator", user({ global: "user", team: "moderator" }), [false, true, true]],
    ["an admin", user({ global: "admin" }), [false, true, true]],
    [
      "an admin of only their personal workspace",
      user({ global: "user" }, "mine"),
      [false, false, true],
    ],
    ["root", { role: "root" as const, workspaces: {}, personal: null }, [false, true, true]],
  ] as const;
  for (const [who, subject, [optional, reviewers, everyone]] of cases)
    it(`${who}: optional ${optional}, reviewers ${reviewers}, everyone ${everyone}`, () => {
      expect(coveredBy("optional", subject, true)).toBe(optional);
      expect(coveredBy("reviewers", subject, true)).toBe(reviewers);
      expect(coveredBy("everyone", subject, true)).toBe(everyone);
    });

  it("never covers an account with no password (company sign-in)", () => {
    for (const requirement of ["optional", "reviewers", "everyone"] as const)
      expect(coveredBy(requirement, { role: "root", workspaces: {} }, false)).toBe(false);
  });
});

describe("coverageOf", () => {
  it("counts who each requirement covers and who hasn't enrolled, leaving out accounts with no password", () => {
    const rows: CoverageRow[] = [
      { root: true, reviewer: false, hasPassword: true, enrolled: true },
      { root: false, reviewer: true, hasPassword: true, enrolled: false },
      { root: false, reviewer: false, hasPassword: true, enrolled: false },
      { root: false, reviewer: true, hasPassword: false, enrolled: false },
    ];
    expect(coverageOf(rows)).toEqual({
      reviewers: { covered: 2, unenrolled: 1 },
      everyone: { covered: 3, unenrolled: 2 },
    });
  });
});
