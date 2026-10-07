import { type Expression, type SqlBool, sql } from "kysely";
import type { DatabaseDialect } from "../../../db/url";
import type { Viewer } from "../models/viewer";

/**
 * The read filters of private workspaces (093), shared by every repository so each read filters the
 * same way: `column` holds a workspace id, or an item id, that the viewer sees. Root sees every
 * workspace; a viewer who sees none matches nothing. Membership was decided in the viewer, never
 * here, so MySQL's case-insensitive ids can't count a stray membership row.
 */
export const inVisibleWorkspace = (viewer: Viewer, column: string): Expression<SqlBool> => {
  if (viewer.root) return sql<SqlBool>`1 = 1`;
  if (viewer.workspaceIds.length === 0) return sql<SqlBool>`1 = 0`;
  return sql<SqlBool>`${sql.ref(column)} in (${sql.join(viewer.workspaceIds)})`;
};

/** `column` holds an item id whose scope is in a workspace the viewer sees. */
export const isVisibleItem = (viewer: Viewer, column: string): Expression<SqlBool> => {
  if (viewer.root) return sql<SqlBool>`1 = 1`;
  if (viewer.workspaceIds.length === 0) return sql<SqlBool>`1 = 0`;
  return sql<SqlBool>`${sql.ref(column)} in (select visible_items.id from items as visible_items inner join scopes as visible_scopes on visible_scopes.id = visible_items.scope_id where visible_scopes.workspace_id in (${sql.join(viewer.workspaceIds)}))`;
};

/** `column` holds a submission id whose scope is in a workspace the viewer sees. */
export const isVisibleSubmission = (viewer: Viewer, column: string): Expression<SqlBool> => {
  if (viewer.root) return sql<SqlBool>`1 = 1`;
  if (viewer.workspaceIds.length === 0) return sql<SqlBool>`1 = 0`;
  return sql<SqlBool>`${sql.ref(column)} in (select visible_submissions.id from submissions as visible_submissions inner join scopes as visible_scopes on visible_scopes.id = visible_submissions.scope_id where visible_scopes.workspace_id in (${sql.join(viewer.workspaceIds)}))`;
};

/**
 * A submission the viewer may read: one in a workspace they see, or their own, which a removed
 * member keeps reading and withdrawing (091). `column` holds the submission's id.
 */
export const isReadableSubmission = (viewer: Viewer, column: string): Expression<SqlBool> => {
  if (viewer.root) return sql<SqlBool>`1 = 1`;
  const own = viewer.userId
    ? sql<SqlBool>`readable_submissions.author_id = ${viewer.userId}`
    : sql<SqlBool>`1 = 0`;
  const seen =
    viewer.workspaceIds.length > 0
      ? sql<SqlBool>`readable_scopes.workspace_id in (${sql.join(viewer.workspaceIds)})`
      : sql<SqlBool>`1 = 0`;
  return sql<SqlBool>`${sql.ref(column)} in (select readable_submissions.id from submissions as readable_submissions inner join scopes as readable_scopes on readable_scopes.id = readable_submissions.scope_id where ${seen} or ${own})`;
};

/**
 * `column` (a workspace's visibility) is exactly "public" (093): byte for byte on MySQL and MariaDB
 * too, whose collations would also take "Public" or "public " (trailing spaces are padded even in
 * `utf8mb4_bin`), which the viewer counts as private. Binary strings compare without padding.
 */
export const isPublicWorkspace = (column: string, dialect: DatabaseDialect): Expression<SqlBool> =>
  dialect === "mysql"
    ? sql<SqlBool>`cast(${sql.ref(column)} as binary) = cast(${"public"} as binary)`
    : sql<SqlBool>`${sql.ref(column)} = ${"public"}`;

/**
 * An item in the workspace that owns `column` (a workspace id) may be a dependency of an item in
 * `dependableFrom` (093): the same workspace, or a public one. Null: public ones only.
 */
export const isDependableFrom = (
  dependableFrom: string | null,
  idColumn: string,
  visibilityColumn: string,
  dialect: DatabaseDialect,
): Expression<SqlBool> =>
  dependableFrom === null
    ? isPublicWorkspace(visibilityColumn, dialect)
    : sql<SqlBool>`(${isPublicWorkspace(visibilityColumn, dialect)} or ${sql.ref(idColumn)} = ${dependableFrom})`;
