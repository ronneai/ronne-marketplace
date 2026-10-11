import { formatItemName, parseItemName } from "@ronneai/core";
import type { Kysely } from "kysely";
import { toDbBoolean } from "../../../db/dates";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../models/viewer";
import type { WorkspaceVisibility } from "../models/workspace";
import type { WorkspaceRepository } from "./workspace-repository";

type ScopeMoveMethods = Pick<
  WorkspaceRepository,
  | "scopeById"
  | "scopeNamed"
  | "itemsInScope"
  | "scopeReleasedDependencies"
  | "scopeOpenWork"
  | "openSubmissionsOutsideScope"
  | "resolveItems"
  | "resolveOpenSubmissions"
  | "membersAmong"
  | "notReviewedIn"
>;

/** The `IN (...)` lists stay well under every database's limit on bound values. */
const IN_LIST_SIZE = 500;

const textOf = (file: { content: string; encoding: "utf8" | "base64" }) =>
  file.encoding === "utf8" ? file.content : Buffer.from(file.content, "base64").toString("utf8");

const visibilityOf = (value: string): WorkspaceVisibility =>
  value === "public" ? "public" : "private";

/**
 * The checks that moving a scope reads (feature 115): its items, what depends on them, what they
 * depend on, its open work and its not-reviewed versions. They read everything (root's view): the
 * service decides what the asker is told.
 */
