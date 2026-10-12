import { UserNotFoundError } from "../exceptions/errors";
import { normalizeEmail } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";

export type InstanceAccessDeps = { repo: IdentityRepository; now?: () => Date };

/** Whose access `revoke-access` ends (098): everyone's, root's included, or one person's. */
export type AccessTarget = { kind: "everyone" } | { kind: "user"; email: string };

/** What it ends: sessions, access tokens, or both. */
export type AccessKinds = { sessions: boolean; tokens: boolean };

export type AccessCounts = {
  /** The person's email, for `--user`. */
  email?: string;
  sessions: number;
  tokens: number;
};

const findTarget = async (repo: IdentityRepository, email: string) => {
  const user = await repo.findUserByEmail(normalizeEmail(email));
  if (!user) throw new UserNotFoundError();
  return user;
};

/** How many sessions and not-revoked tokens there are now, for the question before revoking. */
export const accessToRevoke = async (
  deps: InstanceAccessDeps,
  target: AccessTarget,
): Promise<AccessCounts> => {
  const { repo } = deps;
  if (target.kind === "everyone")
    return {
      sessions: await repo.countAllSessions(),
      tokens: await repo.countAllActiveAccessTokens(),
    };
  const user = await findTarget(repo, target.email);
  return {
    email: user.email,
    sessions: await repo.countSessions(user.id),
    tokens: await repo.countActiveAccessTokens(user.id),
  };
};

/**
 * Ends sessions and revokes access tokens, everyone's or one person's, in one transaction with its
 * audit event (098, for incidents). Nobody is disabled and no password changes: people sign in
 * again and make new tokens. Returns what it ended; zeros when there was nothing left.
 */
export const revokeAccess = async (
  deps: InstanceAccessDeps,
  target: AccessTarget,
  kinds: AccessKinds,
): Promise<AccessCounts> => {
  const now = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const user = target.kind === "user" ? await findTarget(repo, target.email) : null;
    const sessions = !kinds.sessions
      ? 0
      : user
        ? await repo.deleteSessions(user.id)
        : await repo.deleteAllSessions();
    const tokens = !kinds.tokens
      ? 0
      : user
        ? await repo.revokeAccessTokens(user.id, now)
        : await repo.revokeAllAccessTokens(now);
    await repo.recordAudit(
      {
        actorId: null,
        action: "instance.access_revoked",
        target: user ? { type: "user", id: user.id } : { type: "instance", id: null },
        metadata: {
          via: "cli",
          scope: user ? "user" : "everyone",
          ...(user ? { email: user.email } : {}),
          sessionsEnded: sessions,
          tokensRevoked: tokens,
        },
      },
      now,
    );
    return user ? { email: user.email, sessions, tokens } : { sessions, tokens };
  });
};

/**
 * After a new AUTH_SECRET (098's `rotate-secret`): ends every session and records
 * `instance.secret_rotated`, then runs `writeSecret` before the transaction commits, so a settings
 * file that can't be written leaves the sessions as they were. Cookies signed with the old secret
 * would stop working after a restart anyway; ending the sessions now covers the server still
 * running with it. Never sees the secret itself. Returns how many sessions ended.
 */
export const endSessionsForNewSecret = async (
  deps: InstanceAccessDeps,
  writeSecret: () => void,
): Promise<number> => {
  const now = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const sessions = await repo.deleteAllSessions();
    await repo.recordAudit(
      {
        actorId: null,
        action: "instance.secret_rotated",
        target: { type: "instance", id: null },
        metadata: { via: "cli", sessionsEnded: sessions },
      },
      now,
    );
    writeSecret();
    return sessions;
  });
};
