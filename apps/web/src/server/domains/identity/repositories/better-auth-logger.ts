import { logger } from "../../../log";

const log = logger.child({ domain: "identity" });

/**
 * Better Auth's own logs, through ours (feature 100), at the matching level, filtered by LOG_LEVEL.
 * Its message is kept (redacted like any line); of its other arguments only an error is, as `err`:
 * the rest could be a user's record, and a line holds no email or name.
 */
export const betterAuthLogger = {
  level: "debug" as const,
  log: (level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) => {
    const err = args.find((arg) => arg instanceof Error);
    log[level](String(message), { source: "better-auth", ...(err ? { err } : {}) });
  },
};
