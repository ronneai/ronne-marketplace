import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import { toDbBoolean, toDbDate } from "../dates";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

/**
 * The `global` workspace's id, the same on every instance, so code and tests point a scope at it
 * without looking it up. A valid ULID (the smallest), so `isId` accepts it.
 */
export const GLOBAL_WORKSPACE_ID = "00000000000000000000000000";

const createWorkspaces = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await db.schema
    .createTable("workspaces")
    .ifNotExists()
    .addColumn("id", t.id(), (c) => c.primaryKey())
    .addColumn("name", t.string(64), (c) => c.notNull().unique())
    .addColumn("description", t.string(300), (c) => c.notNull())
    .addColumn("visibility", t.string(16), (c) => c.notNull())
    .addColumn("is_global", t.boolean(), (c) => c.notNull())
    .addColumn("created_by", t.id())
    .addForeignKeyConstraint("workspaces_created_by_fk", ["created_by"], "user", ["id"], (fk) =>
      fk.onDelete("set null"),
    )
    .addColumn("created_at", t.timestamp(), (c) => c.notNull())
    .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
    .$call(tableDefaults(dialect))
    .execute();

  const existing = await db
    .selectFrom("workspaces" as never)
    .select(sql`id`.as("id"))
    .where(sql`id`, "=", GLOBAL_WORKSPACE_ID)
    .executeTakeFirst();
  if (existing) return;
  const now = toDbDate(new Date(), dialect);
  await db
    .insertInto("workspaces" as never)
    .values({
      id: GLOBAL_WORKSPACE_ID,
      name: "global",
      description: "Everyone on this instance",
      visibility: "public",
      is_global: toDbBoolean(true, dialect),
      created_by: null,
      created_at: now,
      updated_at: now,
    } as never)
    .execute();
};

/** The tables whose foreign keys the rebuild touches: scopes' own, and the two pointing at it. */
const REBUILT_KEYS = ["scopes", "items", "submissions"];

/**
 * SQLite can't add a foreign key or NOT NULL to an existing table, so `scopes` is rebuilt with the
 * new column, in the order SQLite documents (https://sqlite.org/lang_altertable.html#otheralter):
 * foreign keys off for the connection (Kysely runs SQLite migrations outside a transaction, on one
 * connection), then everything in one transaction, `workspaces` included, so a failure leaves the
 * database as it was and the next start can run it again. Without turning foreign keys off,
 * dropping `scopes` would fail on the items and submissions pointing at it.
 */
const migrateSqlite = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await sql`pragma foreign_keys = off`.execute(db);
  try {
    await sql`begin`.execute(db);
    try {
      await createWorkspaces(db, dialect);
      await db.schema
        .createTable("scopes_new")
        .addColumn("id", t.id(), (c) => c.primaryKey())
        .addColumn("name", t.string(64), (c) => c.notNull().unique())
        .addColumn("description", t.string(300), (c) => c.notNull())
        .addColumn("created_by", t.id())
        .addForeignKeyConstraint("scopes_created_by_fk", ["created_by"], "user", ["id"], (fk) =>
          fk.onDelete("set null"),
        )
        .addColumn("created_at", t.timestamp(), (c) => c.notNull())
        .addColumn("workspace_id", t.id(), (c) => c.notNull())
        .addForeignKeyConstraint(
          "scopes_workspace_id_fk",
          ["workspace_id"],
          "workspaces",
          ["id"],
          (fk) => fk.onDelete("restrict"),
        )
        .execute();
      await sql`insert into scopes_new (id, name, description, created_by, created_at, workspace_id)
        select id, name, description, created_by, created_at, ${GLOBAL_WORKSPACE_ID} from scopes`.execute(
        db,
      );
      await db.schema.dropTable("scopes").execute();
      await db.schema.alterTable("scopes_new").renameTo("scopes").execute();
      await db.schema
        .createIndex("scopes_workspace_id_idx")
        .on("scopes")
        .column("workspace_id")
        .execute();
      for (const table of REBUILT_KEYS) {
        const broken = await sql`select * from pragma_foreign_key_check(${table})`.execute(db);
        if (broken.rows.length > 0)
          throw new Error(
            `${broken.rows.length} rows of ${table} point at rows that don't exist; fix them, then start again.`,
          );
      }
      await sql`commit`.execute(db);
    } catch (error) {
      await sql`rollback`.execute(db);
      throw error;
    }
  } finally {
    await sql`pragma foreign_keys = on`.execute(db);
  }
};

/** Whether `scopes` has an index or a foreign key by that name yet (MySQL, to rerun safely). */
const mysqlHas = async (db: Kysely<unknown>, kind: "index" | "key", name: string) => {
  const result =
    kind === "index"
      ? await sql`select 1 from information_schema.statistics
          where table_schema = database() and table_name = 'scopes' and index_name = ${name}`.execute(
          db,
        )
      : await sql`select 1 from information_schema.referential_constraints
          where constraint_schema = database() and table_name = 'scopes'
            and constraint_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

/**
 * PostgreSQL and MySQL add the column nullable, fill it, then make it NOT NULL and add the foreign
 * key. PostgreSQL runs it all in one transaction (Kysely's transactional DDL). MySQL commits each
 * DDL statement, so every step checks whether it's already done, and a failed run can be rerun.
 */
const migrateServer = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await createWorkspaces(db, dialect);
  const scopes = (await db.introspection.getTables()).find((table) => table.name === "scopes");
  if (!scopes?.columns.some((column) => column.name === "workspace_id"))
    await db.schema.alterTable("scopes").addColumn("workspace_id", t.id()).execute();
  await db
    .updateTable("scopes" as never)
    .set({ workspace_id: GLOBAL_WORKSPACE_ID } as never)
    .where(sql`workspace_id`, "is", null)
    .execute();
  await db.schema
    .alterTable("scopes")
    .$call((table) =>
      dialect === "postgres"
        ? table.alterColumn("workspace_id", (c) => c.setNotNull())
        : table.modifyColumn("workspace_id", t.id(), (c) => c.notNull()),
    )
    .execute();
  // Before the foreign key, so MySQL uses this index instead of creating its own.
  if (dialect === "postgres" || !(await mysqlHas(db, "index", "scopes_workspace_id_idx")))
    await db.schema
      .createIndex("scopes_workspace_id_idx")
      .on("scopes")
      .column("workspace_id")
      .execute();
  if (dialect === "postgres" || !(await mysqlHas(db, "key", "scopes_workspace_id_fk")))
    await db.schema
      .alterTable("scopes")
      .addForeignKeyConstraint(
        "scopes_workspace_id_fk",
        ["workspace_id"],
        "workspaces",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .execute();
};

/**
 * Workspaces (feature 090): the level above scopes, workspace › scope › item. Creates `workspaces`
 * with the `global` row every instance has, then gives every scope a workspace, `global` for the
 * ones that exist. An item's workspace is its scope's, so items and submissions don't change.
 */
export const workspaces: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    if (dialect === "sqlite") await migrateSqlite(db, dialect);
    else await migrateServer(db, dialect);
  },
});
