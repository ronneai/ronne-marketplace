import type { Db } from "../../../db/create-db";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/instance-access";

/** Entry points for `revoke-access` (098). Thin: they wire the dependencies. */
const deps = (db: Db, dialect: DatabaseDialect): service.InstanceAccessDeps => {
  return { repo: kyselyIdentityRepository(db, dialect) };
};

export const accessToRevoke = (db: Db, dialect: DatabaseDialect, target: service.AccessTarget) =>
  service.accessToRevoke(deps(db, dialect), target);

export const revokeAccess = (
  db: Db,
  dialect: DatabaseDialect,
  target: service.AccessTarget,
  kinds: service.AccessKinds,
) => service.revokeAccess(deps(db, dialect), target, kinds);
