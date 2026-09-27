import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson } from "../../../db/json";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { type AuditMetadata, actionsInGroup } from "../models/audit-event";
import type { AuditRepository } from "./audit-repository";

export const kyselyAuditRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): AuditRepository => {
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

    async list({ cursor, limit, group, actor, from, to }) {
      let query = db
        .selectFrom("audit_log")
        .leftJoin("user", "user.id", "audit_log.actor_id")
        .select([
          "audit_log.id",
          "audit_log.actor_id",
          "user.email as actor_email",
          "audit_log.action",
          "audit_log.target_type",
          "audit_log.target_id",
          "audit_log.metadata",
          "audit_log.ip_address",
          "audit_log.created_at",
        ])
        // ULIDs sort by creation time, and the id is unique, so it's a stable cursor.
        .orderBy("audit_log.id", "desc")
        .limit(limit);
      if (cursor) query = query.where("audit_log.id", "<", cursor);
      // The catalogue's actions for the group: an IN list rather than LIKE, whose `_` is a wildcard.
      if (group) query = query.where("audit_log.action", "in", actionsInGroup(group));
      if (actor === "system") query = query.where("audit_log.actor_id", "is", null);
      else if (actor) query = query.where("audit_log.actor_id", "=", actor);
      if (from) query = query.where("audit_log.created_at", ">=", toDbDate(from, dialect));
      if (to) query = query.where("audit_log.created_at", "<", toDbDate(to, dialect));

      const rows = await query.execute();
      return rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.actor_email,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: decodeJson<AuditMetadata>(row.metadata),
        ipAddress: row.ip_address,
        createdAt: fromDbDate(row.created_at),
      }));
    },

    async actors() {
      const rows = await db
        .selectFrom("audit_log")
        .leftJoin("user", "user.id", "audit_log.actor_id")
        .select(["audit_log.actor_id", "user.email"])
        .where("audit_log.actor_id", "is not", null)
        .groupBy(["audit_log.actor_id", "user.email"])
        .orderBy("user.email")
        .execute();
      return rows.map((r) => ({ id: r.actor_id as string, email: r.email }));
    },
  };
};
