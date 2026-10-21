import { cookies } from "next/headers";
import { notice } from "@/server/domains/settings/actions/settings";
import type { Notice } from "@/server/domains/settings/models/notice-policy";
import { isDismissed, NOTICE_COOKIE } from "./notice-cookie";

/**
 * The notice this person should see on the page being drawn (124), or null: nothing set, hidden,
 * an empty message, or the revision they dismissed. Read by the (app) layout on every request.
 */
export const visibleNotice = async (): Promise<Notice | null> => {
  const current = await notice();
  if (!current.shown || current.message === "") return null;
  const jar = await cookies();
  return isDismissed(current.revision, jar.get(NOTICE_COOKIE)?.value) ? null : current;
};
