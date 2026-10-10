import { type ItemType, typedNameParts } from "@ronneai/core";
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
import type { Viewer } from "../../workspaces/models/viewer";
import {
  inVisibleWorkspace,
  isDependableFrom,
  isReadableSubmission,
} from "../../workspaces/repositories/visible";
import type { ReviewEvent, ReviewEventKind, Revision } from "../models/review";
import { OPEN_STATUSES } from "../models/status";
import type { DraftFile, Submission, SubmissionStatus } from "../models/submission";
import { kyselyRegistryLookup } from "./kysely-registry-lookup";
import type {
  AuthorFilters,
  ReviewFilters,
  ReviewSort,
  SubmissionRepository,
} from "./submission-repository";

type SubmissionRow = {
  id: string;
  author_id: string;
  scope_id: string;
  scope_name: string;
  workspace_id: string;
  workspace_name: string;
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
  workspace: { id: row.workspace_id, name: row.workspace_name },
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

/**
 * Submissions as `viewer` reads them (093): those in a workspace they see, and their own, which a
 * removed member keeps (091). Scopes only in the workspaces they see. Writes don't filter: the
 * services authorise them, on submissions a read already found.
 */
export const kyselySubmissionRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  viewer: Viewer,
): SubmissionRepository => {
  const submissions = () =>
    db
      .selectFrom("submissions")
      .innerJoin("scopes", "scopes.id", "submissions.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .leftJoin("item_versions as base", "base.id", "submissions.base_version_id")
      .where(isReadableSubmission(viewer, "submissions.id"))
      .select([
        "submissions.item_id",
        "submissions.base_version_id",
        "base.version as base_version",
        "submissions.rebase_conflicts",
        "submissions.id",
        "submissions.author_id",
        "submissions.scope_id",
        "scopes.name as scope_name",
        "scopes.workspace_id",
        "workspaces.name as workspace_name",
        "submissions.name",
        "submissions.type",
        "submissions.status",
        "submissions.created_at",
        "submissions.updated_at",
        "submissions.submitted_at",
      ]);

  /** One author's submissions (063): every status but archived unless one is asked for. */
  const byAuthor = ({ authorId, status, search, type }: AuthorFilters) => {
    let query = submissions().where("submissions.author_id", "=", authorId);
    query = status
      ? query.where("submissions.status", "=", status)
      : query.where("submissions.status", "!=", "withdrawn");
    if (search) query = query.where(containsInsensitive("submissions.name", search));
    if (type) query = query.where("submissions.type", "=", type);
    return query;
  };

  /** A queue tab's submissions, with their author's name (062). */
  const forReview = ({ statuses, workspaceIds, search, type }: ReviewFilters) => {
    let query = submissions()
      .innerJoin("user", "user.id", "submissions.author_id")
      .select("user.name as author_name")
      .where("submissions.status", "in", [...statuses]);
    // An empty list matches nothing; `in ()` isn't valid SQL, so a value no id has stands in.
    if (workspaceIds)
      query = query.where(
        "scopes.workspace_id",
        "in",
        workspaceIds.length > 0 ? [...workspaceIds] : [""],
      );
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
        work(kyselySubmissionRepository(trx, dialect, viewer)),
      ),

    findScope: async (ref) => {
      const row = await db
        .selectFrom("scopes")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .select([
          "scopes.id",
          "scopes.name",
          "workspaces.id as workspace_id",
          "workspaces.name as workspace_name",
        ])
        .where("workspaces.name", "=", ref.workspace)
        .where("scopes.name", "=", ref.scope)
        .where(inVisibleWorkspace(viewer, "workspaces.id"))
        .executeTakeFirst();
      return row
        ? {
            id: row.id,
            name: row.name,
            workspace: { id: row.workspace_id, name: row.workspace_name },
          }
        : null;
    },

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

    listOwnUnreleased: async ({ authorId, types, search, limit, dependableFrom }) => {
      if (types.length === 0) return [];
      let query = submissions()
        .where("submissions.author_id", "=", authorId)
        .where("submissions.status", "in", ["draft", ...OPEN_STATUSES])
        .where("submissions.item_id", "is", null)
        .where("submissions.type", "in", [...types]);
      // Filtered before the limit, so another workspace's drafts can't crowd out allowed ones.
      if (dependableFrom !== undefined)
        query = query.where(
          isDependableFrom(dependableFrom, "workspaces.id", "workspaces.visibility", dialect),
        );
      // `@team/re` is scope `team` and a name with `re`, `@acme/team/re` names the workspace too;
      // a single word matches either (056, 118).
      const words = search.replace(/^@/, "");
      const typed = typedNameParts(words);
      if (typed) {
        if (typed.workspace)
          query = query.where(containsInsensitive("workspaces.name", typed.workspace));
        if (typed.scope) query = query.where(containsInsensitive("scopes.name", typed.scope));
        if (typed.name) query = query.where(containsInsensitive("submissions.name", typed.name));
      } else if (words)
        query = query.where((eb) =>
          eb.or([
            containsInsensitive("submissions.name", words),
            containsInsensitive("scopes.name", words),
          ]),
        );
      return (
        await query
          .orderBy("submissions.updated_at", "desc")
          .orderBy("submissions.id", "desc")
          .limit(limit)
          .execute()
      ).map(toSubmission);
    },

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

    pageByAuthor: async ({ sort, dir, size, cursor, ...filters }) => {
      const page = await paginate(byAuthor(filters), {
        sort: {
          key: sort,
          column: sort === "name" ? "submissions.name" : "submissions.updated_at",
          dir,
          kind: sort === "name" ? undefined : "date",
        },
        idColumn: "submissions.id",
        size,
        cursor,
        sortValue: (row) => (sort === "name" ? row.name : fromDbDate(row.updated_at)),
        idOf: (row) => row.id,
        dialect,
      });
      return { ...page, rows: page.rows.map(toSubmission) };
    },

    countByAuthor: (filters) => countCapped(db, byAuthor(filters)),

    statusCountsByAuthor: async (authorId) => {
      const rows = await db
        .selectFrom("submissions")
        .select((eb) => ["status", eb.fn.countAll<number | string | bigint>().as("n")])
        .where("author_id", "=", authorId)
        .where(isReadableSubmission(viewer, "submissions.id"))
        .groupBy("status")
        .execute();
      return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]));
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

    workspacesNamed: async (ids) => {
      if (ids !== "all" && ids.length === 0) return [];
      let query = db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where(inVisibleWorkspace(viewer, "workspaces.id"))
        .orderBy("name");
      if (ids !== "all") query = query.where("id", "in", [...ids]);
      return query.execute();
    },

    countByStatus: async (status, workspaceIds) => {
      let query = db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("submissions.status", "=", status)
        .where(inVisibleWorkspace(viewer, "scopes.workspace_id"));
      if (workspaceIds)
        query = query.where(
          "scopes.workspace_id",
          "in",
          workspaceIds.length > 0 ? [...workspaceIds] : [""],
        );
      const row = await query.executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    countDrafts: async (authorId) => {
      const row = await db
        .selectFrom("submissions")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("author_id", "=", authorId)
        .where("status", "=", "draft")
        .where(isReadableSubmission(viewer, "submissions.id"))
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
        .where(isReadableSubmission(viewer, "submissions.id"))
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

    registry: () => kyselyRegistryLookup(db, dialect, viewer),

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
          .where(isReadableSubmission(viewer, "submission_revisions.submission_id"))
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
          .where((eb) =>
            eb(
              "submission_revision_files.revision_id",
              "in",
              eb
                .selectFrom("submission_revisions")
                .select("submission_revisions.id")
                .where(isReadableSubmission(viewer, "submission_revisions.submission_id")),
            ),
          )
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
          .where(isReadableSubmission(viewer, "review_events.submission_id"))
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
        .where(isReadableSubmission(viewer, "review_events.submission_id"))
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
          .where(isReadableSubmission(viewer, "submission_files.submission_id"))
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
