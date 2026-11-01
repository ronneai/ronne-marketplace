import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type { DatabaseDialect } from "../db/url";
import { notify } from "../domains/notifications/services/notify";
import { activeRoots } from "../domains/notifications/services/recipients";
import { UPDATE_KEYS } from "../domains/settings/models/update-check";
import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { checkForUpdate, type UpdateFailure } from "./check-for-update";

/**
 * The upgrade check, stored (feature 140): asks `checkForUpdate`, keeps the answer in
 * `instance_settings`, and tells every active root once per version. The schedule and the lease
 * are the job's (jobs/update-check-job.ts); this knows neither.
 */
export { UPDATE_KEYS };

/** `RONNE_UPDATE_CHECK`: `off` (any case), `0` or `false` turn the check off. */
export const updateCheckOffByEnv = (value: string | undefined): boolean =>
  ["off", "0", "false"].includes((value ?? "").trim().toLowerCase());

export type UpdateCheckDeps = {
  db: Kysely<Database>;
  dialect: DatabaseDialect;
  now?: () => Date;
  fetch: typeof fetch;
  /** The running version. */
  current: string;
  /** `RONNE_UPDATE_CHECK` as given. */
  env?: string;
};

export type UpdateCheckOutcome =
  | { status: "off"; by: "environment" | "switch" }
  | { status: "failed"; reason: UpdateFailure }
  | { status: "checked"; latest: string; newer: boolean; notified: number };

/** Whether root's switch is on: on until it was turned off. */
export const switchIsOn = async (deps: Pick<UpdateCheckDeps, "db" | "dialect">) =>
  (await kyselySettingsRepository(deps.db, deps.dialect).get(UPDATE_KEYS.enabled))?.value !==
  "false";

export const runUpdateCheck = async (deps: UpdateCheckDeps): Promise<UpdateCheckOutcome> => {
  if (updateCheckOffByEnv(deps.env)) return { status: "off", by: "environment" };
  if (!(await switchIsOn(deps))) return { status: "off", by: "switch" };
  const at = (deps.now ?? (() => new Date()))();
  const result = await checkForUpdate({ fetch: deps.fetch, current: deps.current });
  const { db, dialect } = deps;
  if (!result.ok) {
    // The last good answer stays; only when and why are replaced.
    const repo = kyselySettingsRepository(db, dialect);
    await repo.set(UPDATE_KEYS.at, at.toISOString(), null, at);
    await repo.set(UPDATE_KEYS.error, result.reason, null, at);
    return { status: "failed", reason: result.reason };
  }
  return db.transaction().execute(async (trx) => {
    const repo = kyselySettingsRepository(trx, dialect);
    await repo.set(UPDATE_KEYS.at, at.toISOString(), null, at);
    await repo.set(UPDATE_KEYS.latest, result.latest, null, at);
    await repo.set(UPDATE_KEYS.url, result.url, null, at);
    await repo.set(UPDATE_KEYS.error, "", null, at);
    let notified = 0;
    const announced = (await repo.get(UPDATE_KEYS.notified))?.value;
    if (result.newer && announced !== result.latest) {
      notified = await notify(
        trx,
        dialect,
        {
          recipients: await activeRoots(trx),
          kind: "instance.update_available",
          actorId: null,
          subject: { type: "instance", id: result.latest },
          params: { version: result.latest, current: deps.current },
        },
        at,
      );
      await repo.set(UPDATE_KEYS.notified, result.latest, null, at);
    }
    return { status: "checked", latest: result.latest, newer: result.newer, notified } as const;
  });
};
