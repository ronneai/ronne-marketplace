import type { Db } from "../../../db/create-db";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { twoFactorSecretsReadable } from "../repositories/two-factor-secrets";
import * as service from "../services/instance-access";

/**
 * Entry points for `revoke-access` and `rotate-secret` (098), and a restore's two-factor check
 * (105). Thin: they wire the dependencies.
 */
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

export const endSessionsForNewSecret = (
  db: Db,
  dialect: DatabaseDialect,
  writeSecret: () => void,
) => service.endSessionsForNewSecret(deps(db, dialect), writeSecret);

export const clearTwoFactorAfterRestore = (
  db: Db,
  dialect: DatabaseDialect,
  secrets: { archived?: string; secret?: string },
) =>
  service.clearTwoFactorAfterRestore(
    { ...deps(db, dialect), readable: (secret) => twoFactorSecretsReadable(db, secret) },
    secrets,
  );
