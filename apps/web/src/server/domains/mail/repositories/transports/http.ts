import type { MailFailureReason, SendResult } from "../../models/message";

/** `fetch`, as the transports call it: injected in tests, the global one otherwise. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** How long a web API may take to answer before the try counts as timed out. */
export const HTTP_TIMEOUT_MS = 30_000;

/** The longest wait a `Retry-After` may ask for; past it, the outbox's own schedule applies. */
const MAX_WAIT_SECONDS = 6 * 60 * 60;

// An HTTP date as `Retry-After` gives one (RFC 9110's IMF-fixdate, `Sun, 06 Nov 1994 08:49:37
// GMT`): checked before Date.parse, which also reads `-5` or `12.5` as dates.
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * `Retry-After` in seconds (whole seconds, or an HTTP date), or undefined when it's neither, and
 * the outbox's own schedule then applies.
 */
export const retryAfterSeconds = (value: string | null, now = Date.now()): number | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed), MAX_WAIT_SECONDS);
  if (!HTTP_DATE.test(trimmed)) return undefined;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.min(Math.max(0, Math.ceil((at - now) / 1000)), MAX_WAIT_SECONDS);
};

/**
 * The forms a secret can come back in from a web API: as it is, URL-encoded (as a path and as a
 * form, `+` for a space), JSON-escaped, base64 (with and without its padding, and base64url) and
 * hex. A transport adds the blobs it builds from secrets itself (Basic auth). Other encodings
 * aren't caught: SMTP's AUTH answers, where an echo is likeliest, show only their codes.
 */
export const secretForms = (secret: string): string[] => {
  const bytes = Buffer.from(secret, "utf8");
  const base64 = bytes.toString("base64");
  const hex = bytes.toString("hex");
  return [
    secret,
    encodeURIComponent(secret),
    new URLSearchParams({ s: secret }).toString().slice(2),
    JSON.stringify(secret).slice(1, -1),
    JSON.stringify(secret).slice(1, -1).replace(/\//g, "\\/"),
    base64,
    base64.replace(/=+$/, ""),
    bytes.toString("base64url"),
    hex,
    hex.toUpperCase(),
  ];
};

/**
 * A provider's answer, short and with every secret the transport holds taken out, in every form
 * `secretForms` gives, for root's test email and the log's reason: never the credential, even
 * when the provider echoes it encoded.
 */
export const cleanDetail = (text: string, secrets: readonly string[]): string => {
  let clean = text;
  const forms = [...new Set(secrets.flatMap(secretForms))]
    .filter((form) => form.length >= 4)
    // Longest first, so a secret inside a longer blob doesn't leave the blob's rest behind.
    .sort((a, b) => b.length - a.length);
  for (const form of forms) clean = clean.split(form).join("[redacted]");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
};

/**
 * What an HTTP answer means, by status alone: 2xx sent; 429 a retry after `Retry-After`; 5xx and
 * 408 a retry; 401 and 403 bad credentials; any other 4xx refused for good. A transport refines it
 * where its provider's body says more (SES's throttling on a 400).
 */
export const resultOf = async (
  response: Response,
  secrets: readonly string[],
): Promise<SendResult> => {
  if (response.ok) return { status: "sent" };
  const detail = cleanDetail(await response.text().catch(() => ""), secrets);
  const fail = (reason: MailFailureReason): SendResult => ({ status: "failed", reason, detail });
  if (response.status === 429)
    return {
      status: "retry",
      reason: "rate_limited",
      waitSeconds: retryAfterSeconds(response.headers.get("retry-after")),
      detail,
    };
  if (response.status >= 500 || response.status === 408)
    return { status: "retry", reason: "server", detail };
  if (response.status === 401 || response.status === 403) return fail("auth");
  return fail("rejected");
};

/**
 * One request to a provider, with a timeout. A network error or a timeout is a retry: the message
 * may go through on the next try. The request goes only to the URL the transport built from its
 * fixed host; redirects aren't followed.
 */
export const post = async (
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  secrets: readonly string[],
): Promise<{ response: Response } | { result: SendResult }> => {
  try {
    const response = await fetcher(url, {
      ...init,
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return { response };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      result: {
        status: "retry",
        reason: timedOut ? "timeout" : "connection",
        detail: cleanDetail(String((error as Error)?.message ?? error), secrets),
      },
    };
  }
};

/** The User-Agent the web APIs see (Resend refuses a request without one). */
export const USER_AGENT = "Ronne-Marketplace-Mail/1";
