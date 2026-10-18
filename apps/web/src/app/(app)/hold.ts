import { redirect } from "next/navigation";
import { cache } from "react";
import { PATH_HEADER, safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { SECURITY_PATH, twoFactorHold } from "@/server/http/two-factor-hold";

/** Pages a held person comes back to once two-factor is on: `/device` keeps its code (107). */
const RETURN_AFTER_HOLD = ["/device"];

/**
 * Sends someone root requires to use two-factor, who hasn't set it up, to `/account/security`
 * (feature 105). Every page in the app frame calls it first, before reading anything: the (app)
 * layout's `loadShell` checks too, but Next.js doesn't render a shared layout again on client-side
 * navigation, so a click from `/account/security` would otherwise open the next page. A guard test
 * (`hold.test.ts`) checks every page calls it. Once per request (`cache`).
 */
export const holdPage = cache(async (): Promise<void> => {
  const headers = await requestHeaders();
  if (!(await twoFactorHold(headers))) return;
  const path = safeNextPath(headers.get(PATH_HEADER));
  const back = RETURN_AFTER_HOLD.includes(path.split("?")[0] ?? "");
  redirect(back ? `${SECURITY_PATH}?next=${encodeURIComponent(path)}` : SECURITY_PATH);
});
