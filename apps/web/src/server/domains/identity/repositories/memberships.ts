import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import { isWorkspaceRole, type Memberships } from "../models/user";

/**
 * A user's roles per workspace (091), read with the user on every request, so a check doesn't
 * query and a changed role applies on the next request. A role outside the three known ones gives
 * nothing rather than a guess.
 */
export const loadMemberships = async (
  db: Kysely<Database>,
  userId: string,
): Promise<Memberships> => {
  const rows = await db
    .selectFrom("workspace_members")
    .select(["workspace_id", "role"])
    .where("user_id", "=", userId)
    .execute();
  return Object.fromEntries(
    rows.filter((row) => isWorkspaceRole(row.role)).map((row) => [row.workspace_id, row.role]),
  );
};

/** The user's personal workspace's id (114), or null: read with the user, like the memberships. */
export const loadPersonal = async (db: Kysely<Database>, userId: string): Promise<string | null> =>
  (await db.selectFrom("workspaces").select("id").where("owner_id", "=", userId).executeTakeFirst())
    ?.id ?? null;
