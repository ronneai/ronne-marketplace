import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { canonicalId } from "../models/shelf";
import type { FavoriteRepository } from "./favorite-repository";

export const kyselyFavoriteRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): FavoriteRepository => ({
  add: (rawUserId, rawItemId, at, limit) =>
    // The person's row is locked, so two favorites at once can't both pass the limit.
    readCommittedTransaction(db, dialect).execute(async (trx) => {
      const [userId, itemId] = [canonicalId(rawUserId), canonicalId(rawItemId)];
      await forUpdate(
        trx.selectFrom("user").select("id").where("id", "=", userId),
        dialect,
      ).execute();
      const there = await trx
        .selectFrom("item_favorites")
        .select("item_id")
        .where("user_id", "=", userId)
        .where("item_id", "=", itemId)
        .executeTakeFirst();
      if (there) return "exists" as const;
      const { count } = await trx
        .selectFrom("item_favorites")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();
      if (Number(count) >= limit) return "full" as const;
      await trx
        .insertInto("item_favorites")
        .values({ user_id: userId, item_id: itemId, created_at: toDbDate(at, dialect) })
        .execute();
      return "added" as const;
    }),

  remove: async (userId, itemId) =>
    Number(
      (
        await db
          .deleteFrom("item_favorites")
          .where("user_id", "=", canonicalId(userId))
          .where("item_id", "=", canonicalId(itemId))
          .executeTakeFirst()
      ).numDeletedRows,
    ) > 0,

  has: async (userId, itemId) =>
    Boolean(
      await db
        .selectFrom("item_favorites")
        .select("item_id")
        .where("user_id", "=", canonicalId(userId))
        .where("item_id", "=", canonicalId(itemId))
        .executeTakeFirst(),
    ),

  list: async (userId) =>
    (
      await db
        .selectFrom("item_favorites")
        .select(["item_id", "created_at"])
        .where("user_id", "=", canonicalId(userId))
        .orderBy("created_at", "desc")
        .orderBy("item_id", "desc")
        .execute()
    ).map((row) => ({ itemId: row.item_id, createdAt: fromDbDate(row.created_at) })),

  count: async (userId) =>
    Number(
      (
        await db
          .selectFrom("item_favorites")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("user_id", "=", canonicalId(userId))
          .executeTakeFirstOrThrow()
      ).count,
    ),

  among: async (userId, itemIds) =>
    itemIds.length === 0
      ? []
      : (
          await db
            .selectFrom("item_favorites")
            .select("item_id")
            .where("user_id", "=", canonicalId(userId))
            .where("item_id", "in", itemIds.map(canonicalId))
            .execute()
        ).map((row) => row.item_id),

  removeAll: async (userId) =>
    Number(
      (
        await db
          .deleteFrom("item_favorites")
          .where("user_id", "=", canonicalId(userId))
          .executeTakeFirst()
      ).numDeletedRows,
    ),
});
