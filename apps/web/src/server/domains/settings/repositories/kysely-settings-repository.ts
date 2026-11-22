import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { isUniqueViolation } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { SettingsRepository } from "./settings-repository";

export const kyselySettingsRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): SettingsRepository => ({
  async get(key) {
    const row = await db
      .selectFrom("instance_settings")
      .select(["value", "updated_by", "updated_at"])
      .where("key", "=", key)
      .executeTakeFirst();
    return row
      ? { value: row.value, updatedBy: row.updated_by, updatedAt: fromDbDate(row.updated_at) }
      : null;
  },

  async set(key, value, updatedBy, at) {
    await upsert(
      db,
      dialect,
      "instance_settings",
      { key, value, updated_by: updatedBy, updated_at: toDbDate(at, dialect) },
      ["key"],
      ["value", "updated_by", "updated_at"],
    ).execute();
  },

  async compareAndSet(key, expected, value, updatedBy, at) {
    const row = { value, updated_by: updatedBy, updated_at: toDbDate(at, dialect) };
    if (expected === null) {
      try {
        await db
          .insertInto("instance_settings")
          .values({ key, ...row })
          .execute();
        return true;
      } catch (error) {
        // Another save made the row first: this one is stale.
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    }
    const result = await db
      .updateTable("instance_settings")
      .set(row)
      .where("key", "=", key)
      .where("value", "=", expected)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  },

  async nameOf(userId) {
    const row = await db
      .selectFrom("user")
      .select("name")
      .where("id", "=", userId)
      .executeTakeFirst();
    return row?.name ?? null;
  },

  transaction: (work) =>
    db.transaction().execute((trx) => work(kyselySettingsRepository(trx, dialect))),

  async recordAudit(event, at) {
    await recordAudit(db, dialect, event, at);
  },
});
