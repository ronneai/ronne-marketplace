import { redirect } from "next/navigation";
import { cache } from "react";
import { requestHeaders } from "@/server/http/request-headers";
import { SECURITY_PATH, twoFactorHold } from "@/server/http/two-factor-hold";

/**
 * Sends someone root requires to use two-factor, who hasn't set it up, to `/account/security`
 * (feature 105). Every page in the app frame calls it first, before reading anything: the (app)
 * layout's `loadShell` checks too, but Next.js doesn't render a shared layout again on client-side
 * navigation, so a click from `/account/security` would otherwise open the next page. A guard test
 * (`hold.test.ts`) checks every page calls it. Once per request (`cache`).
 */
export const holdPage = cache(async (): Promise<void> => {
  if (await twoFactorHold(await requestHeaders())) redirect(SECURITY_PATH);
});
