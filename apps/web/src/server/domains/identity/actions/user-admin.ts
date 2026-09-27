import { clientIp } from "../models/client-ip";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import type { UserListQuery } from "../repositories/identity-repository";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/user-admin";
import { getCurrentUser } from "./session";

export type { NewUserInput, UsersPage } from "../services/user-admin";

/**
 * Entry points for /admin/users (feature 008). Thin: they find who's asking from the request, and
 * wire the dependencies. The services check the permission. `app` defaults to the running server.
 */
function deps({ db, dialect }: AppAuth): service.UserAdminDeps {
  return { repo: kyselyIdentityRepository(db, dialect), hasher: argon2PasswordHasher };
}

async function actor(headers: Headers, app: AppAuth): Promise<service.Actor> {
  return { user: await getCurrentUser(headers, app), ip: clientIp(headers, app.trustProxy) };
}

export async function adminListUsers(
  headers: Headers,
  query: Omit<UserListQuery, "limit">,
  app: AppAuth = getAppAuth(),
) {
  return service.listUsers(deps(app), await actor(headers, app), query);
}

export async function adminCreateUser(
  headers: Headers,
  input: service.NewUserInput,
  app: AppAuth = getAppAuth(),
) {
  return service.createUser(deps(app), await actor(headers, app), input);
}

export async function adminChangeRole(
  headers: Headers,
  userId: string,
  role: string,
  app: AppAuth = getAppAuth(),
) {
  return service.changeRole(deps(app), await actor(headers, app), userId, role);
}

export async function adminDisableUser(
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) {
  return service.disableUser(deps(app), await actor(headers, app), userId);
}

export async function adminEnableUser(
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) {
  return service.enableUser(deps(app), await actor(headers, app), userId);
}

export async function adminResetPassword(
  headers: Headers,
  userId: string,
  password?: string,
  app: AppAuth = getAppAuth(),
) {
  return service.resetPassword(deps(app), await actor(headers, app), userId, password);
}

export async function adminDisableImpact(
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) {
  return service.disableImpact(deps(app), await actor(headers, app), userId);
}
