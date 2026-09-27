import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { AccessTokenSummary } from "../models/access-token";
import { isRole } from "../models/user";
import type { TokenRepository } from "./token-repository";

/** `last_used_at` is written at most this often per token, so busy clients don't write on every request. */
export const LAST_USED_THROTTLE_MS = 60_000;

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
};

const summary = (row: TokenRow): AccessTokenSummary => ({
  id: row.id,
  name: row.name,
  preview: row.token_prefix ?? "rmk_",
  createdAt: fromDbDate(row.created_at),
  lastUsedAt: fromDbDate(row.last_used_at),
  expiresAt: fromDbDate(row.expires_at),
  revokedAt: fromDbDate(row.revoked_at),
});

const SUMMARY_COLUMNS = [
  "id",
  "name",
  "token_prefix",
  "created_at",
  "last_used_at",
  "expires_at",
  "revoked_at",
] as const;

export const kyselyTokenRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): TokenRepository => {
  const at = (date: Date) => toDbDate(date, dialect);

  /** Active: not revoked, and without an expiry or with one still ahead. */
  const active = (userId: string, now: Date) =>
    db
      .selectFrom("access_tokens")
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", at(now))]));

  return {
    transaction: (work) =>
      db.transaction().execute((trx) => work(kyselyTokenRepository(trx, dialect))),

    countActive: async (userId, now) => {
      const row = await active(userId, now)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    activeNameTaken: async (userId, name, now) =>
      Boolean(await active(userId, now).select("id").where("name", "=", name).executeTakeFirst()),

    insert: async (row) => {
      const id = newId();
      await db
        .insertInto("access_tokens")
        .values({
          id,
          user_id: row.userId,
          name: row.name,
          token_hash: row.tokenHash,
          token_prefix: row.tokenPrefix,
          last_used_at: null,
          expires_at: row.expiresAt ? at(row.expiresAt) : null,
          revoked_at: null,
          created_at: at(row.createdAt),
        })
        .execute();
      return id;
    },

    listForUser: async (userId) =>
      (
        await db
          .selectFrom("access_tokens")
          .select([...SUMMARY_COLUMNS])
          .where("user_id", "=", userId)
          .orderBy("id", "desc")
          .execute()
      ).map(summary),

    findOwned: async (tokenId, userId) => {
      const row = await db
        .selectFrom("access_tokens")
        .select([...SUMMARY_COLUMNS])
        .where("id", "=", tokenId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      return row ? summary(row) : null;
    },

    revoke: async (tokenId, now) => {
      await db
        .updateTable("access_tokens")
        .set({ revoked_at: at(now) })
        .where("id", "=", tokenId)
        .where("revoked_at", "is", null)
        .execute();
    },

    findByHash: async (tokenHash) => {
      const row = await db
        .selectFrom("access_tokens")
        .innerJoin("user", "user.id", "access_tokens.user_id")
        .select([
          "access_tokens.id as token_id",
          "access_tokens.name as token_name",
          "access_tokens.expires_at",
          "access_tokens.revoked_at",
          "user.id as user_id",
          "user.email",
          "user.name as user_name",
          "user.role",
          "user.disabled_at",
        ])
        .where("access_tokens.token_hash", "=", tokenHash)
        .executeTakeFirst();
      if (!row) return null;
      return {
        token: {
          id: row.token_id,
          name: row.token_name,
          expiresAt: fromDbDate(row.expires_at),
          revokedAt: fromDbDate(row.revoked_at),
        },
        user: {
          id: row.user_id,
          email: row.email,
          name: row.user_name,
          // A role outside the three gets no permissions; the guard refuses it as a plain user would be.
          role: isRole(row.role) ? row.role : "user",
          disabledAt: fromDbDate(row.disabled_at),
        },
      };
    },

    touchLastUsed: async (tokenId, now) => {
      const cutoff = at(new Date(now.getTime() - LAST_USED_THROTTLE_MS));
      const result = await db
        .updateTable("access_tokens")
        .set({ last_used_at: at(now) })
        .where("id", "=", tokenId)
        .where((eb) => eb.or([eb("last_used_at", "is", null), eb("last_used_at", "<", cutoff)]))
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    recordAudit: async (event, now) => {
      await recordAudit(db, dialect, event, now);
    },
  };
};
