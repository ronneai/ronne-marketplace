import { loadConfig } from "../../../config";
import type { Db } from "../../../db/create-db";
import type { DatabaseDialect } from "../../../db/url";
import { instanceHost } from "../../mail/services/mail-admin";
import { storedMailSetup } from "../../mail/services/mail-setup";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { clientIp } from "../models/client-ip";
import type { AppAuth } from "../repositories/auth-instance";
import { getAppAuth } from "../repositories/auth-instance";
import { kyselyApprovalRepository } from "../repositories/kysely-approval-repository";
import * as service from "../services/approval";
import { getCurrentUser } from "./session";

/** The approval service's dependencies on a database (190): the app's, or the job's. */
export const approvalDeps = (
  db: Db,
  dialect: DatabaseDialect,
  context: { authSecret: string; publicUrl?: string; now?: () => Date },
): service.ApprovalDeps => ({
  repo: kyselyApprovalRepository(db, dialect, context.authSecret),
  mail: async () => ({
    host: instanceHost(context.publicUrl),
    contact: (await storedMailSetup(kyselySettingsRepository(db, dialect))).contact,
  }),
  ...(context.now ? { now: context.now } : {}),
});

const serverContext = () => {
  const config = loadConfig();
  if (!config.authSecret) throw new Error("AUTH_SECRET isn't set");
  return { authSecret: config.authSecret, publicUrl: config.publicUrl };
};

const answerer = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  if (!user) throw new Error("Not signed in");
  return { user, ip: clientIp(headers, app.trustProxy) };
};

/** **Approve** on the user page (190). */
export const approveAccount = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) =>
  service.approveAccount(
    approvalDeps(app.db, app.dialect, serverContext()),
    await answerer(headers, app),
    userId,
  );

/** **Decline** on the user page (190). */
export const declineAccount = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) =>
  service.declineAccount(
    approvalDeps(app.db, app.dialect, serverContext()),
    await answerer(headers, app),
    userId,
  );
