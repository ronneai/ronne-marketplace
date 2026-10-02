import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson } from "../../../db/json";
import { countCapped, type KeysetSort, paginate, type SortDir } from "../../../db/keyset";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { type AuditEvent, type AuditMetadata, actionsInGroup } from "../models/audit-event";
import type { AuditFilters, AuditRepository, AuditSort } from "./audit-repository";

const COLUMNS = [
  "audit_log.id",
  "audit_log.actor_id",
  "actor.email as actor_email",
  "audit_log.action",
  "audit_log.target_type",
  "audit_log.target_id",
  "target_user.email as target_email",
  "audit_log.metadata",
  "audit_log.ip_address",
  "audit_log.created_at",
] as const;

const SORTS: Record<AuditSort, (dir: SortDir) => KeysetSort> = {
  // ULIDs sort by creation time, and the id is unique, so it's a stable key on its own.
  time: (dir) => ({ key: "time", column: "audit_log.id", dir }),
  action: (dir) => ({ key: "action", column: "audit_log.action", dir }),
};

type Row = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_email: string | null;
  metadata: string;
  ip_address: string | null;
  created_at: Date | string;
};

const toEvent = (row: Row): AuditEvent => ({
  id: row.id,
  actorId: row.actor_id,
  actorEmail: row.actor_email,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  targetEmail: row.target_email,
  metadata: decodeJson<AuditMetadata>(row.metadata),
  ipAddress: row.ip_address,
  createdAt: fromDbDate(row.created_at),
});

export const kyselyAuditRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): AuditRepository => {
  /** The events matching the filters, with who acted and, for a user target, their email. */
  const filtered = ({ action, group, actor, from, to }: AuditFilters) => {
    let query = db
      .selectFrom("audit_log")
      .leftJoin("user as actor", "actor.id", "audit_log.actor_id")
      .leftJoin("user as target_user", (join) =>
        join
          .onRef("target_user.id", "=", "audit_log.target_id")
          .on("audit_log.target_type", "=", "user"),
      );
    if (action) query = query.where("audit_log.action", "=", action);
    // The catalogue's actions for the group: an IN list rather than LIKE, whose `_` is a wildcard.
    if (group) query = query.where("audit_log.action", "in", actionsInGroup(group));
    if (actor === "system") query = query.where("audit_log.actor_id", "is", null);
    else if (actor) query = query.where(containsInsensitive("actor.email", actor));
    if (from) query = query.where("audit_log.created_at", ">=", toDbDate(from, dialect));
    if (to) query = query.where("audit_log.created_at", "<", toDbDate(to, dialect));
    return query;
  };

  return {
    async insert(row) {
      const id = newId();
      await db
        .insertInto("audit_log")
        .values({
          id,
          actor_id: row.actorId,
          action: row.action,
          target_type: row.targetType,
          target_id: row.targetId,
          metadata: row.metadata,
          ip_address: row.ipAddress,
          created_at: toDbDate(row.createdAt, dialect),
        })
        .execute();
      return id;
    },

    async list({ sort, dir, size, cursor, ...filters }) {
      const page = await paginate(filtered(filters).select(COLUMNS), {
        sort: SORTS[sort](dir),
        idColumn: "audit_log.id",
        size,
        cursor,
        sortValue: (row) => (sort === "action" ? row.action : row.id),
        idOf: (row) => row.id,
      });
      return { ...page, rows: page.rows.map(toEvent) };
    },

    count: (filters) => countCapped(db, filtered(filters).select("audit_log.id")),

    async findById(id) {
      const row = await filtered({})
        .select(COLUMNS)
        .where("audit_log.id", "=", id)
        .executeTakeFirst();
      return row ? toEvent(row) : null;
    },
  };
};
