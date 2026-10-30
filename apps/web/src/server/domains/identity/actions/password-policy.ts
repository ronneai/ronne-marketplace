import { toDbBoolean } from "../../../db/dates";
import type { PasswordSignInPolicy } from "../../settings/models/password-sign-in-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { passwordSignInPolicy } from "../../settings/services/settings";
import type { AppAuth } from "../repositories/auth-instance";

/**
 * Who may sign in with a password now (106): root's setting, but *Root only* holds only while an
 * identity provider is on, so turning every provider off (or `disable-sso`) gives everyone their
 * password back. Read on every sign-in, so a change takes effect at once. Reads the settings
 * service directly, not its actions (which import this domain's session).
 */
export const effectivePasswordPolicy = async (app: AppAuth): Promise<PasswordSignInPolicy> => {
  const stored = await passwordSignInPolicy({
    repo: kyselySettingsRepository(app.db, app.dialect),
  });
  if (stored === "everyone") return stored;
  const enabled = await app.db
    .selectFrom("identity_providers")
    .select("id")
    .where("enabled", "=", toDbBoolean(true, app.dialect))
    .limit(1)
    .executeTakeFirst();
  return enabled ? "root_only" : "everyone";
};

/** Whether root may choose *Root only*: a provider is on and has passed its test (106). */
export const hasUsableProvider = async (app: AppAuth): Promise<boolean> => {
  const row = await app.db
    .selectFrom("identity_providers")
    .select("id")
    .where("enabled", "=", toDbBoolean(true, app.dialect))
    .where("tested_at", "is not", null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
};

/** The providers people can sign in with, for the sign-in page's buttons: id and name only. */
export const signInProviders = async (
  app: AppAuth,
): Promise<{ id: string; name: string; preset: string }[]> =>
  app.db
    .selectFrom("identity_providers")
    .select(["id", "name", "preset"])
    .where("enabled", "=", toDbBoolean(true, app.dialect))
    .orderBy("name")
    .execute();

/** How many people would lose their password sign-in under *Root only*: active, with a password, not root. */
export const passwordUsersAffected = async (app: AppAuth): Promise<number> => {
  const row = await app.db
    .selectFrom("user as u")
    .innerJoin("account as a", "a.user_id", "u.id")
    .select((eb) => eb.fn.count<number | string | bigint>("u.id").distinct().as("n"))
    .where("a.provider_id", "=", "credential")
    .where("a.password", "is not", null)
    .where("u.role", "<>", "root")
    .where("u.disabled_at", "is", null)
    .executeTakeFirstOrThrow();
  return Number(row.n);
};
