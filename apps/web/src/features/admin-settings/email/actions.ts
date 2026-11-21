"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import {
  adminSaveMailSetup,
  adminSendTestEmail,
  adminStopSending,
} from "@/server/domains/mail/actions/mail";
import {
  InvalidMailSetupError,
  MailError,
  MailHostInternalError,
  MailHostUnresolvedError,
  MailPlainSmtpError,
} from "@/server/domains/mail/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { EmailFormState, StopSendingState, TestEmailState } from "./types";

const SETTINGS = "/admin/settings";

/** The form field an error is about, so the form can point at it. */
const fieldOf = (error: MailError): string | undefined => {
  if (error instanceof InvalidMailSetupError) return error.field;
  if (
    error instanceof MailHostInternalError ||
    error instanceof MailHostUnresolvedError ||
    error instanceof MailPlainSmtpError
  )
    return "smtpHost";
  return undefined;
};

/** Saves the email setup (189). The secret travels only in this request, and only when typed. */
export const saveEmail = serverAction(
  async (_previous: EmailFormState, form: FormData): Promise<EmailFormState> => {
    const get = (name: string) => form.get(name) ?? "";
    try {
      const { changed } = await adminSaveMailSetup(await requestHeaders(), {
        transport: get("transport"),
        fromAddress: get("fromAddress"),
        fromName: get("fromName"),
        replyTo: get("replyTo"),
        contact: get("contact"),
        smtpHost: get("smtpHost"),
        smtpPort: get("smtpPort"),
        smtpTls: get("smtpTls"),
        smtpUser: get("smtpUser"),
        region: get("region"),
        domain: get("domain"),
        sesAccessKeyId: get("sesAccessKeyId"),
        secret: get("secret"),
      });
      revalidatePath(SETTINGS);
      return { done: changed ? "saved" : "unchanged" };
    } catch (error) {
      if (error instanceof MailError)
        return { error: await errorText(error), field: fieldOf(error) };
      throw error;
    }
  },
);

/** Root's test email, to their own address (189). */
export const sendTestEmail = serverAction(
  async (_previous: TestEmailState, _form: FormData): Promise<TestEmailState> => {
    const headers = await requestHeaders();
    try {
      const result = await adminSendTestEmail(headers);
      revalidatePath(SETTINGS);
      return { result, to: (await getCurrentUser(headers))?.email };
    } catch (error) {
      if (error instanceof MailError) return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Stop sending (189): the transport cleared, the waiting messages dropped. */
export const stopSending = serverAction(
  async (_previous: StopSendingState, _form: FormData): Promise<StopSendingState> => {
    const { dropped } = await adminStopSending(await requestHeaders());
    revalidatePath(SETTINGS);
    return { done: "stopped", dropped };
  },
);
