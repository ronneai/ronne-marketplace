import { type Expression, type SqlBool, sql } from "kysely";
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
