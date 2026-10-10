import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { countCapped, paginate } from "../../../db/keyset";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { Viewer } from "../../workspaces/models/viewer";
import { inVisibleWorkspace } from "../../workspaces/repositories/visible";
import type { Scope } from "../models/scope";
import type { ScopeRepository } from "./scope-repository";

type ScopeRow = {
  id: string;
  name: string;
  description: string;
  workspace_id: string;
  workspace_name: string;
  created_by: string | null;
  creator_email: string | null;
  created_at: Date | string;
};

const toScope = (row: ScopeRow): Scope => ({
  id: row.id,
  name: row.name,
  description: row.description,
  workspace: { id: row.workspace_id, name: row.workspace_name },
  createdBy: row.created_by ? { id: row.created_by, email: row.creator_email } : null,
  createdAt: fromDbDate(row.created_at),
});

/**
 * Scopes as `viewer` sees them (093): only those in a workspace they see, and only those
 * workspaces. Writes don't filter: the services authorise them.
 */
export const kyselyScopeRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  viewer: Viewer,
): ScopeRepository => {
  const scopes = () =>
    db
      .selectFrom("scopes")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .leftJoin("user", "user.id", "scopes.created_by")
      .where(inVisibleWorkspace(viewer, "workspaces.id"))
      .select([
        "scopes.id",
        "scopes.name",
        "scopes.description",
        "scopes.workspace_id",
        "workspaces.name as workspace_name",
        "scopes.created_by",
        "user.email as creator_email",
        "scopes.created_at",
      ]);

  const searched = (search: string | undefined, workspaceId?: string) => {
    let query = scopes();
    if (workspaceId) query = query.where("scopes.workspace_id", "=", workspaceId);
    return search
      ? query.where((eb) =>
          eb.or([
            containsInsensitive("scopes.name", search),
            containsInsensitive("scopes.description", search),
          ]),
        )
      : query;
  };

  return {
    transaction: (work) =>
      db.transaction().execute((trx) => work(kyselyScopeRepository(trx, dialect, viewer))),

    findByName: async (ref) => {
      const row = await scopes()
        .where("workspaces.name", "=", ref.workspace)
        .where("scopes.name", "=", ref.scope)
        .executeTakeFirst();
      return row ? toScope(row) : null;
    },

    findWorkspace: async (id) =>
      (await db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where("id", "=", id)
        .where(inVisibleWorkspace(viewer, "workspaces.id"))
        .executeTakeFirst()) ?? null,

    insert: async (scope) => {
      const id = newId();
      await db
        .insertInto("scopes")
        .values({
          id,
          name: scope.name,
          description: scope.description,
          created_by: scope.createdBy,
          created_at: toDbDate(scope.createdAt, dialect),
          workspace_id: scope.workspaceId,
        })
        .execute();
      return id;
    },

    updateDescription: async (id, description) => {
      await db.updateTable("scopes").set({ description }).where("id", "=", id).execute();
    },

    list: async ({ search, cursor, workspaceIds, limit }) => {
      if (workspaceIds?.length === 0) return [];
      let query = scopes().orderBy("scopes.name").orderBy("scopes.id").limit(limit);
      if (workspaceIds) query = query.where("scopes.workspace_id", "in", [...workspaceIds]);
      if (search)
        query = query.where((eb) =>
          eb.or([
            containsInsensitive("scopes.name", search),
            containsInsensitive("scopes.description", search),
          ]),
        );
      // `name:id` (118): two workspaces may each have a scope of the same name. A cursor from
      // before is a name alone, and goes on after every scope of that name, as it did.
      if (cursor?.includes(":")) {
        const [name = "", id = ""] = cursor.split(":");
        query = query.where((eb) =>
          eb.or([
            eb("scopes.name", ">", name),
            eb.and([eb("scopes.name", "=", name), eb("scopes.id", ">", id)]),
          ]),
        );
      } else if (cursor) query = query.where("scopes.name", ">", cursor);
      return (await query.execute()).map(toScope);
    },

    page: async ({ search, workspaceId, sort, dir, size, cursor }) => {
      const page = await paginate(searched(search, workspaceId), {
        sort: { key: sort, column: sort === "name" ? "scopes.name" : "scopes.id", dir },
        idColumn: "scopes.id",
        size,
        cursor,
        sortValue: (row) => (sort === "name" ? row.name : row.id),
        idOf: (row) => row.id,
      });
      return { ...page, rows: page.rows.map(toScope) };
    },

    count: ({ search, workspaceId }) => countCapped(db, searched(search, workspaceId)),

    recordAudit: async (event, now) => {
      await recordAudit(db, dialect, event, now);
    },
  };
};
