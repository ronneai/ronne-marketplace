import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { countCapped, paginate } from "../../../db/keyset";
import { readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { notify } from "../../notifications/services/notify";
import { activeRoots } from "../../notifications/services/recipients";
import {
  type FeedbackEntry,
  type FeedbackKind,
  type FeedbackStatus,
  isFeedbackKind,
  isFeedbackStatus,
} from "../models/feedback";
import type { FeedbackFilters, FeedbackRepository, FeedbackSort } from "./feedback-repository";

type Db = Kysely<Database>;

const SORT_COLUMNS: Record<FeedbackSort, string> = {
  created: "feedback.id",
  kind: "feedback.kind",
};

const COLUMNS = [
  "feedback.id as id",
  "feedback.kind as kind",
  "feedback.message as message",
  "feedback.page as page",
  "feedback.version as version",
  "feedback.status as status",
  "feedback.created_at as created_at",
  "feedback.handled_at as handled_at",
  "feedback.handled_by as handled_by",
  "user.id as sender_id",
  "user.name as sender_name",
  "user.email as sender_email",
] as const;

type Row = {
  id: string;
  kind: string;
  message: string;
  page: string | null;
  version: string;
  status: string;
  created_at: Date | string;
  handled_at: Date | string | null;
  handled_by: string | null;
  sender_id: string;
  sender_name: string;
  sender_email: string;
};

const entryOf = (row: Row): FeedbackEntry => ({
  id: row.id,
  kind: (isFeedbackKind(row.kind) ? row.kind : "problem") as FeedbackKind,
  message: row.message,
  page: row.page,
  version: row.version,
  status: (isFeedbackStatus(row.status) ? row.status : "new") as FeedbackStatus,
  createdAt: fromDbDate(row.created_at),
  handledAt: row.handled_at ? fromDbDate(row.handled_at) : null,
  handledBy: row.handled_by,
  sender: { id: row.sender_id, name: row.sender_name, email: row.sender_email },
});

export const kyselyFeedbackRepository = (db: Db, dialect: DatabaseDialect): FeedbackRepository => {
  const filtered = ({ search, kind, status }: FeedbackFilters) => {
    let query = db.selectFrom("feedback").innerJoin("user", "user.id", "feedback.user_id");
    if (search)
      query = query.where((eb) =>
        eb.or([
          containsInsensitive("feedback.message", search),
          containsInsensitive("user.name", search),
          containsInsensitive("user.email", search),
        ]),
      );
    if (kind) query = query.where("feedback.kind", "=", kind);
    if (status) query = query.where("feedback.status", "=", status);
    return query;
  };

  return {
    // The row and the notification to every active root (139) are one transaction: a message that
    // isn't stored tells nobody. The notification carries the kind, never the message and never the
    // sender's name: who sent it is the notification's actor, read when it is shown, so erasing
    // the sender (103) leaves their pseudonym there and no name behind.
    insert: (userId, feedback, { version, at, id = newId() }) =>
      readCommittedTransaction(db, dialect).execute(async (trx) => {
        await trx
          .insertInto("feedback")
          .values({
            id,
            user_id: userId,
            kind: feedback.kind,
            message: feedback.message,
            page: feedback.page,
            version,
            created_at: toDbDate(at, dialect),
          })
          .execute();
        await notify(
          trx,
          dialect,
          {
            recipients: await activeRoots(trx),
            kind: "feedback.new",
            actorId: userId,
            subject: { type: "feedback", id },
            params: { feedbackKind: feedback.kind },
          },
          at,
        );
        return id;
      }),

    async page({ sort, dir, size, cursor, ...filters }) {
      const page = await paginate(filtered(filters).select(COLUMNS), {
        sort: { key: sort, column: SORT_COLUMNS[sort], dir },
        idColumn: "feedback.id",
        size,
        cursor,
        sortValue: (row) => (sort === "created" ? row.id : row.kind),
        idOf: (row) => row.id,
      });
      return { ...page, rows: page.rows.map(entryOf) };
    },

    count: (filters) => countCapped(db, filtered(filters).select("feedback.id")),

    async find(id) {
      const row = await db
        .selectFrom("feedback")
        .innerJoin("user", "user.id", "feedback.user_id")
        .select(COLUMNS)
        .where("feedback.id", "=", id)
        .executeTakeFirst();
      return row ? entryOf(row) : null;
    },

    async countNew() {
      const row = await db
        .selectFrom("feedback")
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .where("status", "=", "new")
        .executeTakeFirst();
      return Number(row?.n ?? 0);
    },

    markHandled: (ids, { by, at, audit }) =>
      readCommittedTransaction(db, dialect).execute(async (trx) => {
        if (ids.length === 0) return [];
        const changed = await trx
          .selectFrom("feedback")
          .select("id")
          .where("id", "in", [...ids])
          .where("status", "=", "new")
          .execute();
        const done = changed.map((row) => row.id);
        if (done.length === 0) return [];
        await trx
          .updateTable("feedback")
          .set({ status: "handled", handled_by: by, handled_at: toDbDate(at, dialect) })
          .where("id", "in", done)
          .where("status", "=", "new")
          .execute();
        if (audit) for (const id of done) await recordAudit(trx, dialect, audit(id), at);
        return done;
      }),

    remove: (ids, { at, audit }) =>
      readCommittedTransaction(db, dialect).execute(async (trx) => {
        if (ids.length === 0) return [];
        const found = (
          await trx
            .selectFrom("feedback")
            .select("id")
            .where("id", "in", [...ids])
            .execute()
        ).map((row) => row.id);
        if (found.length === 0) return [];
        await trx.deleteFrom("feedback").where("id", "in", found).execute();
        if (audit) for (const id of found) await recordAudit(trx, dialect, audit(id), at);
        return found;
      }),
  };
};
