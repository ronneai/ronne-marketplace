import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import {
  FLASH_COOKIE,
  FLASH_MAX_AGE,
  FLASH_MAX_LENGTH,
  type FlashKey,
  type FlashKind,
  type FlashParams,
  serializeFlash,
} from "@/i18n/flash";

/**
 * Says something on the page a server action is about to redirect to (feature 138): a toast
 * ("Draft deleted") in the person's own language. Call it before `redirect()`. It sets a cookie
 * for 30 seconds with the message's key and parameters; the next page shows it once and removes
 * it. Errors of a form's fields and secrets the person must copy are not for this.
 */
export const flashToast = async (
  key: FlashKey,
  params: FlashParams = {},
  kind: FlashKind = "ok",
): Promise<void> => {
  const value = serializeFlash({ id: randomUUID(), kind, key, params });
  // A message too long for a cookie is a mistake in the code, found the first time it runs.
  if (value.length > FLASH_MAX_LENGTH) throw new RangeError(`The flash "${key}" is too long`);
  (await cookies()).set(FLASH_COOKIE, value, {
    path: "/",
    maxAge: FLASH_MAX_AGE,
    sameSite: "lax",
    // The browser removes it once shown, so the page's script has to reach it.
    httpOnly: false,
  });
};
