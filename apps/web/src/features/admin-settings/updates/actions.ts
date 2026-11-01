"use server";

import { revalidatePath } from "next/cache";
import { checkUpdateNow, setUpdateCheck } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { UpdatesFormState } from "./types";

/** Root's switch for the upgrade check (140). A checkbox that is missing is off. */
export const saveUpdateCheck = serverAction(
  async (_previous: UpdatesFormState, form: FormData): Promise<UpdatesFormState> => {
    const { changed } = await setUpdateCheck(await requestHeaders(), form.get("enabled") === "on");
    revalidatePath("/admin/settings");
    return { done: changed ? "saved" : "unchanged" };
  },
);

/** "Check now" (140): once a minute at most; the layout is revalidated for the sidebar's mark. */
export const checkNow = serverAction(
  async (_previous: UpdatesFormState): Promise<UpdatesFormState> => {
    const outcome = await checkUpdateNow(await requestHeaders());
    revalidatePath("/", "layout");
    if (outcome.status === "too_soon") return { done: "too_soon" };
    if (outcome.status === "off")
      return { done: outcome.by === "environment" ? "off_by_environment" : "off_by_switch" };
    if (outcome.status === "failed") return { done: "failed" };
    return { done: outcome.newer ? "newer" : "checked" };
  },
);
