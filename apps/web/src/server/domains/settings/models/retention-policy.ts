/**
 * How long personal data is kept (feature 102), in days, as root sets it:
 * - `ipDays`: client IP addresses in the audit log, sessions and device grants, and the email
 *   typed in a failed sign-in;
 * - `sessionsDays`: an expired session, and a device grant that is no longer pending;
 * - `feedbackDays`: feedback root marked handled (127), counted from when it was handled; new
 *   feedback is never purged.
 * 90 days each on a new instance, 365 for handled feedback. The purge runs by these; the settings
 * only hold them.
 */
export type RetentionPolicy = { ipDays: number; sessionsDays: number; feedbackDays: number };

export const RETENTION_IP_DAYS_KEY = "retention_ip_days";
export const RETENTION_SESSIONS_DAYS_KEY = "retention_sessions_days";
export const RETENTION_FEEDBACK_DAYS_KEY = "retention_feedback_days";

export const DEFAULT_RETENTION_DAYS = 90;
export const DEFAULT_FEEDBACK_RETENTION_DAYS = 365;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  ipDays: DEFAULT_RETENTION_DAYS,
  sessionsDays: DEFAULT_RETENTION_DAYS,
  feedbackDays: DEFAULT_FEEDBACK_RETENTION_DAYS,
};

/**
 * A number of days as root typed it, or null when it isn't a whole number in the range. Leading
 * zeros are allowed (a number field can submit `03650`); a sign, a decimal point or an exponent
 * isn't. Twenty digits at most, bounded for CodeQL (`codeql-regex.md`): more can't be in range
 * unless they're zeros, and that's nobody's input.
 */
export const retentionDaysFrom = (value: unknown): number | null => {
  const text =
    typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,20}$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_RETENTION_DAYS && n <= MAX_RETENTION_DAYS ? n : null;
};
