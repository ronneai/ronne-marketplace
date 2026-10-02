import {
  CannotModifySelfError,
  EmailTakenError,
  ForbiddenError,
  InvalidRoleError,
  LastRootError,
  UserNotFoundError,
} from "../exceptions/errors";
import { generatePassword } from "../models/generated-password";
import { validatePassword } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import { requirePermission } from "../models/permissions";
import {
  type CurrentUser,
  isRole,
  normalizeEmail,
  normalizeName,
  type Role,
  type UserSummary,
} from "../models/user";
import type { IdentityRepository, UserListQuery } from "../repositories/identity-repository";

/**
 * Root's user admin (feature 008). Every operation checks the permission first, refuses the
 * actor's own row (roots manage each other, not themselves: 059), and writes its change and its
 * 007 event in one transaction.
 */
export type UserAdminDeps = {
  repo: IdentityRepository;
  hasher: PasswordHasher;
  now?: () => Date;
};

/** Who's acting, and from where (the client IP, when it can be trusted). */
export type Actor = { user: CurrentUser | null; ip: string | null };

export const USERS_PAGE_SIZE = 50;
export const USER_SEARCH_MAX_LENGTH = 100;

const now = (deps: UserAdminDeps) => (deps.now ?? (() => new Date()))();

export type UsersPage = { users: UserSummary[]; nextCursor: string | null };

export const listUsers = async (
  deps: UserAdminDeps,
  actor: Actor,
  query: Omit<UserListQuery, "limit">,
): Promise<UsersPage> => {
  requirePermission(actor.user, "users.view");
  const search = query.search?.trim().slice(0, USER_SEARCH_MAX_LENGTH) || undefined;
  const rows = await deps.repo.listUsers({ ...query, search, limit: USERS_PAGE_SIZE + 1 });
  const users = rows.slice(0, USERS_PAGE_SIZE);
  return {
    users,
    nextCursor: rows.length > USERS_PAGE_SIZE ? (users.at(-1)?.id ?? null) : null,
  };
};

/** The password root chose, or a generated one. Either way it's shown once, then only its hash exists. */
const choosePassword = (typed: string | undefined): string => {
  if (typed === undefined) return generatePassword();
  validatePassword(typed);
  return typed;
};

const checkRole = (role: string): Role => {
  if (!isRole(role)) throw new InvalidRoleError(role);
  return role;
};

/**
 * Starts every change: locks the roots' rows and the actor's, then checks again that the actor is
 * still an active root. Two roots changing each other at once then run one after the other, and
 * the second finds it was demoted or disabled meanwhile (059).
 */
const lockAndRecheckActor = async (repo: IdentityRepository, actor: Actor): Promise<void> => {
  const id = actor.user?.id;
  if (!id) throw new ForbiddenError("users.manage");
  await repo.lockRoots(id);
  requirePermission(await repo.findActiveUser(id), "users.manage");
};

/** The instance always keeps an enabled root; the transaction rolls back otherwise (059). */
const keepAnActiveRoot = async (repo: IdentityRepository): Promise<void> => {
  if ((await repo.countActiveRoots()) === 0) throw new LastRootError();
};

/** Loads the target and refuses the actor's own row: another root changes it (059). */
const loadTarget = async (
  repo: IdentityRepository,
  actor: Actor,
  userId: string,
): Promise<UserSummary> => {
  if (userId === actor.user?.id) throw new CannotModifySelfError();
  const target = await repo.findUser(userId);
  if (!target) throw new UserNotFoundError();
  return target;
};

export type NewUserInput = {
  email: string;
  name: string;
  role: string;
  /** Leave out to generate one. */
  password?: string;
};

export const createUser = async (
  deps: UserAdminDeps,
  actor: Actor,
  input: NewUserInput,
): Promise<{ id: string; email: string; password: string }> => {
  requirePermission(actor.user, "users.manage");
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name);
  const role = checkRole(input.role);
  const password = choosePassword(input.password);
  const passwordHash = await deps.hasher.hash(password);
  const at = now(deps);

  const id = await deps.repo.transaction(async (repo) => {
    await lockAndRecheckActor(repo, actor);
    if (await repo.emailTaken(email)) throw new EmailTakenError(email);
    const created = await repo.createUserWithPassword({ email, name, role, passwordHash }, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.created",
        target: { type: "user", id: created },
        metadata: { email, role },
        ipAddress: actor.ip,
      },
      at,
    );
    return created;
  });
  return { id, email, password };
};

export const changeRole = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
  newRole: string,
): Promise<void> => {
  requirePermission(actor.user, "users.manage");
  const role = checkRole(newRole);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await lockAndRecheckActor(repo, actor);
    const target = await loadTarget(repo, actor, userId);
    if (target.role === role) return;
    await repo.setRole(userId, role, at);
    await keepAnActiveRoot(repo);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.role_changed",
        target: { type: "user", id: userId },
        metadata: { from: target.role, to: role },
        ipAddress: actor.ip,
      },
      at,
    );
  });
};

/** Signs the user out everywhere and revokes their access tokens. Already disabled: nothing to do. */
export const disableUser = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
): Promise<void> => {
  requirePermission(actor.user, "users.manage");
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await lockAndRecheckActor(repo, actor);
    const target = await loadTarget(repo, actor, userId);
    if (target.disabledAt) return;
    await repo.disableUser(userId, at);
    await keepAnActiveRoot(repo);
    const sessionsEnded = await repo.deleteSessions(userId);
    const tokensRevoked = await repo.revokeAccessTokens(userId, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.disabled",
        target: { type: "user", id: userId },
        metadata: { sessionsEnded, tokensRevoked },
        ipAddress: actor.ip,
      },
      at,
    );
  });
};

/** Lets the user sign in again. Their revoked tokens stay revoked. */
export const enableUser = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
): Promise<void> => {
  requirePermission(actor.user, "users.manage");
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await lockAndRecheckActor(repo, actor);
    const target = await loadTarget(repo, actor, userId);
    if (!target.disabledAt) return;
    await repo.enableUser(userId, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.enabled",
        target: { type: "user", id: userId },
        ipAddress: actor.ip,
      },
      at,
    );
  });
};

/**
 * Sets a new password, typed or generated, and treats the old credentials as lost: it ends the
 * user's sessions and revokes their tokens. Returns the new password to show once.
 */
export const resetPassword = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
  typed?: string,
): Promise<{ email: string; password: string }> => {
  requirePermission(actor.user, "users.manage");
  const password = choosePassword(typed);
  const passwordHash = await deps.hasher.hash(password);
  const at = now(deps);
  const email = await deps.repo.transaction(async (repo) => {
    await lockAndRecheckActor(repo, actor);
    const target = await loadTarget(repo, actor, userId);
    await repo.setPassword(userId, passwordHash, at);
    const sessionsEnded = await repo.deleteSessions(userId);
    const tokensRevoked = await repo.revokeAccessTokens(userId, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.password_reset",
        target: { type: "user", id: userId },
        metadata: { via: "web", sessionsEnded, tokensRevoked },
        ipAddress: actor.ip,
      },
      at,
    );
    return target.email;
  });
  return { email, password };
};

/** What the disable dialog tells root before it happens. */
export const disableImpact = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
): Promise<{ sessions: number; tokens: number }> => {
  requirePermission(actor.user, "users.manage");
  await loadTarget(deps.repo, actor, userId);
  return {
    sessions: await deps.repo.countSessions(userId),
    tokens: await deps.repo.countActiveAccessTokens(userId),
  };
};
