import { loadConfig } from "../../../config";
import type { Db } from "../../../db/create-db";
import type { DatabaseDialect } from "../../../db/url";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { languagePolicy } from "../../settings/services/settings";
import { isMailTransportKind } from "../models/mail-settings";
import { instanceHost } from "./mail-admin";
import { storedMailSetup } from "./mail-setup";
import { type QueueResult, queueMail } from "./outbox";
import { type MailNotice, mailLocale, renderMail } from "./templates";

/** What the notices need from the server: the secret that seals bodies, and the public address. */
export type NoticeConfig = { authSecret: string | undefined; publicUrl: string | undefined };

const overrides = globalThis as typeof globalThis & { __ronneNoticeConfig?: NoticeConfig };

/**
 * The config a command run from the terminal hands over (189): its settings file, which needn't
 * be in the folder the command was started from. Undefined goes back to the server's own.
 */
export const setNoticeConfig = (config: NoticeConfig | undefined): void => {
  overrides.__ronneNoticeConfig = config;
};

const serverConfig = (): NoticeConfig => {
  if (overrides.__ronneNoticeConfig) return overrides.__ronneNoticeConfig;
  const config = loadConfig();
  return { authSecret: config.authSecret, publicUrl: config.publicUrl };
};

/**
 * Queues one security notice to the account's own address (189), in the person's language, with
 * the instance contact, in the caller's transaction: `db` is the transaction of the change, so the
 * notice exists if and only if the change does. Nothing is queued while email isn't set up, and
 * the person can't turn notices off (NIST SP 800-63B-4 §4.6). The address is read here, at the
 * change, from the account: never one the request typed.
 */
export const queueSecurityNotice = async (
  db: Db,
  dialect: DatabaseDialect,
  notice: { userId: string; kind: MailNotice; provider?: string },
  at: Date,
  config: NoticeConfig = serverConfig(),
): Promise<QueueResult | { queued: false; reason: "no_account" | "no_secret" }> => {
  const settings = kyselySettingsRepository(db, dialect);
  const setup = await storedMailSetup(settings);
  if (!isMailTransportKind(setup.transport)) return { queued: false, reason: "not_set_up" };
  if (!config.authSecret) return { queued: false, reason: "no_secret" };
  const account = await db
    .selectFrom("user")
    .select(["email", "locale"])
    .where("id", "=", notice.userId)
    .executeTakeFirst();
  if (!account) return { queued: false, reason: "no_account" };
  const locale = mailLocale(account.locale, await languagePolicy({ repo: settings }));
  const mail = await renderMail(notice.kind, locale, {
    host: instanceHost(config.publicUrl),
    contact: setup.contact,
    at,
    ...(notice.provider ? { provider: notice.provider } : {}),
  });
  return queueMail(
    db,
    dialect,
    config.authSecret,
    { template: notice.kind, locale, to: account.email, userId: notice.userId, ...mail },
    at,
  );
};

// Who hears about rows queued once their transaction has committed: the scheduler, which sends
// them at once. Kept here, so the domains that queue never import the jobs.
const listeners = globalThis as typeof globalThis & {
  __ronneMailQueued?: (ids: readonly string[]) => void;
};

/** Sets what runs once queued rows have committed (the scheduler's kick). */
export const onMailQueued = (listener: ((ids: readonly string[]) => void) | undefined): void => {
  listeners.__ronneMailQueued = listener;
};

/** Says that these rows have committed. With no listener (a CLI command), the scheduler sends them. */
export const mailQueued = (ids: readonly string[]): void => {
  if (ids.length > 0) listeners.__ronneMailQueued?.(ids);
};
