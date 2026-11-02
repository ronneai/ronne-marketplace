import type { TokenCap } from "../../settings/models/token-policy";
import { tokenExpiry } from "../models/access-token";
import { requirePermission } from "../models/permissions";
import type { TokenActor, TokenDeps } from "./access-tokens";

/** Shorten writes this many tokens per update (162). */
export const SHORTEN_BATCH = 500;

const now = (deps: TokenDeps) => (deps.now ?? (() => new Date()))();

/** The two groups and the date each one's tokens may last until now; none for a group with no limit. */
const cutoffs = async (deps: TokenDeps, at: Date) => {
  const policy = await deps.policy();
  const group = (owners: "reviewers" | "others", cap: TokenCap) =>
    cap === null ? [] : [{ owners, cap, cutoff: tokenExpiry(cap, at) as Date }];
  return {
    policy,
    groups: [...group("reviewers", policy.reviewersMaxDays), ...group("others", policy.maxDays)],
  };
};

/**
 * How many active tokens last longer than their owner's cap allows today (162): for the panel's
 * "14 active tokens last longer than this". Root only.
 */
export const countTokensPastPolicy = async (
  deps: TokenDeps,
  actor: TokenActor,
): Promise<number> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  const { groups } = await cutoffs(deps, at);
  let count = 0;
  for (const { owners, cutoff } of groups)
    count += (await deps.repo.tokensPast(cutoff, owners, at)).length;
  return count;
};

/**
 * Root's Shorten (162): every active token that lasts longer than its owner's cap allows gets the
 * earlier of its own expiry and now plus the cap: the reviewers' cap for root and reviewers, as
 * the cap reads them today. Revoked and expired tokens are left alone, and none is revoked
 * (Decision 3). One update per batch of 500, in one transaction; audited once as
 * `access_token.shortened` with the count and the caps, when any changed.
 */
export const shortenTokens = async (
  deps: TokenDeps,
  actor: TokenActor,
): Promise<{ count: number }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  // Read before the transaction: the policy is another table, which SQLite's one connection
  // can't read from inside it.
  const { policy, groups } = await cutoffs(deps, at);
  if (groups.length === 0) return { count: 0 };
  return deps.repo.transaction(async (repo) => {
    let count = 0;
    for (const { owners, cutoff } of groups) {
      const ids = await repo.tokensPast(cutoff, owners, at);
      for (let i = 0; i < ids.length; i += SHORTEN_BATCH)
        count += await repo.shortenTo(ids.slice(i, i + SHORTEN_BATCH), cutoff);
    }
    if (count > 0)
      await repo.recordAudit(
        {
          actorId: actor.user?.id ?? null,
          action: "access_token.shortened",
          target: { type: "instance" },
          metadata: { count, days: policy.maxDays, reviewersDays: policy.reviewersMaxDays },
          ipAddress: actor.ip,
        },
        at,
      );
    return { count };
  });
};
