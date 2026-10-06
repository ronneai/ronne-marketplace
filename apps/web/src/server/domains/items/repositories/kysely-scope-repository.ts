import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { countCapped, paginate } from "../../../db/keyset";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
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

export const kyselyScopeRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ScopeRepository => {
  const scopes = () =>
    db
      .selectFrom("scopes")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .leftJoin("user", "user.id", "scopes.created_by")
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
      db.transaction().execute((trx) => work(kyselyScopeRepository(trx, dialect))),

    findByName: async (name) => {
      const row = await scopes().where("scopes.name", "=", name).executeTakeFirst();
      return row ? toScope(row) : null;
    },

    findWorkspace: async (id) =>
      (await db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where("id", "=", id)
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

    list: async ({ search, cursor, limit }) => {
      let query = scopes().orderBy("scopes.name").limit(limit);
      if (search)
        query = query.where((eb) =>
          eb.or([
            containsInsensitive("scopes.name", search),
            containsInsensitive("scopes.description", search),
          ]),
        );
      if (cursor) query = query.where("scopes.name", ">", cursor);
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
