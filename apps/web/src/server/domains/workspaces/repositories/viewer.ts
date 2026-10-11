import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { CurrentUser } from "../../identity/models/user";
import { type Viewer, visibleWorkspaces } from "../models/viewer";

/**
 * The viewer for a request (093): every workspace's id and visibility, read once, against the
 * user's memberships. Anything but "public" counts as private, so an unexpected value hides a
 * workspace rather than showing it.
 */
export const loadViewer = async (
  db: Kysely<Database>,
  user: Pick<CurrentUser, "id" | "role" | "workspaces"> | null,
): Promise<Viewer> => {
  if (!user) return visibleWorkspaces(null, []);
  const rows = await db.selectFrom("workspaces").select(["id", "visibility"]).execute();
  return visibleWorkspaces(
    user,
    rows.map((row) => ({
      id: row.id,
      visibility: row.visibility === "public" ? "public" : "private",
    })),
  );
};

/** Which of these workspaces have a released item, any version (114: the plugin feeds' key). */
export const workspacesWithReleases = async (
  db: Kysely<Database>,
  workspaceIds: readonly string[],
): Promise<string[]> => {
  if (workspaceIds.length === 0) return [];
  const rows = await db
    .selectFrom("scopes")
    .select("scopes.workspace_id")
    .distinct()
    .where("scopes.workspace_id", "in", [...workspaceIds])
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom("items")
          .innerJoin("item_versions", "item_versions.item_id", "items.id")
          .select("item_versions.id")
          .whereRef("items.scope_id", "=", "scopes.id"),
      ),
    )
    .execute();
  return rows.map((row) => row.workspace_id);
};
