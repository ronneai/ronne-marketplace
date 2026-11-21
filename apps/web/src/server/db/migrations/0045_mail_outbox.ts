import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = 'mail_outbox' and index_name = ${name}`.execute(
    db,
  );
  return result.rows.length > 0;
};

/**
 * The outbox of outgoing email (feature 189): one row per message, queued in the transaction of
 * the change that causes it. The body (address, subject, both texts) is sealed and deleted once
 * the message is sent, fails for good or is dropped; the recipient is kept only as a keyed hash,
 * to count the messages to one address. `user_id` has no foreign key: a row outlives a deleted
 * account until erase or the purge removes it.
 */
export const mailOutbox: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("mail_outbox")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("template", t.string(64), (c) => c.notNull())
      .addColumn("locale", t.string(16), (c) => c.notNull())
      .addColumn("recipient_hmac", t.string(64), (c) => c.notNull())
      .addColumn("user_id", t.id())
      .addColumn("body_enc", t.text())
      .addColumn("status", t.string(16), (c) => c.notNull())
      .addColumn("attempts", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("next_attempt_at", t.timestamp(), (c) => c.notNull())
      .addColumn("claim_expires_at", t.timestamp())
      .addColumn("claim_id", t.id())
      .addColumn("expires_at", t.timestamp())
      .addColumn("last_error", t.string(32))
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("sent_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    // What is due; the messages to one address in the last hour (the cap); a person's own rows
    // (erase, the data download); what the purge deletes.
    for (const [name, columns] of [
      ["mail_outbox_due_idx", ["status", "next_attempt_at"]],
      ["mail_outbox_recipient_idx", ["recipient_hmac", "created_at"]],
      ["mail_outbox_user_idx", ["user_id", "id"]],
      ["mail_outbox_created_idx", ["created_at", "id"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("mail_outbox")
          .columns([...columns])
          .execute();
  },
});
