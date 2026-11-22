import type { TermsRepository } from "../repositories/terms-repository";

/**
 * Accepting new terms (190). When root changes the terms version and ticks **Ask everyone to
 * accept again**, everyone who hasn't accepted it is held after a web sign-in until they do. The
 * web asks; access tokens, `rmk`, the MCP server and the device flow's API never do.
 */

/**
 * Root's terms: the link, the version it shows now, and the version everyone must have accepted
 * ("" for none), with when root asked for it. The two versions differ after a change root didn't
 * ask everyone to accept.
 */
export type InstanceTerms = {
  url: string;
  current: string;
  required: string;
  /** When root last asked everyone to accept: the required version's setting's time. */
  requiredSince: Date | null;
};

/** What the hold asks of a person: the link and the version, or null when nothing is asked. */
export type TermsToAccept = { url: string; version: string };

export type TermsDeps = { repo: TermsRepository; now?: () => Date };

/**
 * Whether the person has accepted since root last asked everyone: any acceptance at or after
 * that moment, whatever its version. Changes root made after without asking everyone again (one
 * or several) ask no one again, and a new sign-up, which accepts the version the link shows, isn't
 * held. An older acceptance never counts, of the same version label included: ticking **Ask
 * everyone to accept again** asks everyone, even with a label used before.
 */
const acceptedSinceAsked = async (repo: TermsRepository, userId: string, terms: InstanceTerms) =>
  terms.requiredSince
    ? repo.acceptedSince(userId, terms.requiredSince)
    : // No time on record (a setting written outside the panel): the version itself.
      repo.accepted(userId, terms.required);

/**
 * The terms a person must accept now, or null: no link, no version asked of everyone, or accepted
 * since root asked. Someone held is asked for the version the link shows, so what is recorded is
 * what they read.
 */
export const termsToAccept = async (
  deps: TermsDeps,
  userId: string,
  terms: InstanceTerms,
): Promise<TermsToAccept | null> => {
  if (!terms.url || !terms.required) return null;
  if (await acceptedSinceAsked(deps.repo, userId, terms)) return null;
  return { url: terms.url, version: terms.current || terms.required };
};

export type TermsAccepted =
  | { ok: true }
  /** The box wasn't ticked. */
  | { ok: false; error: "unticked" }
  /** Root changed the version while the page was open: it shows the new one. */
  | { ok: false; error: "changed" };

/**
 * **Continue** on the hold page: the box ticked, for the version the page showed. Recorded with its
 * time once each time root asks, and audited as `user.terms_accepted`.
 */
export const acceptTerms = async (
  deps: TermsDeps,
  actor: { userId: string; ip: string | null },
  input: { accepted: unknown; version: unknown },
  terms: InstanceTerms,
): Promise<TermsAccepted> => {
  if (!terms.url || !terms.required) return { ok: true };
  if (input.accepted !== true) return { ok: false, error: "unticked" };
  const asked = terms.current || terms.required;
  if (input.version !== asked) return { ok: false, error: "changed" };
  const at = (deps.now ?? (() => new Date()))();
  await deps.repo.transaction(async (repo) => {
    // A double click, or two tabs at once: the person's row is locked, so one row. A new row
    // whenever they're still held, even for a version they accepted before root asked.
    await repo.lockUser(actor.userId);
    if (await acceptedSinceAsked(repo, actor.userId, terms)) return;
    // Never before the moment root asked: a server whose clock is behind root's can't record an
    // acceptance the hold would then ignore.
    const when =
      terms.requiredSince && terms.requiredSince > at ? new Date(terms.requiredSince) : at;
    await repo.record(actor.userId, asked, when);
    await repo.recordAudit(
      {
        actorId: actor.userId,
        action: "user.terms_accepted",
        target: { type: "user", id: actor.userId },
        metadata: { version: asked },
        ipAddress: actor.ip,
      },
      at,
    );
  });
  return { ok: true };
};
