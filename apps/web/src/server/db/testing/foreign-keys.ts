import { sql } from "kysely";
import type { Db } from "../create-db";
import type { DatabaseDialect } from "../url";

export type ForeignKey = { table: string; references: string; onDelete: string };

type Row = { tbl: string; ref: string; on_delete: string };

// pg_constraint.confdeltype codes.
const PG_ON_DELETE: Record<string, string> = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

/** Lists the foreign keys that really exist on the given tables, for tests. */
export async function foreignKeys(
  db: Db,
  dialect: DatabaseDialect,
  tables: string[],
): Promise<ForeignKey[]> {
  let rows: Row[] = [];
  if (dialect === "sqlite") {
    for (const table of tables) {
      const result = await sql<{ table: string; on_delete: string }>`
        select * from pragma_foreign_key_list(${table})`.execute(db);
      rows.push(...result.rows.map((r) => ({ tbl: table, ref: r.table, on_delete: r.on_delete })));
    }
  } else if (dialect === "postgres") {
    const result = await sql<Row>`
      select c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ref, c.confdeltype as on_delete
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = current_schema()::regnamespace`.execute(db);
    // regclass quotes reserved names such as "user".
    rows = result.rows.map((r) => ({
      tbl: r.tbl.replaceAll('"', ""),
      ref: r.ref.replaceAll('"', ""),
      on_delete: PG_ON_DELETE[r.on_delete] ?? r.on_delete,
    }));
  } else {
    const result = await sql<Row>`
      select table_name as tbl, referenced_table_name as ref, delete_rule as on_delete
      from information_schema.referential_constraints
      where constraint_schema = database()`.execute(db);
    rows = result.rows;
  }
  return rows
    .filter((r) => tables.includes(r.tbl))
    .map((r) => ({ table: r.tbl, references: r.ref, onDelete: r.on_delete.toUpperCase() }))
    .sort((a, b) => a.table.localeCompare(b.table));
}
