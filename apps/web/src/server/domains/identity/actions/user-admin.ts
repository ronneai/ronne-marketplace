import { clientIp } from "../models/client-ip";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import type { UserPageQuery } from "../repositories/identity-repository";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/user-admin";
import { getCurrentUser } from "./session";

export type { NewUserInput, UsersPage } from "../services/user-admin";

/**
 * Entry points for /admin/users (feature 008). Thin: they find who's asking from the request, and
 * wire the dependencies. The services check the permission. `app` defaults to the running server.
 */
const deps = ({ db, dialect }: AppAuth): service.UserAdminDeps => {
  return { repo: kyselyIdentityRepository(db, dialect), hasher: argon2PasswordHasher };
};

const actor = async (headers: Headers, app: AppAuth): Promise<service.Actor> => {
  return { user: await getCurrentUser(headers, app), ip: clientIp(headers, app.trustProxy) };
};

export const adminListUsers = async (
  headers: Headers,
  query: Partial<UserPageQuery>,
  app: AppAuth = getAppAuth(),
) => {
  return service.listUsers(deps(app), await actor(headers, app), query);
};

export const adminCreateUser = async (
  headers: Headers,
  input: service.NewUserInput,
  app: AppAuth = getAppAuth(),
) => {
  return service.createUser(deps(app), await actor(headers, app), input);
};

export const adminChangeRole = async (
  headers: Headers,
  userId: string,
  role: string,
  app: AppAuth = getAppAuth(),
) => {
  return service.changeRole(deps(app), await actor(headers, app), userId, role);
};

export const adminDisableUser = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) => {
  return service.disableUser(deps(app), await actor(headers, app), userId);
};

export const adminEnableUser = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) => {
  return service.enableUser(deps(app), await actor(headers, app), userId);
};

export const adminResetPassword = async (
  headers: Headers,
  userId: string,
  password?: string,
  app: AppAuth = getAppAuth(),
) => {
  return service.resetPassword(deps(app), await actor(headers, app), userId, password);
};

export const adminDisableImpact = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) => {
  return service.disableImpact(deps(app), await actor(headers, app), userId);
};
