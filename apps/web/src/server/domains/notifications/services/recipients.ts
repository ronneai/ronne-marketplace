import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";

/** Active roots (not disabled, not erased): they answer everything, instance-wide. */
export const activeRoots = async (db: Kysely<Database>): Promise<string[]> =>
  (
    await db
      .selectFrom("user")
      .select("id")
      .where("role", "=", "root")
      .where("disabled_at", "is", null)
      .where("erased_at", "is", null)
      .execute()
  ).map((row) => row.id);

/**
 * The people who answer requests in a workspace (feature 139): its admins and moderators, and root.
 * `notify` drops the actor and disabled or erased accounts, so callers pass the list as it is.
 */
export const answerersOf = async (db: Kysely<Database>, workspaceId: string): Promise<string[]> => {
  const members = await db
    .selectFrom("workspace_members")
    .select("user_id")
    .where("workspace_id", "=", workspaceId)
    .where("role", "in", ["admin", "moderator"])
    .execute();
  return [...new Set([...(await activeRoots(db)), ...members.map((row) => row.user_id)])];
};
