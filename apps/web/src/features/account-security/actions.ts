"use server";

import {
  confirmTwoFactor,
  regenerateBackupCodes,
  startTwoFactor,
  turnOffTwoFactor,
} from "@/server/domains/identity/actions/two-factor";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import {
  type ConfirmState,
  type RegenerateState,
  type StartState,
  secretGroups,
  type TurnOffState,
} from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/**
 * Two-factor on your own account (feature 105). Better Auth replaces the session when it's turned
 * on or off; its new cookie is set by the `nextCookies` plugin in these actions.
 */
export const startFromForm = serverAction(
  async (_previous: StartState, form: FormData): Promise<StartState> => {
    const result = await startTwoFactor(await requestHeaders(), {
      password: text(form, "password"),
      startOver: form.get("startOver") === "on",
    });
    if (!result.ok) return { error: result.error };
    return {
      setup: {
        uri: result.uri,
        qrSvg: result.qrSvg,
        secret: secretGroups(result.uri),
        backupCodes: result.backupCodes,
      },
    };
  },
);

export const confirmFromForm = serverAction(
  async (_previous: ConfirmState, form: FormData): Promise<ConfirmState> => {
    const result = await confirmTwoFactor(await requestHeaders(), {
      code: text(form, "code"),
      uri: text(form, "uri"),
    });
    return result.ok ? { done: true } : { error: result.error };
  },
);

export const regenerateFromForm = serverAction(
  async (_previous: RegenerateState, form: FormData): Promise<RegenerateState> => {
    const result = await regenerateBackupCodes(await requestHeaders(), {
      password: text(form, "password"),
    });
    return result.ok ? { backupCodes: result.backupCodes } : { error: result.error };
  },
);

export const turnOffFromForm = serverAction(
  async (_previous: TurnOffState, form: FormData): Promise<TurnOffState> => {
    const result = await turnOffTwoFactor(await requestHeaders(), {
      password: text(form, "password"),
      code: text(form, "code"),
    });
    return result.ok ? { done: true } : { error: result.error };
  },
);
