import { createHash, randomBytes } from "node:crypto";

/**
 * The device flow of RFC 8628 (feature 107): `rmk login --web` asks for a code, a signed-in person
 * approves it on `/device`, and `rmk` exchanges the device code for a personal access token.
 */

/** The clients that may ask for a code: `rmk`, and the MCP server, which is the same tool. */
export const DEVICE_CLIENT_IDS = ["rmk", "rmk-mcp"] as const;
export type DeviceClientId = (typeof DEVICE_CLIENT_IDS)[number];

export const isDeviceClientId = (value: unknown): value is DeviceClientId =>
  (DEVICE_CLIENT_IDS as readonly unknown[]).includes(value);

export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** How long a code lives, and how often `rmk` may poll at first. */
export const DEVICE_GRANT_TTL_SECONDS = 600;
export const DEVICE_POLL_INTERVAL_SECONDS = 5;
/** RFC 8628 §3.5: each `slow_down` adds 5 seconds to the interval. */
export const DEVICE_SLOW_DOWN_SECONDS = 5;

/** Wrong codes entered while a code is pending, before it's voided. */
export const DEVICE_MAX_WRONG_CODES = 5;

/** Rows are deleted this long after they expire, so a late poll still gets `expired_token`. */
export const DEVICE_GRANT_KEEP_MS = 24 * 60 * 60 * 1000;

/** 31 characters: no `0 O 1 I L`, which look alike. */
export const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const USER_CODE_LENGTH = 8;

export type DeviceGrantStatus = "pending" | "approved" | "denied" | "spent" | "voided" | "expired";

/** A grant as the service sees it. The device code itself is never kept, only its hash. */
export type DeviceGrant = {
  id: string;
  userCode: string;
  clientId: string;
  name: string;
  status: DeviceGrantStatus;
  userId: string | null;
  requesterIp: string | null;
  intervalSeconds: number;
  failedAttempts: number;
  lastPolledAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

/** 32 random bytes, base64url: what `rmk` polls with. */
export const generateDeviceCode = (): string => randomBytes(32).toString("base64url");

/** Only this is stored (`device_grants.device_code_hash`), and grants are found by it. */
export const hashDeviceCode = (deviceCode: string): string =>
  createHash("sha256").update(deviceCode).digest("hex");

// The largest multiple of 31 below 256: bytes from 248 up are skipped, so every character is as
// likely as the others.
const UNBIASED_BYTE_LIMIT = 256 - (256 % USER_CODE_ALPHABET.length);

/** 8 characters from the alphabet, uniformly, stored without the dash. */
export const generateUserCode = (): string => {
  let code = "";
  while (code.length < USER_CODE_LENGTH) {
    for (const byte of randomBytes(USER_CODE_LENGTH * 2)) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
      if (code.length === USER_CODE_LENGTH) break;
    }
  }
  return code;
};

/** `WDJBMJHT` → `WDJB-MJHT`, as `rmk` and the page show it. */
export const formatUserCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

const USER_CODE = new RegExp(`^[${USER_CODE_ALPHABET}]{${USER_CODE_LENGTH}}$`);

/**
 * A typed code as it's stored: upper case, without spaces or dashes. Null when it can't be one
 * (another length, or a character outside the alphabet).
 */
export const normalizeUserCode = (typed: string): string | null => {
  const code = typed.replace(/[\s-]/g, "").toUpperCase();
  return USER_CODE.test(code) ? code : null;
};
