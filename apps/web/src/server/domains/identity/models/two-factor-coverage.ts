import { canInSomeShared, type Subject } from "./permissions";

/** Who root requires to use two-factor sign-in (105): the settings domain's policy, as identity reads it. */
export type TwoFactorRequirement = "optional" | "reviewers" | "everyone";

/**
 * Whether the requirement covers this person (feature 105): nobody under `optional`; under
 * `reviewers`, root and anyone who can review in a shared workspace (moderators and admins; their
 * own personal workspace doesn't count, everyone has one); everyone under `everyone`. An account
 * with no password (company sign-in) is never covered: its provider's second step protects it.
 */
export const coveredBy = (
  requirement: TwoFactorRequirement,
  user: Subject,
  hasPassword: boolean,
): boolean => {
  if (!hasPassword || requirement === "optional") return false;
  if (requirement === "everyone") return true;
  return user.role === "root" || canInSomeShared(user, "submissions.review");
};

/** One account, as the coverage counts need it. */
export type CoverageRow = {
  reviewer: boolean;
  root: boolean;
  hasPassword: boolean;
  enrolled: boolean;
};

/** How many people each requirement covers, and how many of them haven't enrolled yet. */
export type TwoFactorCoverage = Record<
  Exclude<TwoFactorRequirement, "optional">,
  { covered: number; unenrolled: number }
>;

export const coverageOf = (rows: readonly CoverageRow[]): TwoFactorCoverage => {
  const count = (covered: (row: CoverageRow) => boolean) => {
    const them = rows.filter((row) => row.hasPassword && covered(row));
    return { covered: them.length, unenrolled: them.filter((row) => !row.enrolled).length };
  };
  return {
    reviewers: count((row) => row.root || row.reviewer),
    everyone: count(() => true),
  };
};
