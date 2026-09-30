import type { Db } from "../../../db/create-db";
import type { DatabaseDialect } from "../../../db/url";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/root-account";

/** Entry points for setup (terminal and web) and reset-root-password. Thin: they wire the dependencies. */
const deps = (db: Db, dialect: DatabaseDialect): service.IdentityDeps => {
  return { repo: kyselyIdentityRepository(db, dialect), hasher: argon2PasswordHasher };
};

export const createRoot = (
  db: Db,
  dialect: DatabaseDialect,
  input: service.NewRoot,
  origin?: service.RootOrigin,
) => service.createRootUser(deps(db, dialect), input, origin);

export const resetRootPassword = (db: Db, dialect: DatabaseDialect, password: string) =>
  service.resetRootPassword(deps(db, dialect), password);

export const findRoot = (db: Db, dialect: DatabaseDialect) => service.findRoot(deps(db, dialect));
