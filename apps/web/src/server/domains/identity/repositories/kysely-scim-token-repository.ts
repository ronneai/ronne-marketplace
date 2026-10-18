import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { LAST_USED_THROTTLE_MS } from "./kysely-token-repository";
import type { ScimTokenRepository } from "./scim-token-repository";

export const kyselyScimTokenRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ScimTokenRepository => {
  const at = (date: Date) => toDbDate(date, dialect);

  return {
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyScimTokenRepository(trx, dialect)),
      ),

    lockProvider: async (providerId) => {
      const row = await forUpdate(
        db.selectFrom("identity_providers").select("scim_enabled_at").where("id", "=", providerId),
        dialect,
      ).executeTakeFirst();
      return row ? { scimEnabledAt: fromDbDate(row.scim_enabled_at) } : null;
    },

    setScimEnabled: async (providerId, enabledAt) => {
      await db
        .updateTable("identity_providers")
        .set({ scim_enabled_at: enabledAt ? at(enabledAt) : null })
        .where("id", "=", providerId)
        .execute();
    },

    listWorking: async (providerId, now) => {
      const rows = await db
        .selectFrom("scim_tokens")
        .select(["id", "created_at", "created_by", "expires_at", "last_used_at"])
        .where("provider_id", "=", providerId)
        .where("revoked_at", "is", null)
        .where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", at(now))]))
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .execute();
      return rows.map((row) => ({
        id: row.id,
        createdAt: fromDbDate(row.created_at),
        createdBy: row.created_by,
        expiresAt: fromDbDate(row.expires_at),
        lastUsedAt: fromDbDate(row.last_used_at),
      }));
    },

    insert: async (row) => {
      const id = newId();
      await db
        .insertInto("scim_tokens")
        .values({
          id,
          provider_id: row.providerId,
          token_hash: row.tokenHash,
          created_by: row.createdBy,
          created_at: at(row.createdAt),
          expires_at: null,
          revoked_at: null,
          last_used_at: null,
        })
        .execute();
      return id;
    },

    setExpiry: async (tokenId, expiresAt) => {
      await db
        .updateTable("scim_tokens")
        .set({ expires_at: at(expiresAt) })
        .where("id", "=", tokenId)
        .execute();
    },

    revoke: async (tokenIds, now) => {
      if (tokenIds.length === 0) return 0;
      const result = await db
        .updateTable("scim_tokens")
        .set({ revoked_at: at(now) })
        .where("id", "in", tokenIds)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    findByHash: async (tokenHash) => {
      const row = await db
        .selectFrom("scim_tokens")
        .innerJoin("identity_providers", "identity_providers.id", "scim_tokens.provider_id")
        .select([
          "scim_tokens.id",
          "scim_tokens.provider_id",
          "scim_tokens.token_hash",
          "scim_tokens.expires_at",
          "scim_tokens.revoked_at",
          "identity_providers.scim_enabled_at",
        ])
        .where("scim_tokens.token_hash", "=", tokenHash)
        .executeTakeFirst();
      // Hex compares the same everywhere, but the match decides who's calling: check it exactly.
      if (!row || row.token_hash !== tokenHash) return null;
      return {
        tokenId: row.id,
        providerId: row.provider_id,
        expiresAt: fromDbDate(row.expires_at),
        revokedAt: fromDbDate(row.revoked_at),
        scimEnabledAt: fromDbDate(row.scim_enabled_at),
      };
    },

    touchLastUsed: async (tokenId, now) => {
      const cutoff = at(new Date(now.getTime() - LAST_USED_THROTTLE_MS));
      const result = await db
        .updateTable("scim_tokens")
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
