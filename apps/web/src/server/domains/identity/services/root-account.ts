import { RootAlreadyExistsError, RootNotFoundError } from "../exceptions/errors";
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
 * Sets a new root password and treats the old credentials as untrusted: ends every root session,
 * revokes root's access tokens, and re-enables root if it was disabled.
 */
export const resetRootPassword = async (
  deps: IdentityDeps,
  password: string,
): Promise<{ email: string }> => {
  validatePassword(password);
  const passwordHash = await deps.hasher.hash(password);
  const now = (deps.now ?? (() => new Date()))();

  return deps.repo.transaction(async (repo) => {
    const root = await repo.findFirstRoot();
    if (!root) throw new RootNotFoundError();
    await repo.setPassword(root.id, passwordHash, now);
    const sessionsEnded = await repo.deleteSessions(root.id);
    const tokensRevoked = await repo.revokeAccessTokens(root.id, now);
    if (root.disabledAt) await repo.enableUser(root.id, now);
    await repo.recordAudit(
      {
        actorId: null,
        action: "user.password_reset",
        target: { type: "user", id: root.id },
        metadata: { via: "cli", sessionsEnded, tokensRevoked },
      },
      now,
    );
    return { email: root.email };
  });
};

export const findFirstRoot = async (deps: Pick<IdentityDeps, "repo">) => {
  return deps.repo.findFirstRoot();
};
