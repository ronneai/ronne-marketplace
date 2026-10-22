import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { ProgressRepository } from "./progress-repository";

export const kyselyProgressRepository = (db: Kysely<Database>): ProgressRepository => {
  const exists = async (query: { executeTakeFirst(): Promise<unknown> }) =>
    (await query.executeTakeFirst()) !== undefined;

  return {
    async facts(userId) {
      const hasToken = await exists(
        db
          .selectFrom("access_tokens")
          .select("id")
          .where("user_id", "=", userId)
          .where("revoked_at", "is", null)
          .limit(1),
      );
      // A token that was used and later revoked still shows they connected rmk.
      const used = await exists(
        db
          .selectFrom("access_tokens")
          .select("id")
          .where("user_id", "=", userId)
          .where("last_used_at", "is not", null)
          .limit(1),
      );
      // The grant `rmk login --web` asked for is approved, and then spent when rmk collects it.
      const approved = used
        ? false
        : await exists(
            db
              .selectFrom("device_grants")
              .select("id")
              .where("user_id", "=", userId)
              .where("status", "in", ["approved", "spent"])
              .limit(1),
          );
      const hasSubmission = await exists(
        db.selectFrom("submissions").select("id").where("author_id", "=", userId).limit(1),
      );
      return { hasToken, connected: used || approved, hasSubmission };
    },
  };
};
