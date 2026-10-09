import type { Kysely } from "kysely";
import { bumpCatalogueRevision } from "../../../db/catalogue-revision";
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
import { accessRequestMethods } from "./kysely-access-requests";
import type { MemberFilters, WorkspaceRepository } from "./workspace-repository";

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
  /** A workspace's members, roots left out (091), searched and filtered (092). */
  const memberRows = ({ workspaceId, search, role }: MemberFilters) => {
    let query = db
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
      .where("user.role", "!=", "root");
    if (search)
      query = query.where((eb) =>
        eb.or([
          containsInsensitive("user.email", search),
          containsInsensitive("user.name", search),
        ]),
      );
    if (role) query = query.where("workspace_members.role", "=", role);
    return query;
  };
  const toMember = (row: {
    id: string;
    email: string;
    name: string;
    disabled_at: unknown;
    role: string;
    created_at: string | Date;
  }) =>
    isWorkspaceRole(row.role)
      ? [
          {
            userId: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            disabled: row.disabled_at !== null,
            addedAt: fromDbDate(row.created_at),
          },
        ]
      : [];

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
        // Its reviewers who can act (091): not disabled, and not root (root is everywhere).
        eb
          .selectFrom("workspace_members")
          .innerJoin("user as member", "member.id", "workspace_members.user_id")
          .select((sub) => sub.fn.countAll<number | string | bigint>().as("n"))
          .whereRef("workspace_members.workspace_id", "=", "workspaces.id")
          // Moderators and admins (092): both review.
          .where("workspace_members.role", "in", ["moderator", "admin"])
          .where("member.role", "!=", "root")
          .where("member.disabled_at", "is", null)
          .as("moderator_count"),
        "workspaces.created_by",
        "user.email as creator_email",
        "workspaces.created_at",
        "workspaces.updated_at",
      ]);

  /** Every workspace but `global`, matching the search on the name or description. */
  const searched = (search: string | undefined, ids?: readonly string[]) => {
    let query = workspaces().where("workspaces.is_global", "=", toDbBoolean(false, dialect));
    // An empty list matches nothing; `in ()` isn't valid SQL, so a value no id has stands in.
    if (ids) query = query.where("workspaces.id", "in", ids.length > 0 ? [...ids] : [""]);
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
      // In one order for everyone, by the id's canonical form (ULIDs are uppercase): MySQL finds a
      // row by an id in another case or with a trailing space, and an order taken from ids as sent
      // could lock two rows in opposite orders and deadlock.
      const canonical = [...new Set(userIds.map((id) => id.trim().toUpperCase()))].sort();
      for (const id of canonical)
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

    lockWorkspace: async (id) => {
      await forUpdate(
        db.selectFrom("workspaces").select("id").where("id", "=", id),
        dialect,
      ).execute();
    },

    setVisibility: async (id, visibility, updatedAt) => {
      await db
        .updateTable("workspaces")
        .set({ visibility, updated_at: toDbDate(updatedAt, dialect) })
        .where("id", "=", id)
        .where("is_global", "=", toDbBoolean(false, dialect))
        .execute();
      await bumpCatalogueRevision(db);
    },

    outsideDependents: async (workspaceId) =>
      (
        await db
          .selectFrom("version_dependencies")
          .innerJoin(
            "items as dependency",
            "dependency.id",
            "version_dependencies.depends_on_item_id",
          )
          .innerJoin("scopes as dependency_scope", "dependency_scope.id", "dependency.scope_id")
          .innerJoin("item_versions", "item_versions.id", "version_dependencies.version_id")
          .innerJoin("items as dependent", "dependent.id", "item_versions.item_id")
          .innerJoin("scopes as dependent_scope", "dependent_scope.id", "dependent.scope_id")
          .select(["dependent_scope.name as scope", "dependent.name as name"])
          .where("dependency_scope.workspace_id", "=", workspaceId)
          .where("dependent_scope.workspace_id", "!=", workspaceId)
          .where("item_versions.yanked_at", "is", null)
          .distinct()
          .orderBy("dependent_scope.name")
          .orderBy("dependent.name")
          .execute()
      ).map((row) => `@${row.scope}/${row.name}`),

    openSubmissionsOutside: async (workspaceId) => {
      const rows = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .select(["submissions.id", "scopes.name as scope", "submissions.name"])
        .where("scopes.workspace_id", "!=", workspaceId)
        .where("submissions.status", "in", ["submitted", "changes_requested", "approved"])
        .orderBy("scopes.name")
        .orderBy("submissions.name")
        .execute();
      return Promise.all(
        rows.map(async (row) => {
          const manifest = await db
            .selectFrom("submission_revision_files")
            .innerJoin(
              "submission_revisions",
              "submission_revisions.id",
              "submission_revision_files.revision_id",
            )
            .select(["submission_revision_files.content", "submission_revision_files.encoding"])
            .where("submission_revisions.submission_id", "=", row.id)
            .where("submission_revision_files.path", "=", "ronne.yaml")
            .orderBy("submission_revisions.number", "desc")
            .limit(1)
            .executeTakeFirst();
          return {
            name: `@${row.scope}/${row.name}`,
            manifest:
              manifest?.encoding === "utf8"
                ? manifest.content
                : manifest
                  ? Buffer.from(manifest.content, "base64").toString("utf8")
                  : null,
          };
        }),
      );
    },

    scopeNames: async (workspaceId) =>
      (
        await db
          .selectFrom("scopes")
          .select("name")
          .where("workspace_id", "=", workspaceId)
          .orderBy("name")
          .execute()
      ).map((row) => row.name),

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

    page: async ({ search, sort, dir, size, cursor, ids }) => {
      const page = await paginate(searched(search, ids), {
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

    count: (search, ids) => countCapped(db, searched(search, ids)),

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

    candidates: async (workspaceId, term, limit) =>
      db
        .selectFrom("user")
        .select(["user.id", "user.email", "user.name"])
        .where("user.role", "!=", "root")
        .where("user.disabled_at", "is", null)
        .where((eb) =>
          eb.or([containsInsensitive("user.email", term), containsInsensitive("user.name", term)]),
        )
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("workspace_members")
                .select("workspace_members.user_id")
                .whereRef("workspace_members.user_id", "=", "user.id")
                .where("workspace_members.workspace_id", "=", workspaceId),
            ),
          ),
        )
        .orderBy("user.email")
        .orderBy("user.id")
        .limit(limit)
        .execute(),

    members: async (workspaceId) =>
      (await memberRows({ workspaceId }).orderBy("user.name").orderBy("user.id").execute()).flatMap(
        toMember,
      ),

    memberPage: async ({ sort, dir, size, cursor, ...filters }) => {
      const page = await paginate(memberRows(filters), {
        sort:
          sort === "name"
            ? { key: sort, column: "user.name", dir }
            : { key: sort, column: "workspace_members.created_at", dir, kind: "date" },
        idColumn: "user.id",
        size,
        cursor,
        sortValue: (row) => (sort === "name" ? row.name : fromDbDate(row.created_at)),
        idOf: (row) => row.id,
        dialect,
      });
      return { ...page, rows: page.rows.flatMap(toMember) };
    },

    memberCount: (filters) => countCapped(db, memberRows(filters)),

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

    ...accessRequestMethods(db, dialect),
  };
};
