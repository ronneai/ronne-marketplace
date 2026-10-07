import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { countCapped, paginate } from "../../../db/keyset";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { isWorkspaceRole } from "../../identity/models/user";
import type { Workspace, WorkspaceVisibility } from "../models/workspace";
import type { WorkspaceRepository } from "./workspace-repository";

type WorkspaceRow = {
  id: string;
  name: string;
  description: string;
  visibility: WorkspaceVisibility;
  is_global: boolean | number;
  scope_count: number | string | bigint | null;
  moderator_count: number | string | bigint | null;
  created_by: string | null;
  creator_email: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const toWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  name: row.name,
  description: row.description,
  visibility: row.visibility,
  isGlobal: Boolean(row.is_global),
  scopes: Number(row.scope_count ?? 0),
  moderators: Number(row.moderator_count ?? 0),
  createdBy: row.created_by ? { id: row.created_by, email: row.creator_email } : null,
  createdAt: fromDbDate(row.created_at),
  updatedAt: fromDbDate(row.updated_at),
});

export const kyselyWorkspaceRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): WorkspaceRepository => {
  const workspaces = () =>
    db
      .selectFrom("workspaces")
      .leftJoin("user", "user.id", "workspaces.created_by")
      .select((eb) => [
        "workspaces.id",
        "workspaces.name",
        "workspaces.description",
        "workspaces.visibility",
        "workspaces.is_global",
        eb
          .selectFrom("scopes")
          .select((sub) => sub.fn.countAll<number | string | bigint>().as("n"))
          .whereRef("scopes.workspace_id", "=", "workspaces.id")
          .as("scope_count"),
        // Its moderators who can act (091): not disabled, and not root (root is everywhere).
        eb
          .selectFrom("workspace_members")
          .innerJoin("user as member", "member.id", "workspace_members.user_id")
          .select((sub) => sub.fn.countAll<number | string | bigint>().as("n"))
          .whereRef("workspace_members.workspace_id", "=", "workspaces.id")
          .where("workspace_members.role", "=", "moderator")
          .where("member.role", "!=", "root")
          .where("member.disabled_at", "is", null)
          .as("moderator_count"),
        "workspaces.created_by",
        "user.email as creator_email",
        "workspaces.created_at",
        "workspaces.updated_at",
      ]);

  /** Every workspace but `global`, matching the search on the name or description. */
  const searched = (search: string | undefined) => {
    const query = workspaces().where("workspaces.is_global", "=", toDbBoolean(false, dialect));
    return search
      ? query.where((eb) =>
          eb.or([
            containsInsensitive("workspaces.name", search),
            containsInsensitive("workspaces.description", search),
          ]),
        )
      : query;
  };

  return {
    // READ COMMITTED, so a check made after waiting for `lockUsers` sees what the other committed.
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyWorkspaceRepository(trx, dialect)),
      ),

    lockUsers: async (userIds) => {
      for (const id of [...new Set(userIds)].sort())
        await forUpdate(db.selectFrom("user").select("id").where("id", "=", id), dialect).execute();
    },

    findByName: async (name) => {
      const row = await workspaces().where("workspaces.name", "=", name).executeTakeFirst();
      return row ? toWorkspace(row) : null;
    },

    insert: async (workspace) => {
      const id = newId();
      const at = toDbDate(workspace.createdAt, dialect);
      await db
        .insertInto("workspaces")
        .values({
          id,
          name: workspace.name,
          description: workspace.description,
          visibility: workspace.visibility,
          is_global: toDbBoolean(false, dialect),
          created_by: workspace.createdBy,
          created_at: at,
          updated_at: at,
        })
        .execute();
      return id;
    },

    updateDescription: async (id, description, updatedAt) => {
      await db
        .updateTable("workspaces")
        .set({ description, updated_at: toDbDate(updatedAt, dialect) })
        .where("id", "=", id)
        .where("is_global", "=", toDbBoolean(false, dialect))
        .execute();
    },

    delete: async (id) => {
      await db
        .deleteFrom("workspaces")
        .where("id", "=", id)
        .where("is_global", "=", toDbBoolean(false, dialect))
        .execute();
    },

    list: async () =>
      (
        await workspaces()
          .orderBy("workspaces.is_global", "desc")
          .orderBy("workspaces.name")
          .execute()
      ).map(toWorkspace),

    page: async ({ search, sort, dir, size, cursor }) => {
      const page = await paginate(searched(search), {
        sort: {
          key: sort,
          column: sort === "name" ? "workspaces.name" : "workspaces.id",
          dir,
        },
        idColumn: "workspaces.id",
        size,
        cursor,
        sortValue: (row) => (sort === "name" ? row.name : row.id),
        idOf: (row) => row.id,
      });
      return { ...page, rows: page.rows.map(toWorkspace) };
    },

    count: (search) => countCapped(db, searched(search)),

    findById: async (id) => {
      const row = await workspaces().where("workspaces.id", "=", id).executeTakeFirst();
      return row ? toWorkspace(row) : null;
    },

    memberUser: async (userId) => {
      const row = await db
        .selectFrom("user")
        .select(["id", "email", "name", "role", "disabled_at"])
        .where("id", "=", userId)
        .executeTakeFirst();
      return row
        ? {
            id: row.id,
            email: row.email,
            name: row.name,
            root: row.role === "root",
            disabled: row.disabled_at !== null,
          }
        : null;
    },

    membershipsOf: async (userId) =>
      (
        await db
          .selectFrom("workspace_members")
          .innerJoin("workspaces", "workspaces.id", "workspace_members.workspace_id")
          .select(["workspaces.id", "workspaces.name", "workspace_members.role"])
          .where("workspace_members.user_id", "=", userId)
          .orderBy("workspaces.is_global", "desc")
          .orderBy("workspaces.name")
          .execute()
      )
        .filter((row) => isWorkspaceRole(row.role))
        .map((row) => ({ workspaceId: row.id, workspace: row.name, role: row.role })),

    members: async (workspaceId) =>
      (
        await db
          .selectFrom("workspace_members")
          .innerJoin("user", "user.id", "workspace_members.user_id")
          .select([
            "user.id",
            "user.email",
            "user.name",
            "user.disabled_at",
            "workspace_members.role",
            "workspace_members.created_at",
          ])
          .where("workspace_members.workspace_id", "=", workspaceId)
          .where("user.role", "!=", "root")
          .orderBy("user.name")
          .orderBy("user.id")
          .execute()
      )
        .filter((row) => isWorkspaceRole(row.role))
        .map((row) => ({
          userId: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          disabled: row.disabled_at !== null,
          addedAt: fromDbDate(row.created_at),
        })),

    memberRole: async (workspaceId, userId) => {
      const row = await db
        .selectFrom("workspace_members")
        .select("role")
        .where("workspace_id", "=", workspaceId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      return row && isWorkspaceRole(row.role) ? row.role : null;
    },

    putMember: async ({ workspaceId, userId, role, addedBy, at }) => {
      const when = toDbDate(at, dialect);
      await upsert(
        db,
        dialect,
        "workspace_members",
        {
          workspace_id: workspaceId,
          user_id: userId,
          role,
          added_by: addedBy,
          created_at: when,
          updated_at: when,
        },
        ["workspace_id", "user_id"],
        ["role", "updated_at"],
      ).execute();
    },

    removeMember: async (workspaceId, userId) => {
      await db
        .deleteFrom("workspace_members")
        .where("workspace_id", "=", workspaceId)
        .where("user_id", "=", userId)
        .execute();
    },

    countMembers: async (workspaceId) => {
      const row = await db
        .selectFrom("workspace_members")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("workspace_id", "=", workspaceId)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    recordAudit: async (event, now) => {
      await recordAudit(db, dialect, event, now);
    },
  };
};
