import { redirect } from "next/navigation";
import { cache } from "react";
import { PATH_HEADER, safeNextPath } from "@/server/domains/identity/models/route-guard";
import { PASSWORD_PATH, passwordChangeHold } from "@/server/http/password-change-hold";
import { requestHeaders } from "@/server/http/request-headers";
import { SECURITY_PATH, twoFactorHold } from "@/server/http/two-factor-hold";

/** Pages a held person comes back to once two-factor is on: `/device` keeps its code (107). */
const RETURN_AFTER_HOLD = ["/device"];

const pathOnly = (path: string) => path.split("?")[0] ?? "";

/**
 * Sends someone who must replace their password (128) to `/account/password`, and someone root
 * requires to use two-factor, who hasn't set it up, to `/account/security` (feature 105). Every
 * page in the app frame calls it first, before reading anything: the (app) layout's `loadShell`
 * checks too, but Next.js doesn't render a shared layout again on client-side navigation, so a
 * click from `/account/security` would otherwise open the next page. A guard test (`hold.test.ts`)
 * checks every page calls it. The password comes first: a person who must do both changes it and
 * is then taken to set up two-factor. Once per request (`cache`).
 */
export const holdPage = cache(async (): Promise<void> => {
  const headers = await requestHeaders();
  const path = safeNextPath(headers.get(PATH_HEADER));
  if (await passwordChangeHold(headers)) {
    // The change page itself is open to them, and so is nothing else; they return to the page they asked for.
    if (pathOnly(path) === PASSWORD_PATH) return;
    redirect(path === "/" ? PASSWORD_PATH : `${PASSWORD_PATH}?next=${encodeURIComponent(path)}`);
  }
  if (!(await twoFactorHold(headers))) return;
  const back = RETURN_AFTER_HOLD.includes(pathOnly(path));
  redirect(back ? `${SECURITY_PATH}?next=${encodeURIComponent(path)}` : SECURITY_PATH);
});
