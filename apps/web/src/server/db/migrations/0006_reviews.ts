import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import { newId } from "../ids";
import type { Database } from "../schema";
import type { AppMigration } from "./types";

/**
 * Submissions sent before this migration (feature 013) have no revision. Their files have been
 * frozen since they were submitted, so revision 1 is a copy of them, with the `submit` event the
 * conversation starts with. Submissions that already have a revision are skipped, so it can run
 * again safely. Timestamps and flags are copied as each database stores them.
 */
export const backfillRevisions = async (db: Kysely<Database>): Promise<number> => {
  const submitted = await db
    .selectFrom("submissions")
    .select(["id", "author_id", "submitted_at", "updated_at"])
    .where("submitted_at", "is not", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("submission_revisions")
            .select("submission_revisions.id")
            .whereRef("submission_revisions.submission_id", "=", "submissions.id"),
        ),
      ),
    )
    .execute();
  for (const submission of submitted) {
    const revisionId = newId();
    const at = submission.submitted_at ?? submission.updated_at;
    await db
      .insertInto("submission_revisions")
      .values({
        id: revisionId,
        submission_id: submission.id,
        number: 1,
        created_by: submission.author_id,
        created_at: at,
      })
      .execute();
    const files = await db
      .selectFrom("submission_files")
      .select(["path", "encoding", "content", "size", "executable"])
      .where("submission_id", "=", submission.id)
      .execute();
    for (const file of files)
      await db
        .insertInto("submission_revision_files")
        .values({ revision_id: revisionId, ...file })
        .execute();
    await db
      .insertInto("review_events")
      .values({
        id: newId(),
        submission_id: submission.id,
        actor_id: submission.author_id,
        kind: "submit",
        body: null,
        revision: 1,
        created_at: at,
      })
      .execute();
  }
  return submitted.length;
};

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

    await backfillRevisions(db as Kysely<Database>);
  },
});
