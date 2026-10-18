import type { Kysely, Selectable } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson, encodeJson } from "../../../db/json";
import type { Database, IdentityProviderTable } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import type { IdentityProvider } from "../models/identity-provider";
import type { IdentityProviderRepository, ProviderRow } from "./identity-provider-repository";

const toProvider = (row: Selectable<IdentityProviderTable>): IdentityProvider => ({
  id: row.id,
  type: row.type,
  preset: row.preset,
  name: row.name,
  enabled: Boolean(row.enabled),
  config: decodeJson<Record<string, unknown>>(row.config),
  hasSecret: row.secret_enc !== null,
  domains: decodeJson<string[]>(row.domains),
  linkByEmail: Boolean(row.link_by_email),
  groupsClaim: row.groups_claim,
  testedAt: fromDbDate(row.tested_at),
  testedBy: row.tested_by,
  lastSignedInAt: fromDbDate(row.last_signed_in_at),
  failures: Number(row.failures),
  lastFailureAt: fromDbDate(row.last_failure_at),
  lastFailureReason: row.last_failure_reason,
  createdAt: fromDbDate(row.created_at),
  updatedAt: fromDbDate(row.updated_at),
});

export const kyselyIdentityProviderRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): IdentityProviderRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const bool = (value: boolean) => toDbBoolean(value, dialect);
  const columns = (row: ProviderRow) => ({
    type: row.type,
    preset: row.preset,
    name: row.name,
    config: encodeJson(row.config),
    secret_enc: row.secretEnc,
    domains: encodeJson(row.domains),
    link_by_email: bool(row.linkByEmail),
    groups_claim: row.groupsClaim,
    tested_at: row.testedAt ? at(row.testedAt) : null,
    tested_by: row.testedBy,
    enabled: bool(row.enabled),
  });

  return {
    async list() {
      const rows = await db.selectFrom("identity_providers").selectAll().orderBy("name").execute();
      return rows.map(toProvider);
    },

    async find(id) {
      const row = await db
        .selectFrom("identity_providers")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      // MySQL compares ids without case: only the exact id is this provider.
      return row && row.id === id ? { provider: toProvider(row), secretEnc: row.secret_enc } : null;
    },

    async insert(id, row, createdBy, now) {
      await db
        .insertInto("identity_providers")
        .values({
          id,
          ...columns(row),
          created_by: createdBy,
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
    },

    async update(id, row, now, expected) {
      const result = await db
        .updateTable("identity_providers")
        .set({ ...columns(row), updated_at: at(now) })
        .where("id", "=", id)
        .where("updated_at", "=", at(expected))
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },

    async setEnabled(id, enabled, now, expected) {
      const result = await db
        .updateTable("identity_providers")
        .set({ enabled: bool(enabled), updated_at: at(now) })
        .where("id", "=", id)
        .where("updated_at", "=", at(expected))
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },

    async markTested(id, by, now, expected) {
      const result = await db
        .updateTable("identity_providers")
        .set({
          tested_at: at(now),
          tested_by: by,
          failures: 0,
          last_failure_at: null,
          last_failure_reason: null,
        })
        .where("id", "=", id)
        .where("updated_at", "=", at(expected))
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },

    async recordFailure(id, reason, now) {
      await db
        .updateTable("identity_providers")
        .set((eb) => ({
          failures: eb("failures", "+", 1),
          last_failure_at: at(now),
          last_failure_reason: reason,
        }))
        .where("id", "=", id)
        .execute();
    },

    async recordSignIn(id, now) {
      await db
        .updateTable("identity_providers")
        .set({
          last_signed_in_at: at(now),
          failures: 0,
          last_failure_at: null,
          last_failure_reason: null,
        })
        .where("id", "=", id)
        .execute();
    },

    async delete(id) {
      await db.deleteFrom("identity_providers").where("id", "=", id).execute();
    },

    async releaseSourcedMemberships(providerId, now) {
      const rows = await db
        .selectFrom("workspace_members as m")
        .innerJoin("workspaces as w", "w.id", "m.workspace_id")
        .innerJoin("user as u", "u.id", "m.user_id")
        .select([
          "m.workspace_id as workspaceId",
          "w.name as workspaceName",
          "m.user_id as userId",
          "u.email as email",
          "m.role as role",
        ])
        // Provider ids are lowercase only, so MySQL's case-blind comparison can't match another.
        .where("m.source", "=", providerId)
        .execute();
      const removed = rows.filter((r) => r.workspaceId !== GLOBAL_WORKSPACE_ID);
      const lowered = rows.filter((r) => r.workspaceId === GLOBAL_WORKSPACE_ID);
      if (removed.length > 0)
        await db
          .deleteFrom("workspace_members")
          .where("source", "=", providerId)
          .where("workspace_id", "<>", GLOBAL_WORKSPACE_ID)
          .execute();
      if (lowered.length > 0)
        await db
          .updateTable("workspace_members")
          .set({ role: "user", source: null, updated_at: at(now) })
          .where("source", "=", providerId)
          .where("workspace_id", "=", GLOBAL_WORKSPACE_ID)
          .execute();
      return { removed, lowered };
    },

    async disableAllScim(now) {
      const rows = await db
        .selectFrom("identity_providers")
        .select("id")
        .where("scim_enabled_at", "is not", null)
        .orderBy("id")
        .execute();
      if (rows.length > 0)
        await db
          .updateTable("identity_providers")
          .set({ scim_enabled_at: null, updated_at: at(now) })
          .where("scim_enabled_at", "is not", null)
          .execute();
      return rows.map((r) => r.id);
    },

    async disableAll(now) {
      const rows = await db
        .selectFrom("identity_providers")
        .select("id")
        .where("enabled", "=", bool(true))
        .execute();
      if (rows.length > 0)
        await db
          .updateTable("identity_providers")
          .set({ enabled: bool(false), updated_at: at(now) })
          .where("enabled", "=", bool(true))
          .execute();
      return rows.map((r) => r.id);
    },

    async secrets() {
      const rows = await db
        .selectFrom("identity_providers")
        .select(["id", "secret_enc"])
        .where("secret_enc", "is not", null)
        .execute();
      return rows.map((r) => ({ id: r.id, secretEnc: r.secret_enc as string }));
    },

    async setSecret(id, secretEnc) {
      await db
        .updateTable("identity_providers")
        .set({ secret_enc: secretEnc })
        .where("id", "=", id)
        .execute();
    },

    async listMappings(providerId) {
      const rows = await db
        .selectFrom("provider_group_mappings as g")
        .leftJoin("workspaces as w", "w.id", "g.workspace_id")
        .select(["g.group_name", "g.workspace_id", "w.name", "g.role"])
        .where("g.provider_id", "=", providerId)
        .orderBy("g.created_at")
        .orderBy("g.id")
        .execute();
      return rows.map((r) => ({
        group: r.group_name,
        workspaceId: r.workspace_id,
        workspaceName: r.name ?? null,
        role: r.role,
      }));
    },

    async replaceMappings(providerId, mappings, now) {
      await db
        .deleteFrom("provider_group_mappings")
        .where("provider_id", "=", providerId)
        .execute();
      if (mappings.length > 0)
        await db
          .insertInto("provider_group_mappings")
          .values(
            mappings.map((m) => ({
              id: newId(),
              provider_id: providerId,
              group_name: m.group,
              workspace_id: m.workspaceId,
              role: m.role,
              created_at: at(now),
            })),
          )
          .execute();
    },

    async findWorkspace(workspaceId) {
      const row = await db
        .selectFrom("workspaces")
        .select(["id", "name", "owner_id"])
        .where("id", "=", workspaceId)
        .executeTakeFirst();
      return row && row.id === workspaceId
        ? { name: row.name, personal: row.owner_id !== null }
        : null;
    },

    transaction: (work) =>
      db.transaction().execute((trx) => work(kyselyIdentityProviderRepository(trx, dialect))),

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
};
