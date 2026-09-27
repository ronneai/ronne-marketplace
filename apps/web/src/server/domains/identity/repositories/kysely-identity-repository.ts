import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { isRole, type UserSummary } from "../models/user";
import type { IdentityRepository, NewUserWithPassword } from "./identity-repository";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  disabled_at: Date | string | null;
  created_at: Date | string;
};

const summary = (row: UserRow): UserSummary => {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    // A role outside the known three is shown as a plain user: it gets no permissions either way.
    role: isRole(row.role) ? row.role : "user",
    disabledAt: fromDbDate(row.disabled_at),
    createdAt: fromDbDate(row.created_at),
  };
};

/** Better Auth's provider id for email and password accounts. */
const CREDENTIAL_PROVIDER = "credential";

export const kyselyIdentityRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): IdentityRepository => {
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

    async findCredentialByEmail(email) {
      const row = await db
        .selectFrom("user")
        .leftJoin("account", (join) =>
          join
            .onRef("account.user_id", "=", "user.id")
            .on("account.provider_id", "=", CREDENTIAL_PROVIDER),
        )
        .select([
          "user.id",
          "user.email",
          "user.name",
          "user.role",
          "user.disabled_at",
          "account.password",
        ])
        .where("user.email", "=", email)
        .executeTakeFirst();
      if (!row) return null;
      return {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          role: isRole(row.role) ? row.role : "user",
        },
        disabledAt: fromDbDate(row.disabled_at),
        passwordHash: row.password ?? null,
      };
    },

    async findUser(userId) {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "role", "disabled_at", "created_at"])
        .where("id", "=", userId)
        .executeTakeFirst();
      return row ? summary(row) : null;
    },

    async listUsers({ search, role, status, cursor, limit }) {
      let query = db
        .selectFrom("user")
        .select(["id", "email", "name", "role", "disabled_at", "created_at"])
        .orderBy("id", "desc")
        .limit(limit);
      if (search)
        query = query.where((eb) =>
          eb.or([containsInsensitive("email", search), containsInsensitive("name", search)]),
        );
      if (role) query = query.where("role", "=", role);
      if (status === "active") query = query.where("disabled_at", "is", null);
      if (status === "disabled") query = query.where("disabled_at", "is not", null);
      if (cursor) query = query.where("id", "<", cursor);
      return (await query.execute()).map(summary);
    },

    async emailTaken(email) {
      const row = await db
        .selectFrom("user")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirst();
      return Boolean(row);
    },

    async setRole(userId, role, now) {
      await db
        .updateTable("user")
        .set({ role, updated_at: at(now) })
        .where("id", "=", userId)
        .execute();
    },

    async disableUser(userId, now) {
      await db
        .updateTable("user")
        .set({ disabled_at: at(now), updated_at: at(now) })
        .where("id", "=", userId)
        .execute();
    },

    async countActiveAccessTokens(userId) {
      const row = await db
        .selectFrom("access_tokens")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("user_id", "=", userId)
        .where("revoked_at", "is", null)
        .executeTakeFirstOrThrow();
      return Number(row.n);
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
};
