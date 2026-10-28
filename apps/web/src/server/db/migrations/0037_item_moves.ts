import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import { fromDbDate } from "../dates";
import { newId } from "../ids";
import type { DatabaseDialect } from "../url";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import type { AppMigration } from "./types";

/** The longest full item name: `@` and three names of 64 with two slashes (118). */
const ITEM_NAME_LENGTH = 195;

const mysqlHasIndex = async (db: Kysely<unknown>, table: string, name: string) =>
  (
    await sql`select 1 from information_schema.statistics
      where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(
      db,
    )
  ).rows.length > 0;

const createIndexes = async (
  db: Kysely<unknown>,
  dialect: DatabaseDialect,
  table: string,
  indexes: readonly (readonly [string, readonly string[]])[],
) => {
  for (const [name, columns] of indexes)
    if (dialect !== "mysql" || !(await mysqlHasIndex(db, table, name)))
      await db.schema
        .createIndex(name)
        .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
        .on(table)
        .columns([...columns])
        .execute();
};

/**
 * Moving an item to another scope of its workspace (feature 134): one row per request, open until
 * the workspace's moderators, admins or root answer it, or it's cancelled; a move made at once is
 * recorded too, approved. At most one open move per item: MySQL has no partial unique index, so the
 * service checks it under the item's row lock. The rows go with their item and their target scope
 * (cascade); the source scope is kept by id while it exists and set null if it's deleted after the
 * item left. Users are disabled, never deleted: the asker cascades as 115's does, and whoever
 * answered is set null.
 */
const createItemMoves = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await db.schema
    .createTable("item_moves")
    .ifNotExists()
    .addColumn("id", t.id(), (c) => c.primaryKey())
    .addColumn("item_id", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint("item_moves_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addColumn("from_scope_id", t.id())
    .addForeignKeyConstraint(
      "item_moves_from_scope_id_fk",
      ["from_scope_id"],
      "scopes",
      ["id"],
      (fk) => fk.onDelete("set null"),
    )
    .addColumn("to_scope_id", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint("item_moves_to_scope_id_fk", ["to_scope_id"], "scopes", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addColumn("requested_by", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint("item_moves_requested_by_fk", ["requested_by"], "user", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addColumn("message", t.text())
    .addColumn("status", t.string(16), (c) => c.notNull())
    .addColumn("decided_by", t.id())
    .addForeignKeyConstraint("item_moves_decided_by_fk", ["decided_by"], "user", ["id"], (fk) =>
      fk.onDelete("set null"),
    )
    .addColumn("reason", t.text())
    .addColumn("created_at", t.timestamp(), (c) => c.notNull())
    .addColumn("decided_at", t.timestamp())
    .$call(tableDefaults(dialect))
    .execute();
  // An item's open move (its page, one open per item); the Requests page reads the open moves into
  // a workspace's scopes.
  await createIndexes(db, dialect, "item_moves", [
    ["item_moves_item_idx", ["item_id", "status"]],
    ["item_moves_to_idx", ["to_scope_id", "status"]],
  ]);
};

/**
 * Every name change of an item, for its History tab (134): moved to another scope (`move_item`),
 * its scope moved to another workspace (`move_scope`, 115), its workspace renamed
 * (`rename_workspace`, 113), or the workspace added to item names (`migration`, 118). Who asked and
 * who approved are kept while the users exist; `source_id` is the `item_moves` or `scope_moves`
 * row, when there is one (no foreign key: it can be either).
 */
const createNameHistory = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await db.schema
    .createTable("item_name_history")
    .ifNotExists()
    .addColumn("id", t.id(), (c) => c.primaryKey())
    .addColumn("item_id", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint("item_name_history_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addColumn("old_name", t.exactString(ITEM_NAME_LENGTH), (c) => c.notNull())
    .addColumn("new_name", t.exactString(ITEM_NAME_LENGTH), (c) => c.notNull())
    .addColumn("reason", t.string(16), (c) => c.notNull())
    .addColumn("requested_by", t.id())
    .addForeignKeyConstraint(
      "item_name_history_requested_by_fk",
      ["requested_by"],
      "user",
      ["id"],
      (fk) => fk.onDelete("set null"),
    )
    .addColumn("decided_by", t.id())
    .addForeignKeyConstraint(
      "item_name_history_decided_by_fk",
      ["decided_by"],
      "user",
      ["id"],
      (fk) => fk.onDelete("set null"),
    )
    .addColumn("source_id", t.id())
    .addColumn("created_at", t.timestamp(), (c) => c.notNull())
    .$call(tableDefaults(dialect))
    .execute();
  await createIndexes(db, dialect, "item_name_history", [
    ["item_name_history_item_idx", ["item_id", "created_at"]],
  ]);
};

/** What each alias reason (118, 113, 115) becomes in the history. */
const HISTORY_REASON: Record<string, string> = {
  migration: "migration",
  rename: "rename_workspace",
  move: "move_scope",
};

type AliasRow = { item_id: string; name: string; reason: string; created_at: Date | string };
type ItemRow = {
  id: string;
  scope_id: string;
  scope: string;
  workspace: string;
  workspace_id: string;
  name: string;
};
type MoveRow = {
  id: string;
  scope_id: string;
  requested_by: string;
  decided_by: string | null;
  decided_at: Date | string;
};

const time = (value: Date | string) => (fromDbDate(value) as Date).getTime();

/**
 * One history entry per alias the items have now, so History shows the changes made before 134.
 * Each alias's new name is the item's next alias in date order, or its current name. A 115 move
 * finds its asker and answerer in the approved `scope_moves` row of the item's scope decided at the
 * same instant (115 writes both in one transaction with one clock reading); otherwise nobody is
 * named. Read in JavaScript and written in batches, so no dialect's string concatenation is needed;
 * skips items that already have entries, so a rerun (MySQL commits each DDL statement) adds nothing
 * twice. A name that became the item's name again (a scope moved back) is no longer an alias, so
 * that earlier change can't be recovered.
 */
const backfill = async (db: Kysely<unknown>) => {
  const aliases = (
    await sql<AliasRow>`
    select item_id, name, reason, created_at from item_aliases
    where item_id not in (select item_id from item_name_history)`.execute(db)
  ).rows;
  if (aliases.length === 0) return;
  const items = new Map(
    (
      await sql<ItemRow>`
      select items.id as id, items.scope_id as scope_id, scopes.name as scope,
        workspaces.name as workspace, workspaces.id as workspace_id, items.name as name
      from items join scopes on scopes.id = items.scope_id
      join workspaces on workspaces.id = scopes.workspace_id`.execute(db)
    ).rows.map((row) => [row.id, row]),
  );
  const moves = (
    await sql<MoveRow>`
    select id, scope_id, requested_by, decided_by, decided_at from scope_moves
    where status = 'approved' and decided_at is not null`.execute(db)
  ).rows;
  const byItem = new Map<string, AliasRow[]>();
  for (const alias of aliases)
    byItem.set(alias.item_id, [...(byItem.get(alias.item_id) ?? []), alias]);
  const groups: Record<string, unknown>[][] = [];
  for (const [itemId, list] of byItem) {
    const entries: Record<string, unknown>[] = [];
    groups.push(entries);
    const item = items.get(itemId);
    if (!item) continue;
    const current =
      item.workspace_id === GLOBAL_WORKSPACE_ID
        ? `@${item.scope}/${item.name}`
        : `@${item.workspace}/${item.scope}/${item.name}`;
    const sorted = [...list].sort(
      (a, b) => time(a.created_at) - time(b.created_at) || (a.name < b.name ? -1 : 1),
    );
    sorted.forEach((alias, at) => {
      const reason = HISTORY_REASON[alias.reason] ?? "migration";
      const move =
        reason === "move_scope"
          ? moves.find(
              (m) => m.scope_id === item.scope_id && time(m.decided_at) === time(alias.created_at),
            )
          : undefined;
      entries.push({
        id: newId(),
        item_id: itemId,
        old_name: alias.name,
        new_name: sorted[at + 1]?.name ?? current,
        reason,
        requested_by: move?.requested_by ?? null,
        decided_by: move?.decided_by ?? null,
        source_id: move?.id ?? null,
        created_at: alias.created_at,
      });
    });
  }
  for (const batch of historyBatches(groups))
    await db
      .insertInto("item_name_history" as never)
      .values(batch as never)
      .execute();
};

/**
 * Batches of about `size` rows that never split one item's entries: MySQL commits each batch, and a
 * rerun skips every item that already has an entry, so an item cut in two by a failure would keep
 * only its first part. An item with more than `size` entries gets a batch of its own.
 */
export const historyBatches = <T>(groups: readonly (readonly T[])[], size = 500): T[][] => {
  const batches: T[][] = [];
  let batch: T[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    if (batch.length > 0 && batch.length + group.length > size) {
      batches.push(batch);
      batch = [];
    }
    batch.push(...group);
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
};

export const itemMoves: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    await createItemMoves(db, dialect);
    await createNameHistory(db, dialect);
    await backfill(db);
  },
});
