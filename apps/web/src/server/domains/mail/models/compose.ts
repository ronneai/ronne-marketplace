import MailComposer from "nodemailer/lib/mail-composer";
import { type MailMessage, messageProblem } from "./message";

/** The message can't be composed: a field that isn't safe to send (`messageProblem`). */
export class UnsafeMessageError extends Error {
  override readonly name = "UnsafeMessageError";
}

/**
 * The one MIME message every transport sends (189): nodemailer's composer, so headers are encoded
 * and lines folded as RFC 5322 asks. It reads no file and fetches no URL, whatever a body says,
 * and every message says it was sent by a program (`Auto-Submitted`), so auto-replies stay quiet.
 */
export const composeMime = async (message: MailMessage): Promise<Buffer> => {
  const problem = messageProblem(message);
  if (problem) throw new UnsafeMessageError(problem);
  const composer = new MailComposer({
    from: message.from.name
      ? { name: message.from.name, address: message.from.address }
      : message.from.address,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: { "Auto-Submitted": "auto-generated" },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return composer.compile().build();
};
