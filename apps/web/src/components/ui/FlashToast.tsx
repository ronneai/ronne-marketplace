import { cookies } from "next/headers";
import { FLASH_COOKIE, parseFlash } from "@/i18n/flash";
import { FlashToastClient } from "./FlashToastClient";

/**
 * In the root layout (138): if the last server action left a flash, shows it. The cookie is read
 * and checked here, on the server, so nothing but a valid message reaches the browser.
 */
export const FlashToast = async () => {
  const flash = parseFlash((await cookies()).get(FLASH_COOKIE)?.value);
  return flash ? <FlashToastClient flash={flash} /> : null;
};
