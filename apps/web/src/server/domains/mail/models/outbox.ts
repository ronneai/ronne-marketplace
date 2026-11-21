import { createHmac, hkdfSync } from "node:crypto";
import { open, type SealPurpose, seal } from "../../../crypto/sealed";

/** An outbox row's status (189). */
export type OutboxStatus = "queued" | "sending" | "sent" | "failed" | "dropped";

/** At most this many tries in all, then the message fails for good. */
export const MAX_ATTEMPTS = 8;

/** How long a send may hold a row: past it, another run may take the row again. */
export const CLAIM_MS = 2 * 60_000;

/** At most this many messages to one address in an hour, every template together. */
export const PER_ADDRESS_PER_HOUR = 10;

/** How many rows one run of the job takes. */
export const OUTBOX_BATCH = 50;

const MINUTE = 60_000;

// After the first try: 1, 5, 15 and 60 minutes, then every 3 hours.
const SCHEDULE_MS = [1, 5, 15, 60].map((m) => m * MINUTE);
const THEN_MS = 3 * 60 * MINUTE;

/** How long to wait before the next try, once `attempts` tries have failed (1 or more). */
export const retryDelayMs = (attempts: number): number =>
  SCHEDULE_MS[Math.max(0, attempts - 1)] ?? THEN_MS;

/** The parts of a message the outbox seals: everything that names the person or says anything. */
export type OutboxBody = { to: string; subject: string; text: string; html: string };

const BODY_INFO = "ronne:mail-outbox:v1";
const bodyPurpose = (id: string): SealPurpose => ({ info: BODY_INFO, boundTo: id });

/** The body sealed for one row: bound to its ID, so it opens on no other row. */
export const sealBody = (authSecret: string, id: string, body: OutboxBody): string =>
  seal(authSecret, bodyPurpose(id), JSON.stringify(body));

/** The body, or null when this AUTH_SECRET can't open it or it isn't one. */
export const openBody = (authSecret: string, id: string, stored: string): OutboxBody | null => {
  try {
    const parsed = JSON.parse(open(authSecret, bodyPurpose(id), stored)) as Partial<OutboxBody>;
    return typeof parsed.to === "string" &&
      typeof parsed.subject === "string" &&
      typeof parsed.text === "string" &&
      typeof parsed.html === "string"
      ? (parsed as OutboxBody)
      : null;
  } catch {
    return null;
  }
};

/** The purpose a queued body is sealed with, for `rotate-secret`. */
export const outboxBodyPurpose = bodyPurpose;

const RECIPIENT_INFO = "ronne mail recipients v1";
const keys = new Map<string, Buffer>();

/**
 * The recipient as the outbox keeps it: HMAC-SHA256 of the lowercased address, under a key
 * HKDF-SHA256 derives from AUTH_SECRET. It counts the messages to one address without keeping it.
 */
export const recipientHmac = (authSecret: string, address: string): string => {
  let key = keys.get(authSecret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", authSecret, Buffer.alloc(0), RECIPIENT_INFO, 32));
    if (keys.size >= 8) keys.clear();
    keys.set(authSecret, key);
  }
  return createHmac("sha256", key).update(address.trim().toLowerCase(), "utf8").digest("hex");
};
