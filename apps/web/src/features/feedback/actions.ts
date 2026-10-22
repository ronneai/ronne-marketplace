"use server";

import { sendFeedback } from "@/server/domains/feedback/actions/feedback";
import {
  FeedbackLimitError,
  InvalidFeedbackError,
} from "@/server/domains/feedback/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { FeedbackFormState } from "./types";

/**
 * The Send feedback form's server action (feature 127). It works without JavaScript: a refused form
 * comes back with what was typed. The page is the path the form was opened on; the server keeps
 * only a path of the app, never a query. The message is never logged.
 */
export const sendFeedbackFromForm = serverAction(
  async (_previous: FeedbackFormState, form: FormData): Promise<FeedbackFormState> => {
    const kind = String(form.get("kind") ?? "");
    const message = String(form.get("message") ?? "");
    const includePage = form.get("includePage") === "on";
    try {
      await sendFeedback(await requestHeaders(), {
        kind,
        message,
        page: includePage ? String(form.get("page") ?? "") : null,
      });
      return { done: true };
    } catch (error) {
      if (error instanceof InvalidFeedbackError)
        return { error: error.problem, kind, message, includePage };
      if (error instanceof FeedbackLimitError)
        return { error: "rate_limited", kind, message, includePage };
      throw error;
    }
  },
);
