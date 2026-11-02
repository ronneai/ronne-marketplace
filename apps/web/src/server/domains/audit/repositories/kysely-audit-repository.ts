import { type Kysely, sql } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson } from "../../../db/json";
import { countCapped, type KeysetSort, paginate, type SortDir } from "../../../db/keyset";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import { isRequestId } from "../../../log/request-id";
import {
  type AuditEvent,
  type AuditMetadata,
  actionsInGroup,
  isChannel,
  isOutcome,
} from "../models/audit-event";
import type { AuditFilters, AuditRepository, AuditSort } from "./audit-repository";

const COLUMNS = [
  "audit_log.id",
  "audit_log.actor_id",
  "actor.email as actor_email",
  "actor.name as actor_name",
  "audit_log.action",
  "audit_log.target_type",
  "audit_log.target_id",
  "target_user.email as target_email",
  "target_user.name as target_name",
  "audit_log.metadata",
  "audit_log.ip_address",
  "audit_log.created_at",
  "audit_log.request_id",
  "audit_log.via",
  "audit_log.user_agent",
  "audit_log.workspace_id",
  "audit_log.outcome",
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
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_email: string | null;
  target_name: string | null;
  metadata: string;
  ip_address: string | null;
  created_at: Date | string;
  request_id: string | null;
  via: string | null;
  user_agent: string | null;
  workspace_id: string | null;
  outcome: string;
};

const toEvent = (row: Row): AuditEvent => ({
  id: row.id,
  actorId: row.actor_id,
  actorEmail: row.actor_email,
  actorName: row.actor_name,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  targetEmail: row.target_email,
  targetName: row.target_name,
  metadata: decodeJson<AuditMetadata>(row.metadata),
  ipAddress: row.ip_address,
  createdAt: fromDbDate(row.created_at),
  requestId: row.request_id,
  via: isChannel(row.via) ? row.via : null,
  userAgent: row.user_agent,
  workspaceId: row.workspace_id,
  outcome: isOutcome(row.outcome) ? row.outcome : "success",
});

export const kyselyAuditRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): AuditRepository => {
  /** The events matching the filters, with who acted and, for a user target, their email. */
  const filtered = ({ action, group, actor, from, to, workspace, requestId }: AuditFilters) => {
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
    // By name or email (166): names aren't unique, so a user's page links by email.
    else if (actor)
      query = query.where((eb) =>
        eb.or([
          containsInsensitive("actor.email", actor),
          containsInsensitive("actor.name", actor),
        ]),
      );
    if (workspace) query = query.where("audit_log.workspace_id", "=", workspace);
    // Exact, and only something that could be an ID: MySQL's binary collation still pads spaces.
    if (requestId !== undefined)
      query = isRequestId(requestId)
        ? query.where("audit_log.request_id", "=", requestId)
        : query.where(sql<boolean>`1 = 0`);
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
          request_id: row.requestId,
          via: row.via,
          user_agent: row.userAgent,
          workspace_id: row.workspaceId,
          outcome: row.outcome,
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

    async workspaces() {
      const live = await db.selectFrom("workspaces").select(["id", "name"]).execute();
      const ids = new Set(live.map((w) => w.id));
      const gone = await db
        .selectFrom("audit_log")
        .select(["target_id", "metadata"])
        .where("action", "=", "workspace.deleted")
        .where("target_type", "=", "workspace")
        .execute();
      const deleted = new Map<string, string>();
      for (const row of gone) {
        const name = decodeJson<AuditMetadata>(row.metadata).name;
        if (row.target_id && !ids.has(row.target_id) && typeof name === "string")
          deleted.set(row.target_id, name);
      }
      return [
        ...live.map((w) => ({ id: w.id, name: w.name, deleted: false })),
        ...[...deleted].map(([id, name]) => ({ id, name, deleted: true })),
      ].sort((a, b) => a.name.localeCompare(b.name) || Number(a.deleted) - Number(b.deleted));
    },

    async findById(id) {
      const row = await filtered({})
        .select(COLUMNS)
        .where("audit_log.id", "=", id)
        .executeTakeFirst();
      return row ? toEvent(row) : null;
    },
  };
};
