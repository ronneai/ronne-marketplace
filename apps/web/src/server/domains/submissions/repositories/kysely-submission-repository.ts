import type { ItemType } from "@ronneai/core";
import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { ReviewEventKind, Revision } from "../models/review";
import type { DraftFile, Submission, SubmissionStatus } from "../models/submission";
import type { SubmissionRepository } from "./submission-repository";

type SubmissionRow = {
  id: string;
  author_id: string;
  scope_id: string;
  scope_name: string;
  name: string;
  type: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  submitted_at: Date | string | null;
};

const toSubmission = (row: SubmissionRow): Submission => ({
  id: row.id,
  authorId: row.author_id,
  scope: { id: row.scope_id, name: row.scope_name },
  name: row.name,
  type: row.type as ItemType,
  status: row.status as SubmissionStatus,
  createdAt: fromDbDate(row.created_at),
  updatedAt: fromDbDate(row.updated_at),
  submittedAt: fromDbDate(row.submitted_at),
});

export const kyselySubmissionRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): SubmissionRepository => {
  const submissions = () =>
    db
      .selectFrom("submissions")
      .innerJoin("scopes", "scopes.id", "submissions.scope_id")
      .select([
        "submissions.id",
        "submissions.author_id",
        "submissions.scope_id",
        "scopes.name as scope_name",
        "submissions.name",
        "submissions.type",
        "submissions.status",
        "submissions.created_at",
        "submissions.updated_at",
        "submissions.submitted_at",
      ]);

  return {
    // READ COMMITTED, so the name check after `lockScope` sees a submit that committed while this
    // one waited (MySQL's default snapshot wouldn't).
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselySubmissionRepository(trx, dialect)),
      ),

    findScope: async (name) =>
      (await db
        .selectFrom("scopes")
        .select(["id", "name"])
        .where("name", "=", name)
        .executeTakeFirst()) ?? null,

    insert: async (submission) => {
      const id = newId();
      const at = toDbDate(submission.createdAt, dialect);
      await db
        .insertInto("submissions")
        .values({
          id,
          author_id: submission.authorId,
          scope_id: submission.scopeId,
          name: submission.name,
          type: submission.type,
          item_id: null,
          base_version_id: null,
          status: submission.status,
          created_at: at,
          updated_at: at,
          submitted_at: null,
        })
        .execute();
      return id;
    },

    find: async (id) => {
      const row = await submissions().where("submissions.id", "=", id).executeTakeFirst();
      return row ? toSubmission(row) : null;
    },

    listByAuthor: async (authorId) =>
      (
        await submissions()
          .where("submissions.author_id", "=", authorId)
          .orderBy("submissions.updated_at", "desc")
          .orderBy("submissions.id", "desc")
          .execute()
      ).map(toSubmission),

    isNameProposed: async (scopeId, name, statuses, exceptId) => {
      if (statuses.length === 0) return false;
      const found = await db
        .selectFrom("submissions")
        .select("id")
        .where("scope_id", "=", scopeId)
        .where("name", "=", name)
        .where("status", "in", [...statuses])
        .where("id", "!=", exceptId)
        .limit(1)
        .executeTakeFirst();
      return found !== undefined;
    },

    update: async (id, changes) => {
      await db
        .updateTable("submissions")
        .set({
          ...(changes.scopeId ? { scope_id: changes.scopeId } : {}),
          ...(changes.name ? { name: changes.name } : {}),
          updated_at: toDbDate(changes.updatedAt, dialect),
        })
        .where("id", "=", id)
        .execute();
    },

    setStatus: async (id, status, at) => {
      await db
        .updateTable("submissions")
        .set({
          status,
          updated_at: toDbDate(at.updatedAt, dialect),
          ...(at.submittedAt ? { submitted_at: toDbDate(at.submittedAt, dialect) } : {}),
        })
        .where("id", "=", id)
        .execute();
    },

    lockSubmission: async (id) => {
      await forUpdate(
        db.selectFrom("submissions").select("id").where("id", "=", id),
        dialect,
      ).execute();
    },

    lockScope: async (scopeId) => {
      await forUpdate(
        db.selectFrom("scopes").select("id").where("id", "=", scopeId),
        dialect,
      ).execute();
    },

    recordAudit: async (event, now) => {
      await recordAudit(db, dialect, event, now);
    },

    createRevision: async (submissionId, createdBy, files, at) => {
      const last = await db
        .selectFrom("submission_revisions")
        .select((eb) => eb.fn.max("number").as("number"))
        .where("submission_id", "=", submissionId)
        .executeTakeFirst();
      const revision: Revision = {
        id: newId(),
        submissionId,
        number: Number(last?.number ?? 0) + 1,
        createdBy,
        createdAt: at,
      };
      await db
        .insertInto("submission_revisions")
        .values({
          id: revision.id,
          submission_id: submissionId,
          number: revision.number,
          created_by: createdBy,
          created_at: toDbDate(at, dialect),
        })
        .execute();
      for (const file of files)
        await db
          .insertInto("submission_revision_files")
          .values({
            revision_id: revision.id,
            path: file.path,
            encoding: file.encoding,
            content: file.content,
            size: file.size,
            executable: toDbBoolean(file.executable, dialect),
          })
          .execute();
      return revision;
    },

    revisions: async (submissionId) =>
      (
        await db
          .selectFrom("submission_revisions")
          .selectAll()
          .where("submission_id", "=", submissionId)
          .orderBy("number")
          .execute()
      ).map((row) => ({
        id: row.id,
        submissionId: row.submission_id,
        number: Number(row.number),
        createdBy: row.created_by,
        createdAt: fromDbDate(row.created_at),
      })),

    revisionFiles: async (revisionId) =>
      (
        await db
          .selectFrom("submission_revision_files")
          .selectAll()
          .where("revision_id", "=", revisionId)
          .execute()
      )
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map((row) => ({
          path: row.path,
          encoding: row.encoding,
          content: row.content,
          size: Number(row.size),
          executable: Boolean(row.executable),
        })),

    addEvent: async (event) => {
      const id = newId();
      await db
        .insertInto("review_events")
        .values({
          id,
          submission_id: event.submissionId,
          actor_id: event.actorId,
          kind: event.kind,
          body: event.body,
          revision: event.revision,
          created_at: toDbDate(event.createdAt, dialect),
        })
        .execute();
      return id;
    },

    events: async (submissionId) =>
      (
        await db
          .selectFrom("review_events")
          .innerJoin("user", "user.id", "review_events.actor_id")
          .select([
            "review_events.id",
            "review_events.submission_id",
            "review_events.actor_id",
            "user.name as actor_name",
            "review_events.kind",
            "review_events.body",
            "review_events.revision",
            "review_events.created_at",
          ])
          .where("review_events.submission_id", "=", submissionId)
          .orderBy("review_events.created_at")
          .orderBy("review_events.id")
          .execute()
      ).map((row) => ({
        id: row.id,
        submissionId: row.submission_id,
        actor: { id: row.actor_id, name: row.actor_name },
        kind: row.kind as ReviewEventKind,
        body: row.body,
        revision: row.revision === null ? null : Number(row.revision),
        createdAt: fromDbDate(row.created_at),
      })),

    delete: async (id) => {
      await db.deleteFrom("submissions").where("id", "=", id).execute();
    },

    files: async (submissionId) =>
      (
        await db
          .selectFrom("submission_files")
          .selectAll()
          .where("submission_id", "=", submissionId)
          .execute()
      )
        // Sorted here: each database orders strings by its own collation.
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(
          (row): DraftFile => ({
            path: row.path,
            encoding: row.encoding,
            content: row.content,
            size: Number(row.size),
            executable: Boolean(row.executable),
            updatedAt: fromDbDate(row.updated_at),
          }),
        ),

    writeFile: async (submissionId, file) => {
      await upsert(
        db,
        dialect,
        "submission_files",
        {
          submission_id: submissionId,
          path: file.path,
          encoding: file.encoding,
          content: file.content,
          size: file.size,
          executable: toDbBoolean(file.executable, dialect),
          updated_at: toDbDate(file.updatedAt, dialect),
        },
        ["submission_id", "path"],
        ["encoding", "content", "size", "executable", "updated_at"],
      ).execute();
    },

    deleteFile: async (submissionId, path) => {
      await db
        .deleteFrom("submission_files")
        .where("submission_id", "=", submissionId)
        .where("path", "=", path)
        .execute();
    },
  };
};
