import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { AccessTokenSummary } from "../models/access-token";
import type { Memberships, Role } from "../models/user";

export type NewTokenRow = {
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  expiresAt: Date | null;
  createdAt: Date;
};

/** A token found by its hash, with its owner, for the bearer guard. */
export type TokenWithUser = {
  token: { id: string; name: string; expiresAt: Date | null; revokedAt: Date | null };
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    workspaces: Memberships;
    disabledAt: Date | null;
  };
};

/** What the token services need from storage. Implemented with Kysely in kysely-token-repository.ts. */
export interface TokenRepository {
  transaction<T>(work: (repo: TokenRepository) => Promise<T>): Promise<T>;
  /** Tokens that are neither revoked nor expired at `now`. */
  countActive(userId: string, now: Date): Promise<number>;
  activeNameTaken(userId: string, name: string, now: Date): Promise<boolean>;
  insert(row: NewTokenRow): Promise<string>;
  /** The user's tokens, newest first. */
  listForUser(userId: string): Promise<AccessTokenSummary[]>;
  /** The token, only if it belongs to the user. */
  findOwned(tokenId: string, userId: string): Promise<AccessTokenSummary | null>;
  revoke(tokenId: string, now: Date): Promise<void>;
  findByHash(tokenHash: string): Promise<TokenWithUser | null>;
  /** Sets last_used_at to `now` unless it was set in the last minute. Returns whether it wrote. */
  touchLastUsed(tokenId: string, now: Date): Promise<boolean>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
