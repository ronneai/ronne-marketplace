import { retryOnDeadlock } from "../../../db/locks";
import { requirePermission } from "../../identity/models/permissions";
import { PasswordResetUnavailableError } from "../exceptions/errors";
import {
  PASSWORD_RESET_KEYS,
  type PasswordResetPolicy,
  type PasswordResetReadiness,
  passwordResetBlockers,
  passwordResetPolicyFromRow,
} from "../models/password-reset-policy";
import type { SettingsRepository } from "../repositories/settings-repository";
import type { SettingsActor, SettingsDeps } from "./settings";

/** The setting as stored: no permission check, as the forgot-password pages read it. */
export const passwordResetPolicy = async (repo: SettingsRepository): Promise<PasswordResetPolicy> =>
  passwordResetPolicyFromRow((await repo.get(PASSWORD_RESET_KEYS.enabled))?.value);

/** The setting on the Authentication tab (194): root only. */
export const passwordResetSettings = async (
  deps: SettingsDeps,
  actor: SettingsActor,
): Promise<PasswordResetPolicy> => {
  requirePermission(actor.user, "settings.manage");
  return passwordResetPolicy(deps.repo);
};

/**
 * Root turns reset by email on or off (194). It turns on only while `readiness` holds: email set
 * up, its last test or send worked, and the instance contact set. `readiness` is read inside this
 * transaction, through its `repo`, and holds the contact's row (189's `lockedMailReadiness`), so a
 * save that clears the contact at the same moment either waits and then turns the setting off, or
 * makes this one refused. Off always saves. The write is a compare-and-set, so of two saves at
 * once only one changes the setting and is audited, as `settings.password_reset_changed` with the
 * old and new value.
 */
export const setPasswordResetPolicy = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  input: { enabled?: unknown },
  readiness: (repo: SettingsRepository) => Promise<PasswordResetReadiness>,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const enabled = input.enabled === true || input.enabled === "on";
  const at = (deps.now ?? (() => new Date()))();
  // Saves at once may still deadlock on MySQL and MariaDB (the first insert's key): tried again.
  return retryOnDeadlock(() =>
    deps.repo.transaction(async (repo) => {
      const stored = (await repo.get(PASSWORD_RESET_KEYS.enabled))?.value ?? null;
      const from = passwordResetPolicyFromRow(stored);
      if (from.enabled === enabled) return { changed: false };
      if (enabled) {
        const [blocker] = passwordResetBlockers(await readiness(repo));
        if (blocker) throw new PasswordResetUnavailableError(blocker);
      }
      const by = actor.user?.id ?? null;
      const value = enabled ? "on" : "off";
      if (!(await repo.compareAndSet(PASSWORD_RESET_KEYS.enabled, stored, value, by, at)))
        return { changed: false };
      await repo.recordAudit(
        {
          actorId: by,
          action: "settings.password_reset_changed",
          target: { type: "instance" },
          metadata: { from: from.enabled, to: enabled },
          ipAddress: actor.ip,
        },
        at,
      );
      return { changed: true };
    }),
  );
};

/**
 * With no instance contact, reset by email turns off (194), in the email setup's own transaction:
 * every notice must say whom to tell. It runs on every save that leaves the contact empty, so a
 * setting left on without one is turned off by the next save too. A compare-and-set from `on`,
 * which waits for a turn-on still in progress and then sees it. Audited with the reason only when
 * it changed something.
 */
export const turnOffPasswordResetForContact = async (
  repo: SettingsRepository,
  by: string | null,
  ip: string | null,
  at: Date,
): Promise<boolean> => {
  if (!(await repo.compareAndSet(PASSWORD_RESET_KEYS.enabled, "on", "off", by, at))) return false;
  await repo.recordAudit(
    {
      actorId: by,
      action: "settings.password_reset_changed",
      target: { type: "instance" },
      metadata: { from: true, to: false, reason: "contact_cleared" },
      ipAddress: ip,
    },
    at,
  );
  return true;
};
