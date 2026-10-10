import {
  PERSONAL_NAME_BASE_LENGTH,
  personalWorkspaceBase,
  personalWorkspaceName,
} from "@ronneai/core";
import type { Kysely } from "kysely";
import { toDbBoolean, toDbDate } from "./dates";
import { newId } from "./ids";
import type { Database } from "./schema";
import type { DatabaseDialect } from "./url";

/**
 * A user's personal workspace (114), made with the user, in the caller's transaction: private,
 * named from the email (`personalWorkspaceName`), the user its admin. Starts from the first name
 * no workspace has, then inserts without failing on a name taken meanwhile (ON CONFLICT DO
 * NOTHING; INSERT IGNORE on MySQL), so a lost race tries the next name instead of aborting the
 * transaction, which PostgreSQL would. Returns the workspace's id and name.
 *
 * Call it in a READ COMMITTED transaction (`readCommittedTransaction`, as Create user's is): after
 * a lost race it reads who holds the name, which REPEATABLE READ (MySQL's default) would read from
 * an older snapshot, and then it throws instead of taking the next name.
 */
export const createPersonalWorkspace = async (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  owner: { id: string; email: string },
  now: Date,
): Promise<{ id: string; name: string }> => {
  const base = personalWorkspaceBase(owner.email);
  const prefix = base.slice(0, PERSONAL_NAME_BASE_LENGTH);
  const taken = new Set(
    (
      await db
        .selectFrom("workspaces")
        .select("name")
        .where("name", "like", `${prefix.slice(0, 20)}%`)
        .execute()
    ).map((row) => row.name),
  );
  const at = toDbDate(now, dialect);
  for (let attempt = 0; ; attempt++) {
    const name = personalWorkspaceName(owner.email, attempt);
    if (taken.has(name)) continue;
    const id = newId();
    const insert = db.insertInto("workspaces").values({
      id,
      name,
      description: `${name}'s personal workspace`,
      visibility: "private",
      is_global: toDbBoolean(false, dialect),
      owner_id: owner.id,
      created_by: null,
      created_at: at,
      updated_at: at,
    });
    const result = await (dialect === "mysql"
      ? insert.ignore()
      : insert.onConflict((oc) => oc.column("name").doNothing())
    ).executeTakeFirst();
    if (Number(result.numInsertedOrUpdatedRows ?? 0) === 0) {
      // Taken between the read and the insert: the next name. Anything else MySQL's INSERT IGNORE
      // hid (the owner has one already, or doesn't exist) is an error, not a reason to go on.
      const holder = await db
        .selectFrom("workspaces")
        .select("owner_id")
        .where("name", "=", name)
        .executeTakeFirst();
      if (!holder || holder.owner_id === owner.id)
        throw new Error(`Couldn't make a personal workspace for user ${owner.id}.`);
      taken.add(name);
      continue;
    }
    await db
      .insertInto("workspace_members")
      .values({
        workspace_id: id,
        user_id: owner.id,
        role: "admin",
        added_by: null,
        created_at: at,
        updated_at: at,
      })
      .execute();
    return { id, name };
  }
};
