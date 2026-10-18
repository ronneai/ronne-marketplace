import { createHash, randomBytes } from "node:crypto";

/**
 * SCIM bearer tokens (feature 108): what an identity provider sends to provision accounts. `scim_`
 * + 32 random bytes in base64url, 48 characters; only the SHA-256 hash is stored. The prefix tells
 * them from personal access tokens (`rmk_`), for people and for secret scanning.
 */
export const SCIM_TOKEN_PREFIX = "scim_";
const SCIM_TOKEN = /^scim_[A-Za-z0-9_-]{43}$/;

/** How long the token before a rotation keeps working, so the provider can be changed calmly. */
export const SCIM_ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000;

/** A token as the provider's SCIM section shows it. Never the token itself. */
export type ScimTokenSummary = {
  id: string;
  createdAt: Date;
  createdBy: string | null;
  /** Null for the current token; the end of its 24 hours for the one before a rotation. */
  expiresAt: Date | null;
  lastUsedAt: Date | null;
};

export const generateScimToken = (): string =>
  `${SCIM_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

/** Only this is stored (`scim_tokens.token_hash`), and tokens are found by it. */
export const hashScimToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Whether a string has the format. Anything else is refused before the database is asked. */
export const isScimTokenFormat = (value: string): boolean => SCIM_TOKEN.test(value);

/** Whether a token still works at `now`: not revoked, and not past the end of a rotation. */
export const scimTokenWorks = (
  token: { expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
): boolean =>
  token.revokedAt === null &&
  (token.expiresAt === null || token.expiresAt.getTime() > now.getTime());
