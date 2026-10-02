import type { ItemType } from "@ronneai/core";
import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson, encodeJson } from "../../../db/json";
import { countCapped, paginate } from "../../../db/keyset";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { ReviewEvent, ReviewEventKind, Revision } from "../models/review";
import type { DraftFile, Submission, SubmissionStatus } from "../models/submission";
import { kyselyRegistryLookup } from "./kysely-registry-lookup";
import type { ReviewFilters, ReviewSort, SubmissionRepository } from "./submission-repository";

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
  item_id: string | null;
  base_version_id: string | null;
  base_version: string | null;
  rebase_conflicts: string | null;
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
  proposal:
    row.item_id && row.base_version_id
      ? {
          itemId: row.item_id,
          baseVersionId: row.base_version_id,
          baseVersion: row.base_version ?? "",
          conflicts: decodeJson<string[]>(row.rebase_conflicts) ?? [],
        }
      : null,
});

const REVIEW_SORT_COLUMNS: Record<ReviewSort, string> = {
  submitted: "submissions.submitted_at",
  updated: "submissions.updated_at",
  name: "submissions.name",
};

export const kyselySubmissionRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): SubmissionRepository => {
  const submissions = () =>
    db
      .selectFrom("submissions")
      .innerJoin("scopes", "scopes.id", "submissions.scope_id")
      .leftJoin("item_versions as base", "base.id", "submissions.base_version_id")
      .select([
        "submissions.item_id",
        "submissions.base_version_id",
        "base.version as base_version",
        "submissions.rebase_conflicts",
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

  /** A queue tab's submissions, with their author's name (062). */
  const forReview = ({ statuses, search, type }: ReviewFilters) => {
    let query = submissions()
      .innerJoin("user", "user.id", "submissions.author_id")
      .select("user.name as author_name")
      .where("submissions.status", "in", [...statuses]);
    if (search)
      query = query.where((eb) =>
        eb.or([
          containsInsensitive("submissions.name", search),
          containsInsensitive("user.name", search),
        ]),
      );
    if (type) query = query.where("submissions.type", "=", type);
    return query;
  };

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
          item_id: submission.proposal?.itemId ?? null,
          base_version_id: submission.proposal?.baseVersionId ?? null,
          rebase_conflicts: null,
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

    listForReview: async ({ statuses, order, limit }) => {
      if (statuses.length === 0) return [];
      let query = submissions()
        .innerJoin("user", "user.id", "submissions.author_id")
        .select("user.name as author_name")
        .where("submissions.status", "in", [...statuses])
        .limit(limit);
      query =
        order === "oldest"
          ? query.orderBy("submissions.submitted_at").orderBy("submissions.id")
          : query.orderBy("submissions.updated_at", "desc").orderBy("submissions.id", "desc");
      return (await query.execute()).map((row) => ({
        ...toSubmission(row),
        authorName: row.author_name,
      }));
    },

    pageForReview: async ({ sort, dir, size, cursor, ...filters }) => {
      const page = await paginate(forReview(filters), {
        sort: {
          key: sort,
          column: REVIEW_SORT_COLUMNS[sort],
          dir,
          kind: sort === "name" ? undefined : "date",
        },
        idColumn: "submissions.id",
        size,
        cursor,
        sortValue: (row) =>
          sort === "name"
            ? row.name
            : fromDbDate(
                sort === "submitted" ? (row.submitted_at ?? row.updated_at) : row.updated_at,
              ),
        idOf: (row) => row.id,
        dialect,
      });
      return {
        ...page,
        rows: page.rows.map((row) => ({ ...toSubmission(row), authorName: row.author_name })),
      };
    },

    countForReview: (filters) => countCapped(db, forReview(filters)),

    userName: async (userId) =>
      (await db.selectFrom("user").select("name").where("id", "=", userId).executeTakeFirst())
        ?.name ?? null,

    countByStatus: async (status) => {
      const row = await db
        .selectFrom("submissions")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("status", "=", status)
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    countDrafts: async (authorId) => {
      const row = await db
        .selectFrom("submissions")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("author_id", "=", authorId)
        .where("status", "=", "draft")
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    isNameProposed: async (scopeId, name, statuses, exceptId) => {
      if (statuses.length === 0) return false;
      const found = await db
        .selectFrom("submissions")
        .select("id")
        .where("scope_id", "=", scopeId)
        .where("name", "=", name)
        .where("status", "in", [...statuses])
        .where("id", "!=", exceptId)
        // Change proposals (017) are for an existing item: they don't hold its name.
        .where("item_id", "is", null)
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

    registry: () => kyselyRegistryLookup(db, dialect),

    setProposalBase: async (id, baseVersionId, conflicts) => {
      await db
        .updateTable("submissions")
        .set({
          base_version_id: baseVersionId,
          rebase_conflicts: conflicts.length ? encodeJson(conflicts) : null,
        })
        .where("id", "=", id)
        .execute();
    },

    setConflicts: async (id, conflicts) => {
      await db
        .updateTable("submissions")
        .set({ rebase_conflicts: conflicts.length ? encodeJson(conflicts) : null })
        .where("id", "=", id)
        .execute();
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

    latestEvents: async (submissionIds, kinds) => {
      const latest = new Map<string, ReviewEvent>();
      if (submissionIds.length === 0 || kinds.length === 0) return latest;
      const rows = await db
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
        .where("review_events.submission_id", "in", [...submissionIds])
        .where("review_events.kind", "in", [...kinds])
        .orderBy("review_events.created_at", "desc")
        .orderBy("review_events.id", "desc")
        .execute();
      // Newest first: the first row of each submission is its latest.
      for (const row of rows)
        if (!latest.has(row.submission_id))
          latest.set(row.submission_id, {
            id: row.id,
            submissionId: row.submission_id,
            actor: { id: row.actor_id, name: row.actor_name },
            kind: row.kind as ReviewEventKind,
            body: row.body,
            revision: row.revision === null ? null : Number(row.revision),
            createdAt: fromDbDate(row.created_at),
          });
      return latest;
    },

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
