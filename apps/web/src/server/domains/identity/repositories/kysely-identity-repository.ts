import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { isRole } from "../models/user";
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

    async findActiveUser(userId) {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "role"])
        .where("id", "=", userId)
        .where("disabled_at", "is", null)
        .executeTakeFirst();
      // A role outside the three known ones gets no access rather than a guess.
      if (!row || !isRole(row.role)) return null;
      return { id: row.id, email: row.email, name: row.name, role: row.role };
    },

    async userStatusByEmail(email) {
      const row = await db
        .selectFrom("user")
        .select("disabled_at")
        .where("email", "=", email)
        .executeTakeFirst();
      if (!row) return null;
      return row.disabled_at ? "disabled" : "active";
    },

    async countSessions(userId) {
      const row = await db
        .selectFrom("session")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();
      return Number(row.n);
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
      const result = await db
        .deleteFrom("session")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    async revokeAccessTokens(userId, now) {
      const result = await db
        .updateTable("access_tokens")
        .set({ revoked_at: at(now) })
        .where("user_id", "=", userId)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
}
