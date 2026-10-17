import { isUniqueViolation } from "../../../db/locks";
import { InvalidEmailError, InvalidNameError } from "../exceptions/errors";
import type { VerifiedIdentity } from "../models/auth-provider-type";
import { emailInDomains, type IdentityProvider } from "../models/identity-provider";
import { normalizeEmail, normalizeName, type UserSummary } from "../models/user";
import type { SsoRepository } from "../repositories/sso-repository";
import { applyGroups } from "./group-sync";

/**
 * Who a provider's verified identity is in Ronne (feature 106's decision list), in order:
 * 1. the email must be verified;
 * 2. a disabled account is refused;
 * 3. a known link (this provider and subject) signs in;
 * 4. else an account with this email is linked, if the provider links by email, the email's domain
 *    is on the provider's list (a provider for `acme.com` can't claim a `gmail.com` account; root's
 *    account is linked like any other), and that account has no other subject of this provider (a
 *    new subject with a linked email is someone else);
 * 5. else, for a listed domain, a new `user` is created (in `global`, a personal workspace, no
 *    password, never root) and linked;
 * 6. else nobody.
 */
export type SsoRefusal = "unverified_email" | "disabled" | "not_allowed";

/**
 * Why `not_allowed`, for a *Test sign-in*'s result and the audit log (the person sees one message
 * for all): no account and an unlisted domain; an address Ronne can't use (not plain ASCII, not a
 * valid address, or another account's that the database compares as equal but isn't exactly); or an
 * existing account this provider can't link.
 */
export type SsoNotAllowed =
  | "domain_not_allowed"
  | "non_ascii_email"
  | "invalid_email"
  | "lookalike_email"
  | "link_off"
  | "domain_not_listed"
  | "linked_to_another";

export type SsoPlan =
  | { action: "sign_in"; user: UserSummary }
  | { action: "link"; user: UserSummary }
  | { action: "create"; email: string; name: string }
  | { action: "refuse"; reason: SsoRefusal; user?: UserSummary; why?: SsoNotAllowed };

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

  const notAllowed = (why: SsoNotAllowed, user?: UserSummary): SsoPlan => ({
    action: "refuse",
    reason: "not_allowed",
    why,
    ...(user ? { user } : {}),
  });
  // Only ASCII spaces are trimmed: any other character, whitespace or not, makes it not plain ASCII.
  const raw = identity.email.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if ([...raw].some((c) => (c.codePointAt(0) ?? 0) > 0x7f)) return notAllowed("non_ascii_email");
  // ASCII, but with a space or a control character inside: no address.
  if (!PLAIN_EMAIL.test(raw)) return notAllowed("invalid_email");
  let email: string;
  try {
    email = normalizeEmail(identity.email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return notAllowed("invalid_email");
    throw error;
  }
  const existing = await repo.findUserByEmail(email);
  // MySQL and MariaDB compare emails without accents (`kåte@` = `kate@`): only the exact address
  // is this person's. Another one that the database calls equal can't be linked, or created beside.
  if (existing && existing.email !== email) return notAllowed("lookalike_email", existing);
  if (existing) {
    if (existing.disabledAt) return { action: "refuse", reason: "disabled", user: existing };
    if (!provider.linkByEmail) return notAllowed("link_off", existing);
    if (!emailInDomains(email, provider.domains)) return notAllowed("domain_not_listed", existing);
    // Linked already to another subject of this provider: this is someone else with that address.
    if ((await repo.linkedSubjects(existing.id, provider.id)).length > 0)
      return notAllowed("linked_to_another", existing);
    return { action: "link", user: existing };
  }
  if (emailInDomains(email, provider.domains))
    return { action: "create", email, name: nameFor(identity, email) };
  return notAllowed("domain_not_allowed");
};

export type SsoOutcome =
  | { ok: true; userId: string; email: string; root: boolean; created: boolean; linked: boolean }
  | { ok: false; reason: SsoRefusal; userId: string | null; why?: SsoNotAllowed };

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
      const outcome = await decide(trx);
      // The groups, in the same transaction; never for root (nothing from a claim changes root).
      if (outcome.ok && !outcome.root)
        await applyGroups(trx, {
          providerId: provider.id,
          user: { id: outcome.userId, email: outcome.email },
          groups: identity.groups,
          ip: context.ip,
          now: context.now,
        });
      return outcome;
    });
  const decide = async (trx: SsoRepository): Promise<SsoOutcome> => {
    await trx.lockProvider(provider.id);
    const plan = await planSsoSignIn(trx, provider, identity);
    if (plan.action === "refuse")
      return {
        ok: false,
        reason: plan.reason,
        userId: plan.user?.id ?? null,
        ...(plan.why ? { why: plan.why } : {}),
      };
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
  };
  try {
    return await attempt();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return attempt();
  }
};