export const scopeMoveMethods = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ScopeMoveMethods => {
  /** Each submission's working ronne.yaml: frozen once submitted, so what a release packs. */
  const manifests = async (ids: readonly string[]) => {
    const found = new Map<string, string>();
    for (let i = 0; i < ids.length; i += IN_LIST_SIZE) {
      const rows = await db
        .selectFrom("submission_files")
        .select(["submission_id", "content", "encoding"])
        .where("submission_id", "in", ids.slice(i, i + IN_LIST_SIZE))
        .where("path", "=", "ronne.yaml")
        .execute();
      for (const row of rows) found.set(row.submission_id, textOf(row));
    }
    return found;
  };

  return {
    scopeById: async (id) => {
      const row = await db
        .selectFrom("scopes")
        .select(["id", "name", "workspace_id"])
        .where("id", "=", id)
        .executeTakeFirst();
      return row ? { id: row.id, name: row.name, workspaceId: row.workspace_id } : null;
    },

    scopeNamed: async (workspaceId, name) => {
      const rows = await db
        .selectFrom("scopes")
        .select("name")
        .where("workspace_id", "=", workspaceId)
        .where("name", "=", name)
        .execute();
      // Byte for byte: MySQL's collation would match a name in another case.
      return rows.some((row) => row.name === name);
    },

    itemsInScope: async (scopeId) =>
      db
        .selectFrom("items")
        .select(["id", "name"])
        .where("scope_id", "=", scopeId)
        .orderBy("name")
        .orderBy("id")
        .execute(),

    scopeReleasedDependencies: async (scopeId) => {
      const rows = await db
        .selectFrom("version_dependencies")
        .innerJoin("item_versions", "item_versions.id", "version_dependencies.version_id")
        .innerJoin("items as dependent", "dependent.id", "item_versions.item_id")
        .innerJoin("scopes as dependent_scope", "dependent_scope.id", "dependent.scope_id")
        .innerJoin(
          "workspaces as dependent_workspace",
          "dependent_workspace.id",
          "dependent_scope.workspace_id",
        )
        .innerJoin(
          "items as dependency",
          "dependency.id",
          "version_dependencies.depends_on_item_id",
        )
        .innerJoin("scopes as dependency_scope", "dependency_scope.id", "dependency.scope_id")
        .innerJoin(
          "workspaces as dependency_workspace",
          "dependency_workspace.id",
          "dependency_scope.workspace_id",
        )
        .select([
          "dependent_workspace.name as item_workspace",
          "dependent_scope.name as item_scope",
          "dependent.name as item_name",
          "dependency_workspace.id as workspace_id",
          "dependency_workspace.name as dependency_workspace",
          "dependency_workspace.visibility as visibility",
          "dependency_scope.name as dependency_scope",
          "dependency.name as dependency_name",
        ])
        .where("dependent.scope_id", "=", scopeId)
        .where("dependency.scope_id", "!=", scopeId)
        .where("item_versions.yanked_at", "is", null)
        .distinct()
        .execute();
      return rows.map((row) => ({
        item: formatItemName({
          workspace: row.item_workspace,
          scope: row.item_scope,
          name: row.item_name,
        }),
        dependency: formatItemName({
          workspace: row.dependency_workspace,
          scope: row.dependency_scope,
          name: row.dependency_name,
        }),
        workspaceId: row.workspace_id,
        visibility: visibilityOf(row.visibility),
      }));
    },

    scopeOpenWork: async (scopeId) => {
      const rows = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .innerJoin("user", "user.id", "submissions.author_id")
        .select([
          "submissions.id as id",
          "submissions.status as status",
          "submissions.author_id as author_id",
          "user.email as email",
          "user.role as role",
          "workspaces.name as workspace",
          "scopes.name as scope",
          "submissions.name as name",
        ])
        .where("submissions.scope_id", "=", scopeId)
        .where("submissions.status", "in", ["draft", "submitted", "changes_requested", "approved"])
        .orderBy("submissions.name")
        .orderBy("submissions.id")
        .execute();
      const files = await manifests(rows.map((row) => row.id));
      return rows.map((row) => ({
        name: formatItemName(row),
        status: row.status,
        authorId: row.author_id,
        authorEmail: row.email,
        authorRoot: row.role === "root",
        manifest: files.get(row.id) ?? null,
      }));
    },

    openSubmissionsOutsideScope: async (scopeId, workspaceId) => {
      const rows = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "submissions.id as id",
          "workspaces.id as workspace_id",
          "workspaces.name as workspace",
          "scopes.name as scope",
          "submissions.name as name",
        ])
        .where("submissions.scope_id", "!=", scopeId)
        .where("scopes.workspace_id", "!=", workspaceId)
        .where("submissions.status", "in", ["submitted", "changes_requested", "approved"])
        .orderBy("submissions.id")
        .execute();
      const files = await manifests(rows.map((row) => row.id));
      return rows.map((row) => ({
        name: formatItemName(row),
        workspaceId: row.workspace_id,
        manifest: files.get(row.id) ?? null,
      }));
    },

    resolveItems: async (names) => {
      const items = kyselyItemRepository(db, dialect, UNFILTERED);
      const found = new Map<
        string,
        { itemId: string; scopeId: string; workspaceId: string; visibility: WorkspaceVisibility }
      >();
      for (const name of new Set(names)) {
        const parsed = parseItemName(name);
        const item = parsed ? await items.findByName(parsed) : null;
        if (item)
          found.set(name, {
            itemId: item.id,
            scopeId: item.scope.id,
            workspaceId: item.workspaceId,
            visibility: item.privateWorkspace ? "private" : "public",
          });
      }
      return found;
    },

    resolveOpenSubmissions: async (names) => {
      const found = new Map<
        string,
        { scopeId: string; workspaceId: string; visibility: WorkspaceVisibility }
      >();
      for (const name of new Set(names)) {
        const parsed = parseItemName(name);
        if (!parsed) continue;
        const rows = await db
          .selectFrom("submissions")
          .innerJoin("scopes", "scopes.id", "submissions.scope_id")
          .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
          .select([
            "scopes.id as scope_id",
            "scopes.name as scope",
            "workspaces.id as workspace_id",
            "workspaces.name as workspace",
            "workspaces.visibility as visibility",
            "submissions.name as name",
          ])
          .where("workspaces.name", "=", parsed.workspace)
          .where("scopes.name", "=", parsed.scope)
          .where("submissions.name", "=", parsed.name)
          .where("submissions.status", "in", ["submitted", "changes_requested", "approved"])
          .execute();
        // Byte for byte: MySQL's collation would match a name in another case.
        const row = rows.find(
          (r) =>
            r.workspace === parsed.workspace && r.scope === parsed.scope && r.name === parsed.name,
        );
        if (row)
          found.set(name, {
            scopeId: row.scope_id,
            workspaceId: row.workspace_id,
            visibility: visibilityOf(row.visibility),
          });
      }
      return found;
    },

    membersAmong: async (workspaceId, userIds) => {
      const found = new Set<string>();
      for (let i = 0; i < userIds.length; i += IN_LIST_SIZE) {
        const rows = await db
          .selectFrom("workspace_members")
          .select("user_id")
          .where("workspace_id", "=", workspaceId)
          .where("user_id", "in", userIds.slice(i, i + IN_LIST_SIZE))
          .execute();
        for (const row of rows) found.add(row.user_id);
      }
      return found;
    },

    notReviewedIn: async (scopeId) =>
      (
        await db
          .selectFrom("item_versions")
          .innerJoin("items", "items.id", "item_versions.item_id")
          .innerJoin("scopes", "scopes.id", "items.scope_id")
          .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
          .select([
            "workspaces.name as workspace",
            "scopes.name as scope",
            "items.name as name",
            "item_versions.version as version",
          ])
          .where("items.scope_id", "=", scopeId)
          .where("item_versions.reviewed", "=", toDbBoolean(false, dialect))
          .execute()
      )
        .map((row) => `${formatItemName(row)}@${row.version}`)
        .sort(),
  };
};
