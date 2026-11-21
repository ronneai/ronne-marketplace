import { composeMime } from "../../models/compose";
import type { MailTransport, SendResult } from "../../models/message";
import { cleanDetail, type Fetch, post, resultOf, USER_AGENT } from "./http";

/** An id from a JSON answer's field, when it holds a string. */
const idFrom = async (response: Response, field: string): Promise<string | undefined> =>
  response
    .json()
    .then((json: Record<string, unknown>) =>
      typeof json[field] === "string" ? (json[field] as string) : undefined,
    )
    .catch(() => undefined);

const sent = (providerId: string | undefined): SendResult =>
  providerId ? { status: "sent", providerId } : { status: "sent" };

// A domain as Mailgun takes it in its URL path: a host name, nothing to change the path.
const DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** Whether a value can be a Mailgun sending domain. */
export const isMailDomain = (value: string): boolean => value.length <= 253 && DOMAIN.test(value);

export type MailgunConfig = { apiKey: string; domain: string; region: "us" | "eu" };

/**
 * Mailgun's `POST /v3/<domain>/messages.mime` (189): the MIME message as the `message` file and
 * the recipient as `to`, basic auth `api:<key>`, on `api.mailgun.net`, or `api.eu.mailgun.net` for
 * a domain in the EU region.
 */
export const mailgunTransport = (
  config: MailgunConfig,
  deps: { fetch?: Fetch } = {},
): MailTransport => ({
  kind: "mailgun",
  send: async (message) => {
    const secrets = [config.apiKey, `api:${config.apiKey}`];
    if (!isMailDomain(config.domain))
      return { status: "failed", reason: "config", detail: "not a domain" };
    if (config.region !== "us" && config.region !== "eu")
      return { status: "failed", reason: "config", detail: "not a Mailgun region: us or eu" };
    const host = config.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
    const form = new FormData();
    form.append("to", message.to);
    form.append(
      "message",
      new Blob([new Uint8Array(await composeMime(message))], { type: "message/rfc822" }),
      "message.mime",
    );
    const answer = await post(
      deps.fetch ?? fetch,
      `https://${host}/v3/${config.domain}/messages.mime`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}`,
          "user-agent": USER_AGENT,
        },
        body: form,
      },
      secrets,
    );
    if ("result" in answer) return answer.result;
    const result = await resultOf(answer.response, secrets);
    return result.status === "sent" ? sent(await idFrom(answer.response, "id")) : result;
  },
});

export type PostmarkConfig = { serverToken: string };

// Postmark's codes for its own trouble (100 maintenance, 101 internal): worth another try. Its
// other codes come with 422 and are about the request, so they're for good.
const POSTMARK_RETRY = new Set([100, 101]);

/**
 * Postmark's `POST https://api.postmarkapp.com/email` (189): JSON fields filled from the same parts
 * as the MIME message (Postmark takes no raw message), header `X-Postmark-Server-Token`, stream
 * `outbound`, the `Auto-Submitted` header as the others carry.
 */
export const postmarkTransport = (
  config: PostmarkConfig,
  deps: { fetch?: Fetch } = {},
): MailTransport => ({
  kind: "postmark",
  send: async (message) => {
    const secrets = [config.serverToken];
    await composeMime(message); // The same checks as every transport, before anything is sent.
    const from = message.from.name
      ? `${JSON.stringify(message.from.name)} <${message.from.address}>`
      : message.from.address;
    const answer = await post(
      deps.fetch ?? fetch,
      "https://api.postmarkapp.com/email",
      {
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-postmark-server-token": config.serverToken,
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({
          From: from,
          To: message.to,
          ReplyTo: message.replyTo,
          Subject: message.subject,
          TextBody: message.text,
          HtmlBody: message.html,
          Headers: [{ Name: "Auto-Submitted", Value: "auto-generated" }],
          MessageStream: "outbound",
        }),
      },
      secrets,
    );
    if ("result" in answer) return answer.result;
    const { response } = answer;
    if (response.status === 422 || response.status >= 500) {
      const text = await response
        .clone()
        .text()
        .catch(() => "");
      const code = Number((/"ErrorCode"\s*:\s*(\d+)/.exec(text) ?? [])[1]);
      if (POSTMARK_RETRY.has(code))
        return { status: "retry", reason: "server", detail: cleanDetail(text, secrets) };
    }
    const result = await resultOf(response, secrets);
    return result.status === "sent" ? sent(await idFrom(response, "MessageID")) : result;
  },
});

export type ResendConfig = { apiKey: string };

/**
 * Resend's `POST https://api.resend.com/emails` (189): JSON fields filled from the same parts,
 * `Authorization: Bearer`, and `Idempotency-Key` set to the outbox row's ID, so a retry after a
 * lost answer never sends the message twice (Resend keeps the key 24 hours).
 */
export const resendTransport = (
  config: ResendConfig,
  deps: { fetch?: Fetch } = {},
): MailTransport => ({
  kind: "resend",
  send: async (message) => {
    const secrets = [config.apiKey];
    await composeMime(message);
    const from = message.from.name
      ? `${JSON.stringify(message.from.name)} <${message.from.address}>`
      : message.from.address;
    const answer = await post(
      deps.fetch ?? fetch,
      "https://api.resend.com/emails",
      {
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
          "user-agent": USER_AGENT,
          ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          reply_to: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: { "Auto-Submitted": "auto-generated" },
        }),
      },
      secrets,
    );
    if ("result" in answer) return answer.result;
    const { response } = answer;
    // Another try with the same key is still in progress: wait and try again.
    if (response.status === 409) {
      const text = await response
        .clone()
        .text()
        .catch(() => "");
      if (text.includes("concurrent_idempotent_requests"))
        return { status: "retry", reason: "server", detail: cleanDetail(text, secrets) };
    }
    const result = await resultOf(response, secrets);
    return result.status === "sent" ? sent(await idFrom(response, "id")) : result;
  },
});
