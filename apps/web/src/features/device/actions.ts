"use server";

import {
  decideMyDeviceCode,
  describeMyDeviceCode,
} from "@/server/domains/identity/actions/device-grants";
import { formatUserCode } from "@/server/domains/identity/models/device-grant";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { DeviceFormState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").slice(0, 64);

/**
 * `/device`'s one form (feature 107), as POSTs only: Continue looks the code up, then Approve or
 * Deny decides it. Opening the page never changes anything, so a link or a prefetch can't count a
 * wrong code or approve one. It works without JavaScript.
 */
export const deviceCodeFromForm = serverAction(
  async (previous: DeviceFormState, form: FormData): Promise<DeviceFormState> => {
    const intent = text(form, "intent");
    const typed = text(form, "code");
    const headers = await requestHeaders();
    if (intent === "approve" || intent === "deny") {
      const result = await decideMyDeviceCode(headers, typed, intent);
      if (result.ok)
        return {
          step: "done",
          decision: intent === "approve" ? "approved" : "denied",
          // The decided grant's own name, never what the browser sent back.
          name: result.name,
        };
      if (result.error === "rate_limited" && previous.step === "confirm")
        return { ...previous, error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds };
      return {
        step: "enter",
        typed: "",
        error: result.error,
        retryAfterSeconds: result.error === "rate_limited" ? result.retryAfterSeconds : undefined,
      };
    }
    const result = await describeMyDeviceCode(headers, typed);
    if (result.ok) {
      const { userCode, name, clientId, createdAt, requesterIp } = result.request;
      return {
        step: "confirm",
        request: {
          userCode: formatUserCode(userCode),
          name,
          clientId,
          requestedAt: createdAt.toISOString(),
          requesterIp,
        },
      };
    }
    return {
      step: "enter",
      typed,
      error: result.error,
      retryAfterSeconds: result.error === "rate_limited" ? result.retryAfterSeconds : undefined,
    };
  },
);
