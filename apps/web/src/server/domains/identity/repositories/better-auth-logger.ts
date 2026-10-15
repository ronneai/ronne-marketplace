import { logger } from "../../../log";

const log = logger.child({ domain: "identity" });

/**
 * Better Auth's own logs, through ours (feature 100), at the matching level, filtered by LOG_LEVEL.
 * `msg` is fixed; its message goes in `detail` (redacted like any value: it can hold a request's
 * Origin). Of its other arguments only an error is kept, as `err`: the rest could be a user's
 * record, and a line holds no email or name.
 *
 * `info`, not `debug`: at `debug`, `warn` or `error` Better Auth's router also prints each API error
 * through its own console logger, a plain-text line outside ours. Its debug lines are dropped.
 */
export const betterAuthLogger = {
  level: "info" as const,
  log: (level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) => {
    const err = args.find((arg) => arg instanceof Error);
    log[level]("Better Auth", {
      source: "better-auth",
      detail: String(message),
      ...(err ? { err } : {}),
    });
  },
};
