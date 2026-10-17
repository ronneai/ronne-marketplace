import {
  NotARootError,
  RootAlreadyExistsError,
  RootNotFoundError,
  UserNotFoundError,
  WhichRootError,
} from "../exceptions/errors";
import { validatePassword } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import { normalizeEmail, normalizeName } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";

export type IdentityDeps = { repo: IdentityRepository; hasher: PasswordHasher; now?: () => Date };

export type NewRoot = { email: string; name: string; password: string };

/**
 * Where root is being created from, for the audit log: the command line (`pnpm run setup`) or the
 * web setup (feature 036), with the client's address when a trusted proxy gives one.
 */
export type RootOrigin = { via: "cli" | "web"; ipAddress?: string | null };

/**
 * Creates the one root account (MVP §5). Validates everything before writing, hashes the password,
 * and writes the user and its credential account in one transaction. Refuses when a root exists.
 */
export const createRootUser = async (
  deps: IdentityDeps,
  input: NewRoot,
  origin: RootOrigin = { via: "cli" },
): Promise<{ id: string; email: string }> => {
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name);
  validatePassword(input.password);
  const passwordHash = await deps.hasher.hash(input.password);
  const now = (deps.now ?? (() => new Date()))();

  return deps.repo.transaction(async (repo) => {
    const existing = await repo.findFirstRoot();
    if (existing) throw new RootAlreadyExistsError(existing.email);
    const id = await repo.createUserWithPassword({ email, name, role: "root", passwordHash }, now);
    // Nobody is signed in yet, so there's no actor; the origin says where setup ran.
    await repo.recordAudit(
      {
        actorId: null,
        action: "instance.root_created",
        target: { type: "user", id },
        metadata: { via: origin.via, email },
        ipAddress: origin.ipAddress ?? null,
      },
      now,
    );
    return { id, email };
  });
};

/**
 * Sets a new password for one root and treats the old credentials as untrusted: ends that root's
 * sessions, revokes its access tokens, and re-enables it if it was disabled. With several roots,
 * `email` says which one (059).
 */
export const resetRootPassword = async (
  deps: IdentityDeps,
  password: string,
  email?: string,
): Promise<{ email: string; twoFactorReset: boolean }> => {
  validatePassword(password);
  const wanted = email === undefined ? undefined : normalizeEmail(email);
  const passwordHash = await deps.hasher.hash(password);
  const now = (deps.now ?? (() => new Date()))();

  return deps.repo.transaction(async (repo) => {
    const roots = await repo.listRoots();
    if (roots.length === 0) throw new RootNotFoundError();
    if (wanted === undefined && roots.length > 1) throw new WhichRootError(roots.length);
    const root = wanted === undefined ? roots[0] : roots.find((r) => r.email === wanted);
    if (!root) throw new NotARootError(wanted ?? "");
    await repo.setPassword(root.id, passwordHash, now);
    const sessionsEnded = await repo.deleteSessions(root.id);
    const tokensRevoked = await repo.revokeAccessTokens(root.id, now);
    if (root.disabledAt) await repo.enableUser(root.id, now);
    // The terminal stays the last way in: a lost phone too (105).
    const twoFactorReset = await repo.resetTwoFactor(root.id, now);
    await repo.recordAudit(
      {
        actorId: null,
        action: "user.password_reset",
        target: { type: "user", id: root.id },
        metadata: {
          via: "cli",
          email: root.email,
          sessionsEnded,
          tokensRevoked,
          ...(twoFactorReset ? { twoFactorReset } : {}),
        },
      },
      now,
    );
    return { email: root.email, twoFactorReset };
  });
};

export const findFirstRoot = async (deps: Pick<IdentityDeps, "repo">) => {
  return deps.repo.findFirstRoot();
};

/** Every root, disabled or not, oldest first: for setup and reset-root-password (059). */
export const listRoots = async (deps: Pick<IdentityDeps, "repo">) => {
  return deps.repo.listRoots();
};

/**
 * `reset-two-factor --email` (105): any account's two-factor off from the terminal, with its
 * sessions ended, recorded with the actor `cli`. False when it had none (nothing recorded).
 */
export const resetTwoFactorFromCli = async (
  deps: Pick<IdentityDeps, "repo" | "now">,
  email: string,
): Promise<{ email: string; reset: boolean; sessionsEnded: number }> => {
  const wanted = normalizeEmail(email);
  const now = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const user = await repo.findUserByEmail(wanted);
    if (!user) throw new UserNotFoundError();
    if (!(await repo.resetTwoFactor(user.id, now)))
      return { email: user.email, reset: false, sessionsEnded: 0 };
    const sessionsEnded = await repo.deleteSessions(user.id);
    await repo.recordAudit(
      {
        actorId: null,
        action: "user.two_factor_reset",
        target: { type: "user", id: user.id },
        metadata: { via: "cli", email: user.email, sessionsEnded },
      },
      now,
    );
    return { email: user.email, reset: true, sessionsEnded };
  });
};

/**
 * Whether the account with this email has two-factor to reset (on, or a setup started), for the
 * command to ask first (105).
 */
export const twoFactorOfEmail = async (
  deps: Pick<IdentityDeps, "repo">,
  email: string,
): Promise<{ email: string; enabled: boolean }> => {
  const user = await deps.repo.findUserByEmail(normalizeEmail(email));
  if (!user) throw new UserNotFoundError();
  return { email: user.email, enabled: await deps.repo.hasTwoFactor(user.id) };
};
