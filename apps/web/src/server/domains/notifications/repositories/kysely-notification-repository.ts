import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { paginate } from "../../../db/keyset";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import {
  decodeParams,
  decodeWorkspaceIds,
  isNotificationKind,
  isSubjectType,
  type Notification,
} from "../models/notification";
import type { NotificationRepository } from "./notification-repository";

type Db = Kysely<Database>;

type Row = {
  id: string;
  kind: string;
  actor_id: string | null;
  subject_type: string;
  subject_id: string;
  params: string;
  workspace_ids: string | null;
  created_at: Date | string;
  read_at: Date | string | null;
};

const COLUMNS = [
  "id",
  "kind",
  "actor_id",
  "subject_type",
  "subject_id",
  "params",
  "workspace_ids",
  "created_at",
  "read_at",
] as const;

/** A row of a kind or subject this version doesn't know (a newer one wrote it) is skipped. */
const notificationOf = (row: Row): Notification | null =>
  isNotificationKind(row.kind) && isSubjectType(row.subject_type)
    ? {
        id: row.id,
        kind: row.kind,
        actorId: row.actor_id,
        subject: { type: row.subject_type, id: row.subject_id },
        params: decodeParams(row.params),
        workspaceIds: decodeWorkspaceIds(row.workspace_ids),
        createdAt: fromDbDate(row.created_at),
        readAt: row.read_at ? fromDbDate(row.read_at) : null,
      }
    : null;

const known = (rows: Row[]): Notification[] =>
  rows.map(notificationOf).filter((n): n is Notification => n !== null);

export const kyselyNotificationRepository = (
  db: Db,
  dialect: DatabaseDialect,
): NotificationRepository => {
  const repo: NotificationRepository = {
    async insertMany(rows) {
      if (rows.length === 0) return 0;
      await db
        .insertInto("notifications")
        .values(
          rows.map((row) => ({
            id: row.id,
            user_id: row.userId,
            kind: row.kind,
            actor_id: row.actorId,
            subject_type: row.subjectType,
            subject_id: row.subjectId,
            params: row.params,
            workspace_ids: row.workspaceIds,
            created_at: toDbDate(row.createdAt, dialect),
          })),
        )
        .execute();
      return rows.length;
    },

    async page({ userId, state, kinds, size, cursor }) {
      let query = db.selectFrom("notifications").where("user_id", "=", userId);
      if (state === "unread") query = query.where("read_at", "is", null);
      if (state === "read") query = query.where("read_at", "is not", null);
      if (kinds?.length) query = query.where("kind", "in", [...kinds]);
      const page = await paginate(query.select(COLUMNS), {
        sort: { key: "created", column: "notifications.id", dir: "desc" },
        idColumn: "notifications.id",
        size,
        cursor,
        sortValue: (row) => row.id,
        idOf: (row) => row.id,
      });
      return { ...page, rows: known(page.rows) };
    },

    async latest(userId, limit) {
      const rows = await db
        .selectFrom("notifications")
        .select(COLUMNS)
        .where("user_id", "=", userId)
        .orderBy("id", "desc")
        .limit(limit)
        .execute();
      return known(rows);
    },

    async countUnread(userId, cap) {
      const rows = await db
        .selectFrom("notifications")
        .select(["kind", "subject_type"])
        .where("user_id", "=", userId)
        .where("read_at", "is", null)
        .limit(cap)
        .execute();
      return rows.filter((row) => isNotificationKind(row.kind) && isSubjectType(row.subject_type))
        .length;
    },

    async refs(userId, { state, kinds }, cap) {
      let query = db
        .selectFrom("notifications")
        .select(["id", "kind", "subject_type", "subject_id", "workspace_ids"])
        .where("user_id", "=", userId);
      if (state === "unread") query = query.where("read_at", "is", null);
      if (state === "read") query = query.where("read_at", "is not", null);
      if (kinds?.length) query = query.where("kind", "in", [...kinds]);
      const rows = await query.orderBy("id", "desc").limit(cap).execute();
      // Rows of a kind or subject this version doesn't know are left out, as the list leaves them.
      return rows.flatMap((row) =>
        isNotificationKind(row.kind) && isSubjectType(row.subject_type)
          ? [
              {
                id: row.id,
                kind: row.kind,
                subjectType: row.subject_type,
                subjectId: row.subject_id,
                workspaceIds: decodeWorkspaceIds(row.workspace_ids),
              },
            ]
          : [],
      );
    },

    unread: (userId, cap) => repo.refs(userId, { state: "unread" }, cap),

    async markRead(userId, ids, at) {
      if (ids.length === 0) return [];
      const unread = (
        await db
          .selectFrom("notifications")
          .select("id")
          .where("user_id", "=", userId)
          .where("id", "in", [...ids])
          .where("read_at", "is", null)
          .execute()
      ).map((row) => row.id);
      if (unread.length === 0) return [];
      await db
        .updateTable("notifications")
        .set({ read_at: toDbDate(at, dialect) })
        .where("user_id", "=", userId)
        .where("id", "in", unread)
        .where("read_at", "is", null)
        .execute();
      return unread;
    },

    async markAllRead(userId, at) {
      const result = await db
        .updateTable("notifications")
        .set({ read_at: toDbDate(at, dialect) })
        .where("user_id", "=", userId)
        .where("read_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0);
    },

    async deleteOlderThan(before) {
      const result = await db
        .deleteFrom("notifications")
        .where("created_at", "<", toDbDate(before, dialect))
        .executeTakeFirst();
      return Number(result.numDeletedRows ?? 0);
    },
  };
  return repo;
};
