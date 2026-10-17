import { isUniqueViolation } from "../../../db/locks";
import { InvalidEmailError, InvalidNameError } from "../exceptions/errors";
import type { VerifiedIdentity } from "../models/auth-provider-type";
import { emailInDomains, type IdentityProvider } from "../models/identity-provider";
import { normalizeEmail, normalizeName, type UserSummary } from "../models/user";
import type { SsoRepository } from "../repositories/sso-repository";

/**
 * Who a provider's verified identity is in Ronne (feature 106's decision list), in order:
 * 1. the email must be verified;
 * 2. a disabled account is refused;
 * 3. a known link (this provider and subject) signs in;
 * 4. else an account with this email is linked, if the provider links by email and that account
 *    has no other subject of this provider (a new subject with a linked email is someone else);
 * 5. else, for a listed domain, a new `user` is created (in `global`, a personal workspace, no
 *    password, never root) and linked;
 * 6. else nobody.
 */
export type SsoRefusal = "unverified_email" | "disabled" | "not_allowed";

export type SsoPlan =
  | { action: "sign_in"; user: UserSummary }
  | { action: "link"; user: UserSummary }
  | { action: "create"; email: string; name: string }
  | { action: "refuse"; reason: SsoRefusal; user?: UserSummary };

/** The name a new account gets: the provider's, by Create user's rule, else the email's local part. */
const nameFor = (identity: VerifiedIdentity, email: string): string => {
  try {
    return normalizeName(identity.name ?? "");
  } catch (error) {
    if (!(error instanceof InvalidNameError)) throw error;
    // Too long: cut by characters, never inside one; empty: the local part (at most 64).
    const chars = [...(identity.name?.trim() ?? "")];
    return chars.length > 0 ? chars.slice(0, 255).join("") : email.slice(0, email.indexOf("@"));
  }
};

/**
 * Only plain ASCII addresses are matched or created: lowercasing folds some other characters into
 * ASCII ones (the Kelvin sign `K` becomes `k`), which would map a provider's `Kate@…` onto
 * someone else's `kate@…`.
 */
const PLAIN_EMAIL = /^[\x21-\x7e]+$/;

/** What would happen, written nowhere: the sign-in's first half, and the whole of a *Test sign-in*. */
export const planSsoSignIn = async (
  repo: SsoRepository,
  provider: IdentityProvider,
  identity: VerifiedIdentity,
): Promise<SsoPlan> => {
  if (!identity.emailVerified) return { action: "refuse", reason: "unverified_email" };

  const linkedId = await repo.findLinkedUser(provider.id, identity.subject);
  const linked = linkedId ? await repo.findUser(linkedId) : null;
  if (linked) {
    if (linked.disabledAt) return { action: "refuse", reason: "disabled", user: linked };
    return { action: "sign_in", user: linked };
  }

  if (!PLAIN_EMAIL.test(identity.email.trim())) return { action: "refuse", reason: "not_allowed" };
  let email: string;
  try {
    email = normalizeEmail(identity.email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return { action: "refuse", reason: "not_allowed" };
    throw error;
  }
  const existing = await repo.findUserByEmail(email);
  // MySQL and MariaDB compare emails without accents (`kåte@` = `kate@`): only the exact address
  // is this person's. Another one that the database calls equal can't be linked, or created beside.
  if (existing && existing.email !== email)
    return { action: "refuse", reason: "not_allowed", user: existing };
  if (existing) {
    if (existing.disabledAt) return { action: "refuse", reason: "disabled", user: existing };
    if (!provider.linkByEmail) return { action: "refuse", reason: "not_allowed", user: existing };
    // Linked already to another subject of this provider: this is someone else with that address.
    if ((await repo.linkedSubjects(existing.id, provider.id)).length > 0)
      return { action: "refuse", reason: "not_allowed", user: existing };
    return { action: "link", user: existing };
  }
  if (emailInDomains(email, provider.domains))
    return { action: "create", email, name: nameFor(identity, email) };
  return { action: "refuse", reason: "not_allowed" };
};

export type SsoOutcome =
  | { ok: true; userId: string; email: string; root: boolean; created: boolean; linked: boolean }
  | { ok: false; reason: SsoRefusal; userId: string | null };

/**
 * Decides and writes it, one sign-in through a provider at a time (the provider's row is locked):
 * two first sign-ins of one person can't both create or link. A new account's email taken
 * meanwhile through another provider is decided again, once.
 */
export const signInWithProvider = async (
  repo: SsoRepository,
  provider: IdentityProvider,
  identity: VerifiedIdentity,
  context: { ip: string | null; now: Date },
): Promise<SsoOutcome> => {
  const attempt = () =>
    repo.transaction(async (trx): Promise<SsoOutcome> => {
      await trx.lockProvider(provider.id);
      const plan = await planSsoSignIn(trx, provider, identity);
      if (plan.action === "refuse")
        return { ok: false, reason: plan.reason, userId: plan.user?.id ?? null };
      if (plan.action === "sign_in")
        return {
          ok: true,
          userId: plan.user.id,
          email: plan.user.email,
          root: plan.user.role === "root",
          created: false,
          linked: false,
        };
      if (plan.action === "link") {
        await trx.linkAccount(plan.user.id, provider.id, identity.subject, context.now);
        await trx.recordAudit(
          {
            actorId: plan.user.id,
            action: "user.sso_linked",
            target: { type: "user", id: plan.user.id },
            metadata: { provider: provider.id, email: plan.user.email },
            ipAddress: context.ip,
          },
          context.now,
        );
        return {
          ok: true,
          userId: plan.user.id,
          email: plan.user.email,
          root: plan.user.role === "root",
          created: false,
          linked: true,
        };
      }
      const id = await trx.createUser({ email: plan.email, name: plan.name }, context.now);
      await trx.linkAccount(id, provider.id, identity.subject, context.now);
      await trx.recordAudit(
        {
          actorId: null,
          action: "user.created",
          target: { type: "user", id },
          metadata: { email: plan.email, role: "user", via: "sso", provider: provider.id },
          ipAddress: context.ip,
        },
        context.now,
      );
      return { ok: true, userId: id, email: plan.email, root: false, created: true, linked: true };
    });
  try {
    return await attempt();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return attempt();
  }
};
