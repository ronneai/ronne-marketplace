import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import type { IdentityRepository, NewUserWithPassword } from "./identity-repository";

/** Better Auth's provider id for email and password accounts. */
const CREDENTIAL_PROVIDER = "credential";

export function kyselyIdentityRepository(
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): IdentityRepository {
  const at = (date: Date) => toDbDate(date, dialect);

  return {
    transaction: (work) =>
      db.transaction().execute((trx) => work(kyselyIdentityRepository(trx, dialect))),

    async findRoot() {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "disabled_at"])
        .where("role", "=", "root")
        .orderBy("created_at")
        .executeTakeFirst();
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        disabledAt: fromDbDate(row.disabled_at),
      };
    },

    async createUserWithPassword(user: NewUserWithPassword, now: Date) {
      const id = newId();
      await db
        .insertInto("user")
        .values({
          id,
          name: user.name,
          email: user.email,
          email_verified: toDbBoolean(false, dialect),
          image: null,
          created_at: at(now),
          updated_at: at(now),
          role: user.role,
          disabled_at: null,
        })
        .execute();
      // Same shape Better Auth writes for email and password accounts: account_id is the user id.
      await db
        .insertInto("account")
        .values({
          id: newId(),
          account_id: id,
          provider_id: CREDENTIAL_PROVIDER,
          user_id: id,
          access_token: null,
          refresh_token: null,
          id_token: null,
          access_token_expires_at: null,
          refresh_token_expires_at: null,
          scope: null,
          password: user.passwordHash,
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
      return id;
    },

    async setPassword(userId, passwordHash, now) {
      await db
        .updateTable("account")
        .set({ password: passwordHash, updated_at: at(now) })
        .where("user_id", "=", userId)
        .where("provider_id", "=", CREDENTIAL_PROVIDER)
        .execute();
    },

    async enableUser(userId, now) {
      await db
        .updateTable("user")
        .set({ disabled_at: null, updated_at: at(now) })
        .where("id", "=", userId)
        .execute();
    },

    async deleteSessions(userId) {
      await db.deleteFrom("session").where("user_id", "=", userId).execute();
    },

    async revokeAccessTokens(userId, now) {
      await db
        .updateTable("access_tokens")
        .set({ revoked_at: at(now) })
        .where("user_id", "=", userId)
        .where("revoked_at", "is", null)
        .execute();
    },
  };
}
