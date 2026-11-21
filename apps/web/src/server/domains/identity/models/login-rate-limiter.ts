// What sign-in counts (006, 105): the limits themselves are counted in the database (109,
// `server/rate-limit/`).

/**
 * Sign-in's limit (006): 5 attempts a minute per email, and per client IP when it can be trusted.
 * Changing a password, two-factor changes and `rmk login` count against it too (105, 107).
 */
export const LOGIN_LIMIT = { name: "login", max: 5, windowMs: 60_000 } as const;

/** One new set of backup codes per person every 30 seconds (105): a double click makes one set. */
export const BACKUP_CODES_LIMIT = { name: "backup-codes", max: 1, windowMs: 30_000 } as const;

/** The key the backup codes' limit counts for a person. */
export const backupCodesKey = (userId: string): string => `user:${userId}`;

/** The limiter keys for one attempt: the email, and the IP when it's known. */
export const loginRateLimitKeys = (email: string, ip: string | null): string[] => {
  return ip ? [`email:${email}`, `ip:${ip}`] : [`email:${email}`];
};
