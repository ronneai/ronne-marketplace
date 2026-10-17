import type { Db } from "../../../db/create-db";
import { toDbBoolean } from "../../../db/dates";
import type { DatabaseDialect } from "../../../db/url";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { passwordSignInPolicy, setPasswordSignInPolicy } from "../../settings/services/settings";
import { ProviderSecretUnreadableError } from "../exceptions/errors";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { decryptSecret } from "../repositories/provider-secrets";

/**
 * `rmk-server disable-sso` (106): for when a provider breaks or can't be trusted. Turns every
 * identity provider off and sets password sign-in back to *Everyone*, so everyone with a password
 * can sign in again; each change audited as the command line's (`via: "cli"`). Links, group
 * memberships and the providers' settings stay, to turn back on later.
 */
export const ssoToDisable = async (db: Db, dialect: DatabaseDialect) => {
  const enabled = await db
    .selectFrom("identity_providers")
    .select("id")
    .where("enabled", "=", toDbBoolean(true, dialect))
    .orderBy("id")
    .execute();
  const policy = await passwordSignInPolicy({ repo: kyselySettingsRepository(db, dialect) });
  return { providers: enabled.map((p) => p.id), policy };
};

export const disableSso = async (
  db: Db,
  dialect: DatabaseDialect,
): Promise<{ providers: string[]; policyChanged: boolean }> => {
  const now = new Date();
  const providers = await kyselyIdentityProviderRepository(db, dialect).transaction(
    async (repo) => {
      const ids = await repo.disableAll(now);
      for (const provider of ids)
        await repo.recordAudit(
          {
            actorId: null,
            action: "instance.auth_provider_disabled",
            target: { type: "instance" },
            metadata: { provider, via: "cli" },
          },
          now,
        );
      return ids;
    },
  );
  const { changed } = await setPasswordSignInPolicy(
    { repo: kyselySettingsRepository(db, dialect), now: () => now },
    { user: null, ip: null, system: true },
    "everyone",
    { usableProvider: async () => false, confirmed: true },
  );
  return { providers, policyChanged: changed };
};

/**
 * After a restore (099, 106): the identity providers' client secrets were encrypted with the
 * archive's AUTH_SECRET. Each one this server's `secret` can't read (all of them, with none) is
 * marked *Failing* with `secret_unreadable`, so the panel says to enter it again. Returns how
 * many.
 */
export const markUnreadableProviderSecrets = async (
  db: Db,
  dialect: DatabaseDialect,
  secret: string | undefined,
): Promise<number> => {
  const repo = kyselyIdentityProviderRepository(db, dialect);
  const now = new Date();
  let unreadable = 0;
  for (const { id, secretEnc } of await repo.secrets()) {
    try {
      if (!secret) throw new ProviderSecretUnreadableError();
      decryptSecret(secret, id, secretEnc);
    } catch (error) {
      if (!(error instanceof ProviderSecretUnreadableError)) throw error;
      await repo.recordFailure(id, "secret_unreadable", now);
      unreadable++;
    }
  }
  return unreadable;
};
