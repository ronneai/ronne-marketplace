import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { encodeJson } from "../../../db/json";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { ProviderFlowError, ProviderSecretUnreadableError } from "../exceptions/errors";
import type { VerifiedIdentity } from "../models/auth-provider-type";
import { clientIp } from "../models/client-ip";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import { type GroupChange, planGroupChanges } from "../services/group-sync";
import { markProviderTested } from "../services/identity-providers";
import { planSsoSignIn } from "../services/sso-sign-in";
import { getCurrentUser } from "./session";

/** A *Test sign-in*'s result, kept for the form (an hour) under the provider and the root. */
export type TestSignInResult = {
  at: string;
  ok: boolean;
  /** What was checked, written out. */
  lines: string[];
  claims: VerifiedIdentity | null;
  /** What a real sign-in would do with these claims, changing nothing now. */
  decision: string | null;
  groupChanges: GroupChange[];
};

const TEST_PREFIX = "sso-test:";
export const testKey = (providerId: string, userId: string) =>
  `${TEST_PREFIX}${providerId}:${userId}`;

/** What a real sign-in would do, in words, for the result. */
const decisionText = (plan: Awaited<ReturnType<typeof planSsoSignIn>>): string => {
  switch (plan.action) {
    case "sign_in":
      return `Sign in ${plan.user.email} (already linked).`;
    case "link":
      return `Link the existing account ${plan.user.email} by its verified email, then sign in.`;
    case "create":
      return `Create the account ${plan.email} (a user in global, with a personal workspace), then sign in.`;
    default:
      return {
        unverified_email: "Refuse: the provider didn't say the email is verified.",
        disabled: "Refuse: the account is disabled.",
        not_allowed:
          "Refuse: no account matches, and the email's domain isn't one that may create one.",
      }[plan.reason];
  }
};

/**
 * Finishes a *Test sign-in* at the callback (`completeSsoSignIn` hands it here): only for the
 * root who started it, signed in in this browser. Verifies the answer like a real sign-in, works
 * out the decision and the group changes without writing them, keeps the result for the form,
 * and records the passing test for the version it started on. Returns where to go.
 */
export const finishTestSignIn = async (input: {
  app: AppAuth;
  headers: Headers;
  providerId: string;
  test: { by: string; version: string };
  run: () => Promise<VerifiedIdentity>;
  next: string;
}): Promise<string> => {
  const { app, headers, providerId, test } = input;
  const user = await getCurrentUser(headers, app);
  // Someone else's test, or no session in this browser: nothing to show, nothing recorded.
  if (!user || user.id !== test.by || user.role !== "root") return "/sign-in?error=expired";
  const repo = kyselyIdentityProviderRepository(app.db, app.dialect);
  const d = { repo, types: PROVIDER_TYPES, authSecret: (await app.auth.$context).secret };
  const now = new Date();
  const lines: string[] = [];
  let result: TestSignInResult;
  try {
    const identity = await input.run();
    lines.push(
      "The provider answered, and its ID token's signature, issuer, audience, expiry and nonce checked out.",
    );
    lines.push(
      identity.emailVerified
        ? `The email ${identity.email} is verified.`
        : `The email ${identity.email} isn't marked verified: Ronne would refuse this sign-in.`,
    );
    lines.push(
      identity.groups === null
        ? "No groups claim came back: group mappings would change nothing."
        : `Groups claim found: ${identity.groups.length} ${identity.groups.length === 1 ? "value" : "values"}.`,
    );
    const stored = await d.repo.find(providerId);
    if (!stored) return "/admin/settings?tab=authentication";
    const sso = kyselySsoRepository(app.db, app.dialect);
    const plan = await planSsoSignIn(sso, stored.provider, identity);
    let groupChanges: GroupChange[] = [];
    if (plan.action !== "refuse" && identity.groups !== null) {
      const existing = plan.action === "create" ? null : plan.user;
      if (existing?.role !== "root")
        groupChanges = planGroupChanges({
          providerId,
          groups: identity.groups,
          mappings: await sso.mappingsFor(providerId),
          memberships: existing
            ? await sso.membershipsOf(existing.id)
            : [{ workspaceId: GLOBAL_WORKSPACE_ID, role: "user", source: null }],
        });
    }
    result = {
      at: now.toISOString(),
      ok: identity.emailVerified,
      lines,
      claims: identity,
      decision: decisionText(plan),
      groupChanges,
    };
    if (result.ok) {
      try {
        await markProviderTested(
          d,
          { user, ip: clientIp(headers, app.trustProxy) },
          providerId,
          new Date(test.version),
        );
      } catch {
        result.ok = false;
        result.lines.push(
          "The provider was changed during the test, so it doesn't count: test it again.",
        );
      }
    }
  } catch (error) {
    if (error instanceof ProviderSecretUnreadableError) lines.push(error.message);
    else if (error instanceof ProviderFlowError)
      lines.push(
        error.reason === "provider_error"
          ? "The provider refused or didn't answer."
          : "The provider's answer didn't check out (signature, issuer, audience, expiry or nonce).",
      );
    else throw error;
    await d.repo.recordFailure(providerId, "test_failed", now);
    result = {
      at: now.toISOString(),
      ok: false,
      lines,
      claims: null,
      decision: null,
      groupChanges: [],
    };
  }
  const key = testKey(providerId, user.id);
  await app.db.deleteFrom("verification").where("identifier", "=", key).execute();
  await app.db
    .insertInto("verification")
    .values({
      id: newId(),
      identifier: key,
      value: encodeJson(result),
      expires_at: toDbDate(new Date(now.getTime() + 60 * 60_000), app.dialect),
      created_at: toDbDate(now, app.dialect),
      updated_at: toDbDate(now, app.dialect),
    })
    .execute();
  return `${input.next}&test=done`;
};
