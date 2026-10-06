import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { countCapped, paginate } from "../../../db/keyset";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
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
  created_by: string | null;
  creator_email: string | null;
  created_at: Date | string;
};

const toScope = (row: ScopeRow): Scope => ({
  id: row.id,
  name: row.name,
  description: row.description,
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
      .leftJoin("user", "user.id", "scopes.created_by")
      .select([
        "scopes.id",
        "scopes.name",
        "scopes.description",
        "scopes.created_by",
        "user.email as creator_email",
        "scopes.created_at",
      ]);

  const searched = (search: string | undefined) => {
    const query = scopes();
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
          workspace_id: GLOBAL_WORKSPACE_ID,
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

    page: async ({ search, sort, dir, size, cursor }) => {
      const page = await paginate(searched(search), {
        sort: { key: sort, column: sort === "name" ? "scopes.name" : "scopes.id", dir },
        idColumn: "scopes.id",
        size,
        cursor,
        sortValue: (row) => (sort === "name" ? row.name : row.id),
        idOf: (row) => row.id,
      });
      return { ...page, rows: page.rows.map(toScope) };
    },

    count: (search) => countCapped(db, searched(search)),

    recordAudit: async (event, now) => {
      await recordAudit(db, dialect, event, now);
    },
  };
};
