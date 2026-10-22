import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import type { Database } from "../../../db/schema";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import { NO_ONBOARDING } from "../models/onboarding";
import type { OnboardingRepository } from "./onboarding-repository";

export const kyselyOnboardingRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): OnboardingRepository => {
  /** Sets `columns` on the person's row, making it if needed; the other columns are untouched. */
  const write = async (
    userId: string,
    at: Date,
    columns: Record<string, Date | null>,
  ): Promise<void> => {
    const values = Object.fromEntries(
      Object.entries(columns).map(([column, value]) => [column, value && toDbDate(value, dialect)]),
    );
    await upsert(
      db,
      dialect,
      "user_onboarding",
      { user_id: userId, ...values, updated_at: toDbDate(at, dialect) },
      ["user_id"],
      [...Object.keys(columns), "updated_at"],
    ).execute();
  };

  /**
   * Sets one column to `at` only while it is still null, so the first time stays even when two
   * writes meet: the row is made if needed, then the update names the null.
   */
  const writeFirst = async (
    userId: string,
    at: Date,
    column: "install_confirmed_at" | "completed_seen_at",
  ): Promise<void> => {
    await write(userId, at, {});
    await db
      .updateTable("user_onboarding")
      .set({ [column]: toDbDate(at, dialect) })
      .where("user_id", "=", userId)
      .where(column, "is", null)
      .execute();
  };

  return {
    async get(userId) {
      const row = await db
        .selectFrom("user_onboarding")
        .select(["hidden_at", "install_confirmed_at", "completed_seen_at"])
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!row) return NO_ONBOARDING;
      return {
        hiddenAt: row.hidden_at ? fromDbDate(row.hidden_at) : null,
        installConfirmedAt: row.install_confirmed_at ? fromDbDate(row.install_confirmed_at) : null,
        completedSeenAt: row.completed_seen_at ? fromDbDate(row.completed_seen_at) : null,
      };
    },

    hide: (userId, at) => write(userId, at, { hidden_at: at }),
    confirmInstall: (userId, at) => writeFirst(userId, at, "install_confirmed_at"),
    markCompletedSeen: (userId, at) => writeFirst(userId, at, "completed_seen_at"),
    show: (userId, at) => write(userId, at, { hidden_at: null, completed_seen_at: null }),

    async remove(userId) {
      const result = await db
        .deleteFrom("user_onboarding")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
};
