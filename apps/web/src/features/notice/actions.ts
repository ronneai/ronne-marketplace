"use server";

import { cookies } from "next/headers";
import { notice } from "@/server/domains/settings/actions/settings";
import { serverAction } from "@/server/http/server-action";
import { NOTICE_COOKIE, noticeCookieOptions, parseRevision } from "./notice-cookie";

/**
 * Dismisses the notice for this browser (124): the cookie takes the revision on the form, never
 * more than the current one, so a forged number can't hide a notice root writes later. A form post,
 * so it works without JavaScript; Next draws the same page again without the notice. It runs for
 * someone held for two-factor too (`whileHeld`): the notice is on that page as well.
 */
export const dismissNotice = serverAction(
  async (form: FormData): Promise<void> => {
    const revision = parseRevision(form.get("revision"));
    if (revision === null) return;
    const current = await notice();
    (await cookies()).set(
      NOTICE_COOKIE,
      String(Math.min(revision, current.revision)),
      noticeCookieOptions,
    );
  },
  { whileHeld: true, whilePasswordHeld: true },
);
