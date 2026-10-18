import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { ScimTokenSummary } from "../models/scim-token";

/** A token found by its hash, with its provider's SCIM state, for the SCIM guard. */
export type ScimTokenMatch = {
  tokenId: string;
  providerId: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  /** When SCIM was turned on for the provider; null while it's off. */
  scimEnabledAt: Date | null;
};

/** What SCIM's token service needs from storage (feature 108). Kysely: kysely-scim-token-repository.ts. */
export interface ScimTokenRepository {
  transaction<T>(work: (repo: ScimTokenRepository) => Promise<T>): Promise<T>;
  /**
   * Locks the provider's row until the transaction ends, so two changes to its SCIM can't
   * interleave. Null when there's no such provider.
   */
  lockProvider(providerId: string): Promise<{ scimEnabledAt: Date | null } | null>;
  setScimEnabled(providerId: string, enabledAt: Date | null): Promise<void>;
  /** The provider's tokens that still work at `now`, newest first. */
  listWorking(providerId: string, now: Date): Promise<ScimTokenSummary[]>;
  insert(row: {
    providerId: string;
    tokenHash: string;
    createdBy: string | null;
    createdAt: Date;
  }): Promise<string>;
  setExpiry(tokenId: string, expiresAt: Date): Promise<void>;
  /** Revokes those of `tokenIds` not revoked yet. Returns how many it revoked. */
  revoke(tokenIds: string[], now: Date): Promise<number>;
  findByHash(tokenHash: string): Promise<ScimTokenMatch | null>;
  /** Sets last_used_at to `now` unless it was set in the last minute. Returns whether it wrote. */
  touchLastUsed(tokenId: string, now: Date): Promise<boolean>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
