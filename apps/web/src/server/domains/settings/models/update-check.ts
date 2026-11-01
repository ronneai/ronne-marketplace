import { compareNewestFirst } from "@ronneai/core";

/**
 * The upgrade check's settings (feature 140): rows of `instance_settings`, no migration. The check
 * itself is in `server/updates`; this is what Settings › Updates reads and root's switch writes.
 */
export const UPDATE_KEYS = {
  enabled: "update_check_enabled",
  at: "update_check_at",
  latest: "update_check_latest",
  url: "update_check_url",
  error: "update_check_error",
  /** The last version announced, so a version is announced once. */
  notified: "update_check_notified",
} as const;

/** Why the last check failed, as stored (the tab words each in the reader's language). */
export const UPDATE_FAILURES = ["unreachable", "rate_limited", "bad_answer"] as const;
export type UpdateFailure = (typeof UPDATE_FAILURES)[number];

export type UpdateCheckSettings = {
  /** Root's switch; on until it was turned off. */
  enabled: boolean;
  /** The latest release seen, without the `v`, and its notes' page; null before the first answer. */
  latest: string | null;
  url: string | null;
  /** When the last check ran (answered or failed); null before the first. */
  checkedAt: Date | null;
  /** Why the last check failed; null when it answered. */
  error: UpdateFailure | null;
};

export const isUpdateFailure = (value: string): value is UpdateFailure =>
  (UPDATE_FAILURES as readonly string[]).includes(value);

/** A "Check now" is allowed once a minute at most. */
export const CHECK_NOW_EVERY_MS = 60 * 1000;

/** Whether the last check (scheduled or asked) is too recent for another "Check now". */
export const checkedTooRecently = (checkedAt: Date | null, now: Date): boolean =>
  checkedAt !== null && now.getTime() - checkedAt.getTime() < CHECK_NOW_EVERY_MS;

/** Whether `latest` is a stable release newer than the running `current` (the sidebar's mark, the tab). */
export const isNewerRelease = (latest: string | null, current: string): boolean =>
  latest !== null && !latest.includes("-") && compareNewestFirst(latest, current) < 0;
