"use server";

import { revalidatePath } from "next/cache";
import { setNotice } from "@/server/domains/settings/actions/settings";
import { InvalidNoticeError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import { type NoticeFormState, noticeErrorCode } from "./types";

/**
 * Saves the instance notice (124). A refusal comes back as a code beside its field; revalidating
 * the layout is what makes the new notice show on every page at once.
 */
export const saveNotice = serverAction(
  async (_previous: NoticeFormState, form: FormData): Promise<NoticeFormState> => {
    try {
      const { changed } = await setNotice(await requestHeaders(), {
        message: form.get("message"),
        tone: form.get("tone"),
        shown: form.get("shown"),
      });
      revalidatePath("/", "layout");
      return { done: changed ? "saved" : "unchanged" };
    } catch (error) {
      if (error instanceof InvalidNoticeError)
        return { errors: { [error.field]: noticeErrorCode(error.field, error.problem) } };
      throw error;
    }
  },
);
