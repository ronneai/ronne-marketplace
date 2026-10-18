import type { Kysely, Selectable } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate, isUniqueViolation, retryOnDeadlock } from "../../../db/locks";
import type { Database, DeviceGrantTable } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { DeviceGrant, DeviceGrantStatus } from "../models/device-grant";
import type { DeviceGrantRepository } from "./device-grant-repository";

const COLUMNS = [
  "id",
  "user_code",
  "client_id",
  "name",
  "status",
  "user_id",
  "requester_ip",
  "interval_seconds",
  "failed_attempts",
  "last_polled_at",
  "created_at",
  "expires_at",
] as const;

type Row = Pick<Selectable<DeviceGrantTable>, (typeof COLUMNS)[number]>;

const grant = (row: Row): DeviceGrant => ({
  id: row.id,
  userCode: row.user_code,
  clientId: row.client_id,
  name: row.name,
  status: row.status as DeviceGrantStatus,
  userId: row.user_id,
  requesterIp: row.requester_ip,
  intervalSeconds: Number(row.interval_seconds),
  failedAttempts: Number(row.failed_attempts),
  lastPolledAt: fromDbDate(row.last_polled_at),
  createdAt: fromDbDate(row.created_at),
  expiresAt: fromDbDate(row.expires_at),
});

export const kyselyDeviceGrantRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): DeviceGrantRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const changed = (result: { numUpdatedRows: bigint }) => Number(result.numUpdatedRows) > 0;
  // A wrong code's update touches every pending row while a decision or a poll updates one: MySQL
  // and MariaDB can end that in a deadlock. Each statement stands alone, so it's simply run again.
  const write = retryOnDeadlock;

  return {
    insert: async (row) => {
      const id = newId();
      try {
        await db
          .insertInto("device_grants")
          .values({
            id,
            device_code_hash: row.deviceCodeHash,
            user_code: row.userCode,
            client_id: row.clientId,
            name: row.name,
            status: "pending",
            user_id: null,
            requester_ip: row.requesterIp,
            approver_ip: null,
            interval_seconds: row.intervalSeconds,
            last_polled_at: null,
            decided_at: null,
            created_at: at(row.createdAt),
            expires_at: at(row.expiresAt),
          })
          .execute();
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
      return id;
    },

    findByDeviceCodeHash: async (hash) => {
      const row = await db
        .selectFrom("device_grants")
        .select([...COLUMNS])
        .where("device_code_hash", "=", hash)
        .executeTakeFirst();
      return row ? grant(row) : null;
    },

    findByUserCode: async (userCode) => {
      const row = await db
        .selectFrom("device_grants")
        .select([...COLUMNS])
        .where("user_code", "=", userCode)
        .executeTakeFirst();
      // MySQL's default collation ignores case; the stored code is upper case, as is the lookup.
      return row && row.user_code === userCode ? grant(row) : null;
    },

    decide: async (id, decision, now) =>
      changed(
        await write(() =>
          db
            .updateTable("device_grants")
            .set({
              status: decision.status,
              user_id: decision.userId,
              approver_ip: decision.approverIp,
              decided_at: at(now),
            })
            .where("id", "=", id)
            .where("status", "=", "pending")
            .where("expires_at", ">", at(now))
            .where("failed_attempts", "<", decision.maxWrong)
            .executeTakeFirst(),
        ),
      ),

    spend: async (id, now) =>
      changed(
        await write(() =>
          db
            .updateTable("device_grants")
            .set({ status: "spent" })
            .where("id", "=", id)
            .where("status", "=", "approved")
            .where("expires_at", ">", at(now))
            .executeTakeFirst(),
        ),
      ),

    transition: async (id, from, to) =>
      changed(
        await write(() =>
          db
            .updateTable("device_grants")
            .set({ status: to })
            .where("id", "=", id)
            .where("status", "in", from)
            .executeTakeFirst(),
        ),
      ),

    markPolled: async (id, now, intervalSeconds) => {
      await write(() =>
        db
          .updateTable("device_grants")
          .set({ last_polled_at: at(now), interval_seconds: intervalSeconds })
          .where("id", "=", id)
          .execute(),
      );
    },

    // Every pending row at once: the rows are locked in id order first, so two wrong codes at the
    // same moment wait for each other instead of locking them in two orders (a deadlock on
    // PostgreSQL), and one statement counts and voids.
    countWrongCode: async (now, max) =>
      write(() =>
        db.transaction().execute(async (trx) => {
          const rows = await forUpdate(
            trx
              .selectFrom("device_grants")
              .select("id")
              .where("status", "=", "pending")
              .where("expires_at", ">", at(now))
              .orderBy("id"),
            dialect,
          ).execute();
          const ids = rows.map((row) => row.id);
          if (ids.length === 0) return 0;
          await trx
            .updateTable("device_grants")
            // `status` first: MySQL and MariaDB read a column already set earlier in the same
            // SET, PostgreSQL and SQLite the old value; this way both see the old count.
            .set((eb) => ({
              status: eb
                .case()
                .when("failed_attempts", ">=", max - 1)
                .then("voided")
                .else(eb.ref("status"))
                .end(),
              failed_attempts: eb("failed_attempts", "+", 1),
            }))
            .where("id", "in", ids)
            .execute();
          const voided = await trx
            .selectFrom("device_grants")
            .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
            .where("id", "in", ids)
            .where("status", "=", "voided")
            .executeTakeFirstOrThrow();
          return Number(voided.n);
        }),
      ),

    listUnusedExpired: async (now, limit) =>
      (
        await db
          .selectFrom("device_grants")
          .select([...COLUMNS])
          .where("status", "in", ["pending", "approved"])
          .where("expires_at", "<=", at(now))
          .orderBy("expires_at")
          .limit(limit)
          .execute()
      ).map(grant),

    pruneExpired: async (before) => {
      const result = await db
        .deleteFrom("device_grants")
        .where("expires_at", "<", at(before))
        // A grant still pending or approved waits for the sweep, which audits its expiry first.
        .where("status", "not in", ["pending", "approved"])
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    recordAudit: async (event, now) => {
      await recordAudit(db, dialect, event, now);
    },
  };
};
