import type { Kysely, Selectable } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson } from "../../../db/json";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database, ScimUserTable } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { ScimUserLink } from "../models/scim-user";
import { kyselyIdentityRepository } from "./kysely-identity-repository";
import type { ScimUserRepository } from "./scim-user-repository";

type Row = Selectable<ScimUserTable>;

const link = (row: Row): ScimUserLink => ({
  id: row.id,
  providerId: row.provider_id,
  userId: row.user_id,
  externalId: row.external_id,
  // Null only on a tombstone, which is never read as a link.
  userName: row.user_name ?? "",
  givenName: row.given_name,
  familyName: row.family_name,
  displayName: row.display_name,
  active: Boolean(row.active),
  createdAt: fromDbDate(row.created_at),
  updatedAt: fromDbDate(row.updated_at),
});

export const kyselyScimUserRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ScimUserRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const bool = (value: boolean) => toDbBoolean(value, dialect);
  const identity = kyselyIdentityRepository(db, dialect);
  /** Live links of the provider. */
  const live = (providerId: string) =>
    db
      .selectFrom("scim_users")
      .selectAll()
      .where("provider_id", "=", providerId)
      .where("deleted_at", "is", null);

  return {
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyScimUserRepository(trx, dialect)),
      ),

    identity,

    async lockProvider(providerId) {
      const row = await forUpdate(
        db.selectFrom("identity_providers").select("scim_enabled_at").where("id", "=", providerId),
        dialect,
      ).executeTakeFirst();
      return row ? { scimEnabled: row.scim_enabled_at !== null } : null;
    },

    async lockUser(userId) {
      await forUpdate(
        db.selectFrom("user").select("id").where("id", "=", userId),
        dialect,
      ).execute();
    },

    async findLink(providerId, id) {
      const row = await live(providerId).where("id", "=", id).executeTakeFirst();
      return row ? link(row) : null;
    },

    async findLinkByUserName(providerId, userName) {
      const row = await live(providerId).where("user_name", "=", userName).executeTakeFirst();
      // Byte for byte (the column is binary on MySQL too), checked again here.
      return row && row.user_name === userName ? link(row) : null;
    },

    async findLinkByExternalId(providerId, externalId) {
      const row = await live(providerId).where("external_id", "=", externalId).executeTakeFirst();
      return row && row.external_id === externalId ? link(row) : null;
    },

    async findTombstoneByExternalId(providerId, externalId) {
      const row = await db
        .selectFrom("scim_users")
        .select(["id", "user_id", "external_id"])
        .where("provider_id", "=", providerId)
        .where("deleted_at", "is not", null)
        .where("external_id", "=", externalId)
        .executeTakeFirst();
      return row && row.external_id === externalId ? { id: row.id, userId: row.user_id } : null;
    },

    async hasAnyLink(userId) {
      const row = await db
        .selectFrom("scim_users")
        .select("id")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      return Boolean(row);
    },

    async listLinks(providerId, { filter, startIndex, count }) {
      let query = live(providerId);
      if (filter) {
        if (filter.value === null) return { rows: [], total: 0 };
        const column =
          filter.attribute === "userName"
            ? "user_name"
            : filter.attribute === "externalId"
              ? "external_id"
              : "id";
        query = query.where(column, "=", filter.value);
      }
      const total = await query
        .clearSelect()
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow();
      const rows = await query
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .offset(startIndex - 1)
        .limit(count)
        .execute();
      // The database's match may be looser than ours (MySQL's collation on `id`): check exactly.
      const exact = filter
        ? rows.filter((row) =>
            filter.attribute === "userName"
              ? row.user_name === filter.value
              : filter.attribute === "externalId"
                ? row.external_id === filter.value
                : row.id === filter.value,
          )
        : rows;
      return { rows: exact.map(link), total: Number(total.n) - (rows.length - exact.length) };
    },

    async insertLink(row) {
      const id = newId();
      await db
        .insertInto("scim_users")
        .values({
          id,
          provider_id: row.providerId,
          user_id: row.userId,
          external_id: row.externalId,
          user_name: row.userName,
          given_name: row.givenName,
          family_name: row.familyName,
          display_name: row.displayName,
          active: bool(row.active),
          created_at: at(row.createdAt),
          updated_at: at(row.createdAt),
          deleted_at: null,
        })
        .execute();
      return id;
    },

    async updateLink(id, patch, now) {
      await db
        .updateTable("scim_users")
        .set({
          ...(patch.externalId !== undefined ? { external_id: patch.externalId } : {}),
          ...(patch.userName !== undefined ? { user_name: patch.userName } : {}),
          ...(patch.givenName !== undefined ? { given_name: patch.givenName } : {}),
          ...(patch.familyName !== undefined ? { family_name: patch.familyName } : {}),
          ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
          ...(patch.active !== undefined ? { active: bool(patch.active) } : {}),
          updated_at: at(now),
        })
        .where("id", "=", id)
        .execute();
    },

    async tombstoneLink(id, now) {
      await db
        .updateTable("scim_users")
        .set({ deleted_at: at(now), user_name: null, active: bool(false), updated_at: at(now) })
        .where("id", "=", id)
        .execute();
    },

    async deleteLink(id) {
      await db.deleteFrom("scim_users").where("id", "=", id).execute();
    },

    async removeFromGroups(providerId, userId) {
      const groups = await db
        .selectFrom("scim_group_members as m")
        .innerJoin("scim_groups as g", "g.id", "m.group_id")
        .select("g.id")
        .where("g.provider_id", "=", providerId)
        .where("m.user_id", "=", userId)
        .execute();
      const ids = groups.map((g) => g.id);
      if (ids.length > 0)
        await db
          .deleteFrom("scim_group_members")
          .where("user_id", "=", userId)
          .where("group_id", "in", ids)
          .execute();
      return ids;
    },

    async groupsOf(providerId, userId) {
      const rows = await db
        .selectFrom("scim_group_members as m")
        .innerJoin("scim_groups as g", "g.id", "m.group_id")
        .select(["g.id", "g.display_name"])
        .where("g.provider_id", "=", providerId)
        .where("m.user_id", "=", userId)
        .orderBy("g.display_name")
        .execute();
      return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
    },

    findUser: (userId) => identity.findUser(userId),
    findUserByEmail: (email) => identity.findUserByEmail(email),
    createUser: (user, now) => identity.createUserWithoutPassword({ ...user, role: "user" }, now),

    async updateUserProfile(userId, fields, now) {
      await db
        .updateTable("user")
        .set({
          ...(fields.email !== undefined ? { email: fields.email } : {}),
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          updated_at: at(now),
        })
        .where("id", "=", userId)
        .execute();
    },

    enableUser: (userId, now) => identity.enableUser(userId, now),

    async hasProviderAccount(userId, providerId) {
      const rows = await db
        .selectFrom("account")
        .select("provider_id")
        .where("user_id", "=", userId)
        .where("provider_id", "=", providerId)
        .execute();
      return rows.some((r) => r.provider_id === providerId);
    },

    async signedInThroughSince(userId, providerId, since) {
      // The provider is inside the event's JSON metadata (no column of its own): read the account's
      // recent sign-in events and check it here, the same way on every database.
      const rows = await db
        .selectFrom("audit_log")
        .select("metadata")
        .where("action", "=", "auth.sso_signed_in")
        .where("target_type", "=", "user")
        .where("target_id", "=", userId)
        .where("created_at", ">=", at(since))
        .orderBy("created_at", "desc")
        .limit(200)
        .execute();
      return rows.some((row) => {
        try {
          return decodeJson<{ provider?: unknown }>(row.metadata).provider === providerId;
        } catch {
          return false;
        }
      });
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
};
