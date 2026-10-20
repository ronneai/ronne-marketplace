import {
  CannotModifySelfError,
  EmailTakenError,
  ForbiddenError,
  InvalidRoleError,
  LastRootError,
  UserErasedError,
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
import type { IdentityRepository, UserPageQuery } from "../repositories/identity-repository";

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

export type UsersPage = {
  users: UserSummary[];
  next: string | null;
  previous: string | null;
  total: { count: number; capped: boolean };
};

/** One page of users and the capped count of all that match (keyset, 061). */
export const listUsers = async (
  deps: UserAdminDeps,
  actor: Actor,
  query: Partial<UserPageQuery>,
): Promise<UsersPage> => {
  requirePermission(actor.user, "users.view");
  const search = query.search?.trim().slice(0, USER_SEARCH_MAX_LENGTH) || undefined;
  const filters = { search, role: query.role, status: query.status };
  const sort = query.sort ?? "created";
  const [page, total] = await Promise.all([
    deps.repo.pageUsers({
      ...filters,
      sort,
      dir: query.dir ?? (sort === "created" ? "desc" : "asc"),
      size: query.size ?? USERS_PAGE_SIZE,
      cursor: query.cursor,
    }),
    deps.repo.countUsers(filters),
  ]);
  return {
    users: await withLastSignIn(deps.repo, page.rows),
    next: page.next,
    previous: page.previous,
    total,
  };
};

/**
 * Each user's last web sign-in (123), from one query for all of them. An erased account gets none:
 * nothing about when the person last signed in is shown (103).
 */
const withLastSignIn = async (repo: IdentityRepository, users: UserSummary[]) => {
  const last = await repo.lastSignIns(users.filter((u) => !u.erasedAt).map((u) => u.id));
  return users.map((u) => ({ ...u, lastSignInAt: u.erasedAt ? null : (last.get(u.id) ?? null) }));
};

/** One user's page for root (123): the account as the list shows it, and what signing out would end. */
export type UserDetail = { user: UserSummary; sessions: number; tokens: number };

/** Any user, root's own and an erased one included: the page shows them, read-only. */
export const getUser = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
): Promise<UserDetail> => {
  requirePermission(actor.user, "users.view");
  const found = await deps.repo.findUserDetail(userId);
  if (!found) throw new UserNotFoundError();
  const [user] = await withLastSignIn(deps.repo, [found]);
  // Sessions and tokens end with an erase (103): there is nothing to count.
  const erased = Boolean(found.erasedAt);
  return {
    user: user ?? found,
    sessions: erased ? 0 : await deps.repo.countSessions(userId),
    tokens: erased ? 0 : await deps.repo.countActiveAccessTokens(userId),
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

/**
 * The instance always keeps an enabled root; the transaction rolls back otherwise (059). An erased
 * row never counts, whatever its role says (103).
 */
const keepAnActiveRoot = async (repo: IdentityRepository): Promise<void> => {
  if ((await repo.countActiveRoots()) === 0) throw new LastRootError();
};

/**
 * What disabling an account does, in the caller's transaction, after the row is set: keeps an
 * enabled root (059), ends the sessions, revokes the tokens and cancels the requests to join (094).
 * Returns the counts for the event. Disable user (root) and SCIM deprovisioning (108) share it, so
 * both end access the same way.
 */
export const disableAccount = async (
  repo: IdentityRepository,
  userId: string,
  at: Date,
): Promise<Record<string, number>> => {
  await repo.disableUser(userId, at);
  await keepAnActiveRoot(repo);
  const sessionsEnded = await repo.deleteSessions(userId);
  const tokensRevoked = await repo.revokeAccessTokens(userId, at);
  // Their requests to join go with them (094); the event counts them when there were any.
  const requestsCancelled = await repo.cancelAccessRequests(userId, at);
  return { sessionsEnded, tokensRevoked, ...(requestsCancelled > 0 ? { requestsCancelled } : {}) };
};

/**
 * Loads the target and refuses the actor's own row (another root changes it, 059) and an erased
 * account (nothing changes it again: no enable, disable, role, password or two-factor, 103).
 */
const loadTarget = async (
  repo: IdentityRepository,
  actor: Actor,
  userId: string,
): Promise<UserSummary> => {
  if (userId === actor.user?.id) throw new CannotModifySelfError();
  const target = await repo.findUser(userId);
  if (!target) throw new UserNotFoundError();
  if (target.erasedAt) throw new UserErasedError();
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
    const ended = await disableAccount(repo, userId, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.disabled",
        target: { type: "user", id: userId },
        metadata: ended,
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

/**
 * Turns the user's two-factor off, for a lost phone and lost backup codes (105), and ends their
 * sessions. Never the actor's own (059). False when it isn't on (as the users list shows it; a
 * setup they've only started is theirs to finish): nothing changes, nothing is recorded.
 */
export const resetTwoFactor = async (
  deps: UserAdminDeps,
  actor: Actor,
  userId: string,
): Promise<{ email: string; reset: boolean }> => {
  requirePermission(actor.user, "users.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    await lockAndRecheckActor(repo, actor);
    const target = await loadTarget(repo, actor, userId);
    if (!(await repo.twoFactorOn(userId))) return { email: target.email, reset: false };
    await repo.resetTwoFactor(userId, at);
    const sessionsEnded = await repo.deleteSessions(userId);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "user.two_factor_reset",
        target: { type: "user", id: userId },
        metadata: { via: "web", sessionsEnded },
        ipAddress: actor.ip,
      },
      at,
    );
    return { email: target.email, reset: true };
  });
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
