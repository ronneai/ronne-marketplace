import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Review (feature 014). Every submit and resubmit snapshots the submission's files as a revision,
 * which reviewers read and releases pack (015), so what's approved is exactly what's released.
 * `review_events` is the conversation: comments, decisions, submits and withdrawals. Both go with
 * their submission; actors are RESTRICT, since users are disabled, never deleted. Table-level
 * foreign keys, as in 0001.
 */
export const reviews: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);

    await db.schema
      .createTable("submission_revisions")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("submission_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "submission_revisions_submission_id_fk",
        ["submission_id"],
        "submissions",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("number", "integer", (c) => c.notNull())
      .addColumn("created_by", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "submission_revisions_created_by_fk",
        ["created_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addUniqueConstraint("submission_revisions_number_unique", ["submission_id", "number"])
      .$call(tableDefaults(dialect))
      .execute();

    await db.schema
      .createTable("submission_revision_files")
      .addColumn("revision_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "submission_revision_files_revision_id_fk",
        ["revision_id"],
        "submission_revisions",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("path", t.exactString(255), (c) => c.notNull())
      .addPrimaryKeyConstraint("submission_revision_files_pk", ["revision_id", "path"])
      .addColumn("encoding", t.string(8), (c) => c.notNull())
      .addColumn("content", t.longText(), (c) => c.notNull())
      .addColumn("size", "integer", (c) => c.notNull())
      .addColumn("executable", t.boolean(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();

    await db.schema
      .createTable("review_events")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("submission_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "review_events_submission_id_fk",
        ["submission_id"],
        "submissions",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("actor_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("review_events_actor_id_fk", ["actor_id"], "user", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("kind", t.string(24), (c) => c.notNull())
      .addColumn("body", t.text())
      .addColumn("revision", "integer")
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("review_events_submission_idx")
      .on("review_events")
      .columns(["submission_id", "created_at"])
      .execute();
  },
});
