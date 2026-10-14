// Every event the server logs (feature 100): its stable name, for searches and alerts, its level and
// its fixed message. The Documentation's events table is written from this list, so it can't drift.

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export type EventSpec = {
  /** The usual level; some events go up or down with what happened (http.request on a 5xx). */
  level: LogLevel;
  /** A short sentence for people, with no values in it. */
  msg: string;
  /** The event's own fields, besides the ones every line can carry. */
  fields: readonly string[];
};

export const EVENTS = {
  "server.started": {
    level: "info",
    msg: "Server started",
    fields: ["version", "dialect", "setup", "runtime", "port"],
  },
  "server.migrations_applied": {
    level: "info",
    msg: "Database migrations applied",
    fields: ["count", "latest"],
  },
  "http.request": {
    level: "info",
    msg: "Request handled",
    fields: ["method", "route", "status", "ms", "userId"],
  },
  "http.error": { level: "error", msg: "Unexpected error", fields: ["err", "route"] },
  "auth.signed_in": { level: "info", msg: "Signed in", fields: ["userId"] },
  "auth.sign_in_failed": { level: "warn", msg: "Sign-in failed", fields: ["reason", "via"] },
  "auth.rate_limited": { level: "warn", msg: "Rate limit reached", fields: ["limit"] },
  "token.exchanged": { level: "info", msg: "Access token issued", fields: ["userId"] },
  "token.rejected": { level: "warn", msg: "Access token rejected", fields: ["reason"] },
  "version.released": { level: "info", msg: "Released", fields: ["count", "userId"] },
  "version.yanked": { level: "info", msg: "Version yanked", fields: ["userId"] },
  "draft.uploaded": { level: "info", msg: "Draft uploaded", fields: ["files", "bytes"] },
  "draft.upload_refused": { level: "warn", msg: "Draft upload refused", fields: ["reason"] },
  "upload.rate_limited": { level: "warn", msg: "Upload rate limit reached", fields: ["limit"] },
  "usage.rate_limited": { level: "warn", msg: "Usage rate limit reached", fields: ["limit"] },
  "submission.checks_failed": {
    level: "warn",
    msg: "Submit's checks failed",
    fields: ["err"],
  },
  "feed.built": {
    level: "info",
    msg: "Feed built",
    fields: ["tool", "plugins", "ms", "bytes", "cached"],
  },
  "feed.size_warning": {
    level: "warn",
    msg: "Feed is near its size limit",
    fields: ["tool", "percent"],
  },
  "feed.plugin_skipped": {
    level: "warn",
    msg: "Plugin left out of a feed",
    fields: ["tool", "reason"],
  },
  "db.unavailable": { level: "error", msg: "Database unavailable", fields: ["err"] },
  "log.level_invalid": {
    level: "warn",
    msg: "LOG_LEVEL isn't one of debug, info, warn or error: using info",
    fields: [],
  },
} as const satisfies Record<string, EventSpec>;

export type EventName = keyof typeof EVENTS;
