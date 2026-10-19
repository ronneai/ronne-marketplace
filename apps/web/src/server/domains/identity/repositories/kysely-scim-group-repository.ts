import type { Kysely, Selectable } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database, ScimGroupTable } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { groupNames, type ScimGroupRow } from "../models/scim-group";
import { kyselyIdentityRepository } from "./kysely-identity-repository";
import { kyselySsoRepository } from "./kysely-sso-repository";
import type { ScimGroupRepository, ScimMemberLink } from "./scim-group-repository";

const group = (row: Selectable<ScimGroupTable>): ScimGroupRow => ({
  id: row.id,
  providerId: row.provider_id,
  displayName: row.display_name,
  externalId: row.external_id,
  createdAt: fromDbDate(row.created_at),
  updatedAt: fromDbDate(row.updated_at),
});

export const kyselyScimGroupRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ScimGroupRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const identity = kyselyIdentityRepository(db, dialect);
  const groups = (providerId: string) =>
    db.selectFrom("scim_groups").selectAll().where("provider_id", "=", providerId);
  /** Live links joined to their account, for members. */
  const links = (providerId: string) =>
    db
      .selectFrom("scim_users as l")
      .innerJoin("user as u", "u.id", "l.user_id")
      .select(["l.id", "l.user_id", "l.display_name", "u.name"])
      .where("l.provider_id", "=", providerId)
      .where("l.deleted_at", "is", null);
  const member = (row: {
    id: string;
    user_id: string;
    display_name: string | null;
    name: string;
  }): ScimMemberLink => ({
    linkId: row.id,
    userId: row.user_id,
    display: row.display_name ?? row.name,
  });

  return {
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyScimGroupRepository(trx, dialect)),
      ),

    groupSync: kyselySsoRepository(db, dialect),

    async lockProvider(providerId) {
      const row = await forUpdate(
        db.selectFrom("identity_providers").select("scim_enabled_at").where("id", "=", providerId),
        dialect,
      ).executeTakeFirst();
      return row ? { scimEnabled: row.scim_enabled_at !== null } : null;
    },

    async findGroup(providerId, id) {
      const row = await groups(providerId).where("id", "=", id).executeTakeFirst();
      return row && row.id === id ? group(row) : null;
    },

    async findGroupByExternalId(providerId, externalId) {
      const row = await groups(providerId).where("external_id", "=", externalId).executeTakeFirst();
      return row && row.external_id === externalId ? group(row) : null;
    },

    async listGroups(providerId, { filter, startIndex, count }) {
      let query = groups(providerId);
      if (filter) {
        const column =
          filter.attribute === "displayName"
            ? "display_name"
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
      // Names and ids compare byte for byte (the columns are binary on MySQL); checked again here.
      const exact = filter
        ? rows.filter((row) =>
            filter.attribute === "displayName"
              ? row.display_name === filter.value
              : filter.attribute === "externalId"
                ? row.external_id === filter.value
                : row.id === filter.value,
          )
        : rows;
      return { rows: exact.map(group), total: Number(total.n) - (rows.length - exact.length) };
    },

    async insertGroup(row) {
      const id = newId();
      await db
        .insertInto("scim_groups")
        .values({
          id,
          provider_id: row.providerId,
          display_name: row.displayName,
          external_id: row.externalId,
          created_at: at(row.createdAt),
          updated_at: at(row.createdAt),
        })
        .execute();
      return id;
    },

    async updateGroup(id, fields, now) {
      await db
        .updateTable("scim_groups")
        .set({
          ...(fields.displayName !== undefined ? { display_name: fields.displayName } : {}),
          ...(fields.externalId !== undefined ? { external_id: fields.externalId } : {}),
          updated_at: at(now),
        })
        .where("id", "=", id)
        .execute();
    },

    async deleteGroup(id) {
      await db.deleteFrom("scim_group_members").where("group_id", "=", id).execute();
      await db.deleteFrom("scim_groups").where("id", "=", id).execute();
    },

    async memberIds(groupId) {
      const rows = await db
        .selectFrom("scim_group_members")
        .select("user_id")
        .where("group_id", "=", groupId)
        .orderBy("user_id")
        .execute();
      return rows.map((r) => r.user_id);
    },

    async addMember(groupId, userId, now) {
      await db
        .insertInto("scim_group_members")
        .values({ group_id: groupId, user_id: userId, created_at: at(now) })
        .execute();
    },

    async removeMember(groupId, userId) {
      await db
        .deleteFrom("scim_group_members")
        .where("group_id", "=", groupId)
        .where("user_id", "=", userId)
        .execute();
    },

    async liveLinks(providerId, linkIds) {
      if (linkIds.length === 0) return [];
      const rows = await links(providerId).where("l.id", "in", linkIds).execute();
      return rows.filter((r) => linkIds.includes(r.id)).map(member);
    },

    async linksOfUsers(providerId, userIds) {
      if (userIds.length === 0) return [];
      const rows = await links(providerId)
        .where("l.user_id", "in", userIds)
        .orderBy("l.id")
        .execute();
      return rows.map(member);
    },

    async groupNamesOf(providerId, userId) {
      const rows = await db
        .selectFrom("scim_group_members as m")
        .innerJoin("scim_groups as g", "g.id", "m.group_id")
        .select(["g.display_name", "g.external_id"])
        .where("g.provider_id", "=", providerId)
        .where("m.user_id", "=", userId)
        .execute();
      return rows.flatMap((r) =>
        groupNames({ displayName: r.display_name, externalId: r.external_id }),
      );
    },

    findUser: (userId) => identity.findUser(userId),

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
};
