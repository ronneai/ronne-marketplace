import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { decodeJson } from "../../../db/json";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { AuditMetadata } from "../../audit/models/audit-event";
import type { UserDataItem, UserDataSignInMethod, UserDataVersion } from "../models/user-data";
import { kyselyIdentityRepository } from "./kysely-identity-repository";
import type { UserDataRepository } from "./user-data-repository";

const DELETED_PROVIDER = "(deleted provider)";
/** Ids per `in (…)` list, under the databases' parameter limits. */
const CHUNK = 500;

const chunks = <T>(values: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK));
  return out;
};

export const kyselyUserDataRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): UserDataRepository => {
  const providerNames = async (): Promise<Map<string, string>> =>
    new Map(
      (await db.selectFrom("identity_providers").select(["id", "name"]).execute()).map((row) => [
        row.id,
        row.name,
      ]),
    );

  return {
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyUserDataRepository(trx, dialect)),
      ),

    async lockUser(userId) {
      await forUpdate(
        db.selectFrom("user").select("id").where("id", "=", userId),
        dialect,
      ).execute();
      return kyselyIdentityRepository(db, dialect).findUser(userId);
    },

    async exportedSince(userId, since) {
      const row = await db
        .selectFrom("audit_log")
        .select("created_at")
        .where("action", "=", "user.data_exported")
        .where("target_type", "=", "user")
        .where("target_id", "=", userId)
        .where("created_at", ">", toDbDate(since, dialect))
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return row ? fromDbDate(row.created_at) : null;
    },

    async lastExported(userId) {
      const row = await db
        .selectFrom("audit_log")
        .select("created_at")
        .where("action", "=", "user.data_exported")
        .where("target_type", "=", "user")
        .where("target_id", "=", userId)
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return row ? fromDbDate(row.created_at) : null;
    },

    async account(userId) {
      const user = await db
        .selectFrom("user")
        .select(["id", "name", "email", "role", "created_at", "disabled_at", "two_factor_enabled"])
        .where("id", "=", userId)
        .executeTakeFirst();
      if (!user) return null;
      const names = await providerNames();
      // `password` is never selected: whether there is one is what the file says.
      const accounts = await db
        .selectFrom("account")
        .select(["provider_id", "created_at", "password"])
        .where("user_id", "=", userId)
        .orderBy("created_at")
        .orderBy("id")
        .execute();
      const signInMethods: UserDataSignInMethod[] = [];
      for (const row of accounts) {
        if (row.provider_id !== "credential")
          signInMethods.push({
            provider: names.get(row.provider_id) ?? DELETED_PROVIDER,
            linkedAt: fromDbDate(row.created_at),
          });
        else if (row.password) signInMethods.push("password");
      }
      const scim = await db
        .selectFrom("scim_users")
        .select(["provider_id", "external_id", "active"])
        .where("user_id", "=", userId)
        .where("deleted_at", "is", null)
        .orderBy("created_at")
        .limit(1)
        .executeTakeFirst();
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: fromDbDate(user.created_at),
        disabledAt: user.disabled_at ? fromDbDate(user.disabled_at) : null,
        twoFactorEnabled: Boolean(user.two_factor_enabled),
        signInMethods,
        scim: scim
          ? {
              provider: names.get(scim.provider_id) ?? DELETED_PROVIDER,
              externalId: scim.external_id,
              active: Boolean(scim.active),
            }
          : null,
      };
    },

    async sessions(userId, limit) {
      const rows = await db
        .selectFrom("session")
        .select(["created_at", "expires_at", "ip_address", "user_agent"])
        .where("user_id", "=", userId)
        .orderBy("created_at")
        .orderBy("id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        createdAt: fromDbDate(row.created_at),
        expiresAt: fromDbDate(row.expires_at),
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
      }));
    },

    async accessTokens(userId, limit) {
      const rows = await db
        .selectFrom("access_tokens")
        .select([
          "name",
          "token_prefix",
          "created_at",
          "created_via",
          "last_used_at",
          "expires_at",
          "revoked_at",
        ])
        .where("user_id", "=", userId)
        .orderBy("created_at")
        .orderBy("id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        name: row.name,
        prefix: row.token_prefix,
        createdAt: fromDbDate(row.created_at),
        createdVia: row.created_via,
        lastUsedAt: row.last_used_at ? fromDbDate(row.last_used_at) : null,
        expiresAt: row.expires_at ? fromDbDate(row.expires_at) : null,
        revokedAt: row.revoked_at ? fromDbDate(row.revoked_at) : null,
      }));
    },

    async deviceGrants(userId, limit) {
      const rows = await db
        .selectFrom("device_grants")
        .select(["name", "status", "created_at", "decided_at"])
        .where("user_id", "=", userId)
        .orderBy("created_at")
        .orderBy("id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        name: row.name,
        status: row.status,
        createdAt: fromDbDate(row.created_at),
        decidedAt: row.decided_at ? fromDbDate(row.decided_at) : null,
      }));
    },

    async workspaces(userId, limit) {
      const names = await providerNames();
      const rows = await db
        .selectFrom("workspace_members")
        .innerJoin("workspaces", "workspaces.id", "workspace_members.workspace_id")
        .select([
          "workspaces.name as name",
          "workspace_members.role as role",
          "workspace_members.created_at as since",
          "workspace_members.source as source",
        ])
        .where("workspace_members.user_id", "=", userId)
        .orderBy("workspace_members.created_at")
        .orderBy("workspaces.name")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        name: row.name,
        role: row.role,
        since: fromDbDate(row.since),
        source: row.source ? (names.get(row.source) ?? DELETED_PROVIDER) : null,
      }));
    },

    async accessRequests(userId, limit) {
      const rows = await db
        .selectFrom("workspace_access_requests")
        .select(["workspace_name", "status", "message", "created_at"])
        .where("user_id", "=", userId)
        .orderBy("created_at")
        .orderBy("id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        workspace: row.workspace_name,
        status: row.status,
        message: row.message,
        createdAt: fromDbDate(row.created_at),
      }));
    },

    async scopes(userId, limit) {
      const rows = await db
        .selectFrom("scopes")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select(["scopes.name as name", "workspaces.name as workspace", "scopes.created_at as at"])
        .where("scopes.created_by", "=", userId)
        .orderBy("scopes.created_at")
        .orderBy("scopes.id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        name: `@${row.name}`,
        workspace: row.workspace,
        createdAt: fromDbDate(row.at),
      }));
    },

    async items(userId, limit) {
      // One row per version the person published, or of an item they own (a version's author may
      // be someone else): the versions are what's bounded, items are their groups.
      const rows = await db
        .selectFrom("item_versions")
        .innerJoin("items", "items.id", "item_versions.item_id")
        .innerJoin("scopes", "scopes.id", "items.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "items.id as itemId",
          "items.name as name",
          "items.type as type",
          "items.owner_id as ownerId",
          "scopes.name as scope",
          "workspaces.name as workspace",
          "item_versions.version as version",
          "item_versions.published_at as publishedAt",
          "item_versions.published_by as publishedBy",
        ])
        .where((eb) =>
          eb.or([eb("items.owner_id", "=", userId), eb("item_versions.published_by", "=", userId)]),
        )
        .orderBy("item_versions.published_at")
        .orderBy("item_versions.id")
        .limit(limit)
        .execute();
      const items = new Map<string, UserDataItem>();
      for (const row of rows) {
        const version: UserDataVersion = {
          version: row.version,
          publishedAt: fromDbDate(row.publishedAt),
          publishedByMe: row.publishedBy === userId,
        };
        const item = items.get(row.itemId);
        if (item) item.versions.push(version);
        else
          items.set(row.itemId, {
            name: `@${row.scope}/${row.name}`,
            workspace: row.workspace,
            type: row.type,
            owner: row.ownerId === userId,
            versions: [version],
          });
      }
      return { items: [...items.values()], versions: rows.length };
    },

    async submissions(userId, limit) {
      const rows = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "submissions.id as id",
          "submissions.name as name",
          "scopes.name as scope",
          "workspaces.name as workspace",
          "submissions.status as status",
          "submissions.created_at as createdAt",
          "submissions.submitted_at as submittedAt",
        ])
        .where("submissions.author_id", "=", userId)
        .orderBy("submissions.created_at")
        .orderBy("submissions.id")
        .limit(limit)
        .execute();
      const files = new Map<string, string[]>();
      const revisions = new Map<string, number>();
      for (const ids of chunks(rows.map((row) => row.id))) {
        const paths = await db
          .selectFrom("submission_files")
          .select(["submission_id", "path"])
          .where("submission_id", "in", ids)
          .orderBy("path")
          .execute();
        for (const { submission_id, path } of paths)
          files.set(submission_id, [...(files.get(submission_id) ?? []), path]);
        const numbers = await db
          .selectFrom("submission_revisions")
          .select(["submission_id", "number"])
          .where("submission_id", "in", ids)
          .execute();
        for (const { submission_id, number } of numbers)
          revisions.set(submission_id, Math.max(revisions.get(submission_id) ?? 0, number));
      }
      return rows.map((row) => ({
        name: `@${row.scope}/${row.name}`,
        workspace: row.workspace,
        status: row.status,
        createdAt: fromDbDate(row.createdAt),
        submittedAt: row.submittedAt ? fromDbDate(row.submittedAt) : null,
        revisions: revisions.get(row.id) ?? 0,
        files: files.get(row.id) ?? [],
      }));
    },

    async comments(userId, limit) {
      const rows = await db
        .selectFrom("review_events")
        .innerJoin("submissions", "submissions.id", "review_events.submission_id")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "submissions.name as name",
          "scopes.name as scope",
          "workspaces.name as workspace",
          "review_events.kind as kind",
          "review_events.body as body",
          "review_events.created_at as at",
        ])
        .where("review_events.actor_id", "=", userId)
        .where("review_events.body", "is not", null)
        .orderBy("review_events.created_at")
        .orderBy("review_events.id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        submission: `@${row.scope}/${row.name}`,
        workspace: row.workspace,
        kind: row.kind,
        body: row.body,
        createdAt: fromDbDate(row.at),
      }));
    },

    async auditEvents(userId, limit) {
      const rows = await db
        .selectFrom("audit_log")
        .select([
          "created_at",
          "action",
          "actor_id",
          "target_type",
          "target_id",
          "ip_address",
          "metadata",
        ])
        .where((eb) =>
          eb.or([
            eb("actor_id", "=", userId),
            eb.and([eb("target_type", "=", "user"), eb("target_id", "=", userId)]),
          ]),
        )
        .orderBy("created_at")
        .orderBy("id")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        at: fromDbDate(row.created_at),
        action: row.action,
        as: row.actor_id === userId ? ("actor" as const) : ("target" as const),
        target: { type: row.target_type, id: row.target_id },
        // The address of whoever else acted on the person is theirs, not the person's.
        ipAddress: row.actor_id === userId ? row.ip_address : null,
        metadata: decodeJson<AuditMetadata>(row.metadata),
      }));
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
};
