/**
 * Flash toasts (feature 138): a server action that redirects leaves a message for the next page in
 * a short-lived cookie. The cookie holds a message key and its parameters, never text, so a cookie
 * a person edits can only choose among our own messages (and the person's own language is used
 * to say it). Everything here is plain and shared by the server and the browser.
 */
export const FLASH_COOKIE = "ronne-toast";

/** Seconds the cookie lives: enough for the redirect to land, short enough to never show late. */
export const FLASH_MAX_AGE = 30;

/** At most this many characters in the cookie's value. */
export const FLASH_MAX_LENGTH = 1024;

/** The messages a flash can name: `common.flash.<key>`. */
export const FLASH_KEYS = ["draftDeleted"] as const;
export type FlashKey = (typeof FLASH_KEYS)[number];

export const FLASH_KINDS = ["ok", "info", "warning", "error"] as const;
export type FlashKind = (typeof FLASH_KINDS)[number];

export type FlashParams = Record<string, string | number>;
export type Flash = { id: string; kind: FlashKind; key: FlashKey; params: FlashParams };

const PARAM_NAME = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
const MAX_PARAMS = 5;
const MAX_PARAM_TEXT = 200;
const MAX_ID = 64;

export const serializeFlash = (flash: Flash): string =>
  JSON.stringify({ i: flash.id, t: flash.kind, k: flash.key, p: flash.params });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What a cookie's value says, or null for anything that is not exactly a flash: too long, not
 * JSON, a key that is not one of ours, a parameter that is not a short text or a number. Nothing
 * partly valid is used.
 */
export const parseFlash = (value: string | null | undefined): Flash | null => {
  if (!value || value.length > FLASH_MAX_LENGTH) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { i, t, k, p } = raw;
  if (typeof i !== "string" || i.length === 0 || i.length > MAX_ID) return null;
  const kind = t === undefined ? "ok" : t;
  if (!(FLASH_KINDS as readonly unknown[]).includes(kind)) return null;
  if (!(FLASH_KEYS as readonly unknown[]).includes(k)) return null;
  const entries = p === undefined ? [] : isRecord(p) ? Object.entries(p) : null;
  if (!entries || entries.length > MAX_PARAMS) return null;
  const params: FlashParams = {};
  for (const [name, param] of entries) {
    if (!PARAM_NAME.test(name)) return null;
    const text = typeof param === "string" && param.length <= MAX_PARAM_TEXT;
    if (!(text || (typeof param === "number" && Number.isFinite(param)))) return null;
    params[name] = param as string | number;
  }
  return { id: i, kind: kind as FlashKind, key: k as FlashKey, params };
};
