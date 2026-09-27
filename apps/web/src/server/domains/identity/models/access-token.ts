import { createHash, randomBytes } from "node:crypto";
import { InvalidTokenLifetimeError, InvalidTokenNameError } from "../exceptions/errors";

/**
 * Personal access tokens (feature 009): `rmk_` + 32 random bytes in base64url, 47 characters.
 * The prefix makes them easy to spot, for people and for secret scanning.
 */
export const TOKEN_PREFIX = "rmk_";
const TOKEN = /^rmk_[A-Za-z0-9_-]{43}$/;

/** How many characters of a token are kept in plain text to tell tokens apart: `rmk_` + 8. */
export const TOKEN_PREVIEW_LENGTH = TOKEN_PREFIX.length + 8;

export const MAX_ACTIVE_TOKENS = 50;
export const TOKEN_NAME_MAX_LENGTH = 100;

/** The lifetimes a token can be given, in days; null is "no expiry". */
export const TOKEN_LIFETIMES = [30, 90, 365, null] as const;
export type TokenLifetime = (typeof TOKEN_LIFETIMES)[number];
export const DEFAULT_TOKEN_LIFETIME: TokenLifetime = 90;

export type TokenStatus = "active" | "expired" | "revoked";

/** A token as its owner's list shows it. Never the token itself: only its preview. */
export type AccessTokenSummary = {
  id: string;
  name: string;
  preview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export const generateToken = (): string =>
  `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

/** Only this is stored (`access_tokens.token_hash`), and tokens are looked up by it. */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Whether a string has the token format. Anything else is refused before the database is asked. */
export const isTokenFormat = (value: string): boolean => TOKEN.test(value);

export const tokenPreview = (token: string): string => token.slice(0, TOKEN_PREVIEW_LENGTH);

export const normalizeTokenName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed.length === 0 || [...trimmed].length > TOKEN_NAME_MAX_LENGTH)
    throw new InvalidTokenNameError();
  return trimmed;
};

/** Reads a lifetime from a form or a request: "30", "90", "365" or "none". */
export const parseTokenLifetime = (value: string | number | null | undefined): TokenLifetime => {
  if (value === undefined || value === "") return DEFAULT_TOKEN_LIFETIME;
  if (value === null || value === "none") return null;
  const days = Number(value);
  const lifetime = TOKEN_LIFETIMES.find((l) => l === days);
  if (lifetime === undefined) throw new InvalidTokenLifetimeError(String(value));
  return lifetime;
};

const DAY_MS = 86_400_000;

export const tokenExpiry = (lifetime: TokenLifetime, now: Date): Date | null =>
  lifetime === null ? null : new Date(now.getTime() + lifetime * DAY_MS);

export const tokenStatus = (
  token: { expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
): TokenStatus => {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && token.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
};
