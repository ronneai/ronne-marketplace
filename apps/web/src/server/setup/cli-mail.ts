import { loadConfig } from "../config";
import type { Db } from "../db/create-db";
import type { DatabaseDialect } from "../db/url";
import { parseMailRelays } from "../domains/mail/models/mail-settings";
import type { MailTransport } from "../domains/mail/models/message";
import { resolveAll } from "../domains/mail/repositories/transports/smtp";
import { onMailQueued, setNoticeConfig } from "../domains/mail/services/notices";
import { deliverDue } from "../domains/mail/services/outbox";

/** How long a terminal command waits for its notices to go (189). */
export const SEND_WAIT_MS = 30_000;

const waits = globalThis as typeof globalThis & { __ronneNoticesStillSending?: boolean };

/**
 * Whether a notice was still being sent when the command stopped waiting: the script then exits
 * at once, so a server that keeps the connection open can't hold the terminal.
 */
export const noticesStillSending = (): boolean => waits.__ronneNoticesStillSending === true;

/**
 * Runs a terminal command that may queue security notices (189): the notices read this
 * instance's settings file (`appDir`'s, not the folder the command was started from), and once
 * the command's change has committed they are sent before it exits, so they go out with
 * RONNE_JOBS off too. A try that fails follows the outbox's rules (retried by the server's
 * scheduler, or failed for good), and one still going after `waitMs` is left to the server.
 */
export const withNoticesSent = async <T>(
  db: Db,
  dialect: DatabaseDialect,
  appDir: string,
  run: () => Promise<T>,
  /** Sends in place of the transport the setup builds: for tests. */
  send?: MailTransport["send"],
  /** How long the command waits for its notices before it exits anyway. */
  waitMs = SEND_WAIT_MS,
): Promise<T> => {
  const config = loadConfig({ appDir });
  setNoticeConfig({ authSecret: config.authSecret, publicUrl: config.publicUrl });
  const ids: string[] = [];
  onMailQueued((queued) => ids.push(...queued));
  try {
    const result = await run();
    if (ids.length > 0) {
      let timer: NodeJS.Timeout | undefined;
      const sending = deliverDue(
        { db, dialect },
        {
          authSecret: config.authSecret,
          allowedHosts: parseMailRelays(config.mailHosts),
          resolve: resolveAll,
        },
        { ids, send },
      ).catch(() => undefined);
      // A server that hangs doesn't hold the terminal: past the wait, the command exits, and the
      // row's claim runs out for the server's outbox to take it again.
      const finished = await Promise.race([
        sending.then(() => true),
        new Promise<false>((done) => {
          timer = setTimeout(() => done(false), waitMs);
        }),
      ]);
      clearTimeout(timer);
      if (!finished) waits.__ronneNoticesStillSending = true;
    }
    return result;
  } finally {
    onMailQueued(undefined);
    setNoticeConfig(undefined);
  }
};
