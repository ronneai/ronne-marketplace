import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { countCapped, paginate } from "../../../db/keyset";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createPersonalWorkspace } from "../../../db/personal-workspaces";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { isRole, isWorkspaceRole, type RootAccount, type UserSummary } from "../models/user";
import type {
  IdentityRepository,
  NewUserWithPassword,
  UserFilters,
  UserSort,
} from "./identity-repository";

/** Admins first, then moderators, then users: how the users list names someone's roles. */
const ROLE_ORDER = { admin: 0, moderator: 1, user: 2 } as const;

import { loadMemberships, loadPersonal } from "./memberships";

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
    // A role outside the known two is shown as a plain user: it gets no permissions either way.
    role: isRole(row.role) ? row.role : "user",
    disabledAt: fromDbDate(row.disabled_at),
    createdAt: fromDbDate(row.created_at),
  };
};

/** Better Auth's provider id for email and password accounts. */
const CREDENTIAL_PROVIDER = "credential";

const USER_SORT_COLUMNS: Record<UserSort, string> = {
  // ULIDs sort by creation time, so the id alone orders by "created".
  created: "id",
  email: "email",
  name: "name",
};

export const kyselyIdentityRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): IdentityRepository => {
  const at = (date: Date) => toDbDate(date, dialect);

  const filteredUsers = ({ search, role, status }: UserFilters) => {
    let query = db.selectFrom("user");
    if (search)
      query = query.where((eb) =>
        eb.or([containsInsensitive("email", search), containsInsensitive("name", search)]),
      );
    if (role) query = query.where("role", "=", role);
    if (status === "active") query = query.where("disabled_at", "is", null);
    if (status === "disabled") query = query.where("disabled_at", "is not", null);
    return query;
  };

  const listRoots = async (): Promise<RootAccount[]> => {
    const rows = await db
      .selectFrom("user")
      .select(["id", "email", "name", "disabled_at"])
      .where("role", "=", "root")
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      disabledAt: fromDbDate(row.disabled_at),
    }));
  };

  /**
   * A user, its credential account when it has a password (none for someone who signs in with a
   * provider only, 106), its `global` row and its personal workspace, in the caller's transaction.
   */
  const insertUser = async (
    user: Omit<NewUserWithPassword, "passwordHash">,
    passwordHash: string | null,
    now: Date,
  ): Promise<string> => {
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
    if (passwordHash !== null)
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
          password: passwordHash,
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
    // Every user is in `global` (091); a root is in every workspace without a row.
    if (user.role !== "root")
      await db
        .insertInto("workspace_members")
        .values({
          workspace_id: GLOBAL_WORKSPACE_ID,
          user_id: id,
          role: user.globalRole ?? "user",
          added_by: null,
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
    // A personal workspace of their own (114), roots too, in the same transaction.
    await createPersonalWorkspace(db, dialect, { id, email: user.email }, now);
    return id;
  };

  return {
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyIdentityRepository(trx, dialect)),
      ),

    async findFirstRoot() {
      return (await listRoots())[0] ?? null;
    },

    listRoots,

    async countActiveRoots() {
      const row = await db
        .selectFrom("user")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("role", "=", "root")
        .where("disabled_at", "is", null)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    async lockRoots(actorId) {
      await forUpdate(
        db
          .selectFrom("user")
          .select("id")
          .where((eb) => eb.or([eb("role", "=", "root"), eb("id", "=", actorId)])),
        dialect,
      ).execute();
    },

    async findActiveUser(userId) {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "role"])
        .where("id", "=", userId)
        .where("disabled_at", "is", null)
        .executeTakeFirst();
      // A role outside the two known ones gets no access rather than a guess.
      if (!row || !isRole(row.role)) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        workspaces: await loadMemberships(db, row.id),
        personal: await loadPersonal(db, row.id),
      };
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
          "user.two_factor_enabled",
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
          workspaces: await loadMemberships(db, row.id),
          personal: await loadPersonal(db, row.id),
        },
        disabledAt: fromDbDate(row.disabled_at),
        passwordHash: row.password ?? null,
        twoFactor: Boolean(row.two_factor_enabled),
      };
    },

    async twoFactorCoverageRows() {
      const rows = await db
        .selectFrom("user")
        .leftJoin("account", (join) =>
          join
            .onRef("account.user_id", "=", "user.id")
            .on("account.provider_id", "=", CREDENTIAL_PROVIDER),
        )
        // Enrolled as the hold reads it (the store's `enabled`): the flag and a confirmed record.
        .leftJoin("two_factor", "two_factor.user_id", "user.id")
        .select((eb) => [
          "user.role",
          "user.two_factor_enabled",
          "two_factor.verified",
          "account.password",
          // A moderator or admin of a shared workspace: not their own personal one (114).
          eb
            .exists(
              eb
                .selectFrom("workspace_members")
                .innerJoin("workspaces", "workspaces.id", "workspace_members.workspace_id")
                .select("workspace_members.user_id")
                .whereRef("workspace_members.user_id", "=", "user.id")
                .where("workspace_members.role", "in", ["moderator", "admin"])
                .where("workspaces.owner_id", "is", null),
            )
            .as("reviewer"),
        ])
        .where("user.disabled_at", "is", null)
        .execute();
      return rows.map((row) => ({
        root: row.role === "root",
        reviewer: Boolean(row.reviewer),
        hasPassword: Boolean(row.password),
        enrolled: Boolean(row.two_factor_enabled) && Boolean(row.verified),
      }));
    },

    async findUser(userId) {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "role", "disabled_at", "created_at"])
        .where("id", "=", userId)
        .executeTakeFirst();
      return row ? summary(row) : null;
    },

    async findUserByEmail(email) {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "role", "disabled_at", "created_at"])
        .where("email", "=", email)
        .executeTakeFirst();
      return row ? summary(row) : null;
    },

    async pageUsers({ sort, dir, size, cursor, ...filters }) {
      const page = await paginate(
        filteredUsers(filters).select(["id", "email", "name", "role", "disabled_at", "created_at"]),
        {
          sort: { key: sort, column: USER_SORT_COLUMNS[sort], dir },
          idColumn: "id",
          size,
          cursor,
          sortValue: (row) => (sort === "created" ? row.id : row[sort]),
          idOf: (row) => row.id,
        },
      );
      // The page's memberships, by workspace name, in one query (091).
      const ids = page.rows.map((row) => row.id);
      const memberships =
        ids.length === 0
          ? []
          : await db
              .selectFrom("workspace_members")
              .innerJoin("workspaces", "workspaces.id", "workspace_members.workspace_id")
              .select(["workspace_members.user_id", "workspace_members.role", "workspaces.name"])
              .where("workspace_members.user_id", "in", ids)
              // Not their own personal workspace (114): everyone has one, and it's no shared role.
              .where((eb) =>
                eb.or([
                  eb("workspaces.owner_id", "is", null),
                  eb("workspaces.owner_id", "!=", eb.ref("workspace_members.user_id")),
                ]),
              )
              .orderBy("workspaces.name")
              .execute();
      // Who on the page has two-factor on, as the hold reads it (105).
      const enrolled =
        ids.length === 0
          ? []
          : await db
              .selectFrom("user")
              .innerJoin("two_factor", "two_factor.user_id", "user.id")
              .select("user.id")
              .where("user.id", "in", ids)
              .where("user.two_factor_enabled", "=", toDbBoolean(true, dialect))
              .where("two_factor.verified", "=", toDbBoolean(true, dialect))
              .execute();
      const withTwoFactor = new Set(enrolled.map((row) => row.id));
      return {
        ...page,
        rows: page.rows.map((row) => ({
          ...summary(row),
          twoFactor: withTwoFactor.has(row.id),
          workspaces: memberships
            .filter((m) => m.user_id === row.id && isWorkspaceRole(m.role))
            .map((m) => ({ name: m.name, role: m.role }))
            .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]),
        })),
      };
    },

    countUsers: (filters) => countCapped(db, filteredUsers(filters).select("id")),

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
      // Someone who stops being root keeps their rows, and is in `global` like everyone (091).
      if (role !== "root") {
        const inGlobal = await db
          .selectFrom("workspace_members")
          .select("user_id")
          .where("workspace_id", "=", GLOBAL_WORKSPACE_ID)
          .where("user_id", "=", userId)
          .executeTakeFirst();
        if (!inGlobal)
          await db
            .insertInto("workspace_members")
            .values({
              workspace_id: GLOBAL_WORKSPACE_ID,
              user_id: userId,
              role: "user",
              added_by: null,
              created_at: at(now),
              updated_at: at(now),
            })
            .execute();
      }
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

    createUserWithPassword(user: NewUserWithPassword, now: Date) {
      return insertUser(user, user.passwordHash, now);
    },

    createUserWithoutPassword(user, now) {
      return insertUser(user, null, now);
    },

    async providerSecrets() {
      const rows = await db
        .selectFrom("identity_providers")
        .select(["id", "secret_enc"])
        .where("secret_enc", "is not", null)
        .execute();
      return rows.map((r) => ({ id: r.id, secretEnc: r.secret_enc as string }));
    },

    async setProviderSecret(id, secretEnc) {
      await db
        .updateTable("identity_providers")
        .set({ secret_enc: secretEnc })
        .where("id", "=", id)
        .execute();
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

    async resetTwoFactor(userId, now) {
      const record = await db
        .deleteFrom("two_factor")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      const flag = await db
        .updateTable("user")
        .set({ two_factor_enabled: toDbBoolean(false, dialect), updated_at: at(now) })
        .where("id", "=", userId)
        .where("two_factor_enabled", "=", toDbBoolean(true, dialect))
        .executeTakeFirst();
      // An unfinished setup's "same browser" record (two-factor-setup:<id>).
      await db
        .deleteFrom("verification")
        .where("identifier", "=", `two-factor-setup:${userId}`)
        .execute();
      return Number(record.numDeletedRows) > 0 || Number(flag.numUpdatedRows) > 0;
    },

    async hasTwoFactor(userId) {
      const row = await db
        .selectFrom("user")
        .leftJoin("two_factor", "two_factor.user_id", "user.id")
        .select(["user.two_factor_enabled", "two_factor.id as record"])
        .where("user.id", "=", userId)
        .executeTakeFirst();
      return Boolean(row?.two_factor_enabled) || Boolean(row?.record);
    },

    async twoFactorOn(userId) {
      const row = await db
        .selectFrom("user")
        .innerJoin("two_factor", "two_factor.user_id", "user.id")
        .select("user.id")
        .where("user.id", "=", userId)
        .where("user.two_factor_enabled", "=", toDbBoolean(true, dialect))
        .where("two_factor.verified", "=", toDbBoolean(true, dialect))
        .executeTakeFirst();
      return Boolean(row);
    },

    async clearAllTwoFactor(now) {
      const records = await db.deleteFrom("two_factor").executeTakeFirst();
      await db
        .updateTable("user")
        .set({ two_factor_enabled: toDbBoolean(false, dialect), updated_at: at(now) })
        .where("two_factor_enabled", "=", toDbBoolean(true, dialect))
        .execute();
      await db
        .deleteFrom("verification")
        .where("identifier", "like", "two-factor-setup:%")
        .execute();
      return Number(records.numDeletedRows);
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

    async countAllSessions() {
      const row = await db
        .selectFrom("session")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    async countAllActiveAccessTokens() {
      const row = await db
        .selectFrom("access_tokens")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("revoked_at", "is", null)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    async deleteAllSessions() {
      const result = await db.deleteFrom("session").executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    async revokeAllAccessTokens(now) {
      const result = await db
        .updateTable("access_tokens")
        .set({ revoked_at: at(now) })
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    async cancelAccessRequests(userId, now) {
      const result = await db
        .updateTable("workspace_access_requests")
        .set({ status: "cancelled", decided_at: at(now) })
        .where("user_id", "=", userId)
        .where("status", "=", "open")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
};
