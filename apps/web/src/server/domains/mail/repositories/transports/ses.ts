import { composeMime } from "../../models/compose";
import type { MailTransport, SendResult } from "../../models/message";
import { signV4 } from "../../models/sigv4";
import { cleanDetail, type Fetch, post, resultOf, USER_AGENT } from "./http";

export type SesConfig = { region: string; accessKeyId: string; secretAccessKey: string };

// An AWS region's name (`eu-west-1`, `us-gov-west-1`, `ap-southeast-4`): nothing that could make
// the host anything but SES's own.
const REGION = /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/;

/** Whether a region can be SES's: its endpoint is then `email.<region>.amazonaws.com`. */
export const isAwsRegion = (value: string): boolean => REGION.test(value);

// Errors SES answers with 400 that are worth another try (CommonErrors: "The AWS SDKs
// automatically retry requests that receive this exception"); every other 4xx is for good. Matched
// on the error's type alone (`x-amzn-errortype`, or the body's `__type`), never its free text.
const THROTTLED = /^(?:.*#)?(?:ThrottlingException|TooManyRequestsException)(?::.*)?$/;

/** The error type SES gave: the header, else the JSON body's `__type`. */
const errorType = (response: Response, text: string): string => {
  const header = response.headers.get("x-amzn-errortype");
  if (header) return header.trim();
  try {
    const body = JSON.parse(text) as { __type?: unknown };
    return typeof body.__type === "string" ? body.__type : "";
  } catch {
    return "";
  }
};

/**
 * Amazon SES v2 SendEmail with the raw MIME message (189): `POST
 * https://email.<region>.amazonaws.com/v2/email/outbound-emails`, `Content.Raw.Data` base64,
 * signed with SigV4 (service `ses`). The host is built from a checked region, never typed.
 */
export const sesTransport = (
  config: SesConfig,
  deps: { fetch?: Fetch; now?: () => Date } = {},
): MailTransport => ({
  kind: "ses",
  send: async (message): Promise<SendResult> => {
    const secrets = [config.secretAccessKey, config.accessKeyId];
    if (!isAwsRegion(config.region))
      return { status: "failed", reason: "config", detail: "not an AWS region" };
    const url = `https://email.${config.region}.amazonaws.com/v2/email/outbound-emails`;
    const body = JSON.stringify({
      Content: { Raw: { Data: (await composeMime(message)).toString("base64") } },
      Destination: { ToAddresses: [message.to] },
    });
    const headers = signV4(
      { method: "POST", url, headers: { "content-type": "application/json" }, body },
      config,
      { region: config.region, service: "ses" },
      (deps.now ?? (() => new Date()))(),
    );
    const sent = await post(
      deps.fetch ?? fetch,
      url,
      { headers: { ...headers, "user-agent": USER_AGENT }, body },
      secrets,
    );
    if ("result" in sent) return sent.result;
    const { response } = sent;
    if (response.status === 400) {
      const text = await response
        .clone()
        .text()
        .catch(() => "");
      if (THROTTLED.test(errorType(response, text)))
        return { status: "retry", reason: "rate_limited", detail: cleanDetail(text, secrets) };
    }
    const result = await resultOf(response, secrets);
    if (result.status !== "sent") return result;
    const id = await response
      .json()
      .then((json: { MessageId?: unknown }) =>
        typeof json.MessageId === "string" ? json.MessageId : undefined,
      )
      .catch(() => undefined);
    return id ? { status: "sent", providerId: id } : { status: "sent" };
  },
});
