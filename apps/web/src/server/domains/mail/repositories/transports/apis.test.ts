import { describe, expect, it } from "vitest";
import type { MailMessage, MailTransport } from "../../models/message";
import { mailgunTransport, postmarkTransport, resendTransport } from "./apis";
import type { Fetch } from "./http";
import { sesTransport } from "./ses";

const message: MailMessage = {
  to: "ana@example.com",
  from: { address: "marketplace@acme.example", name: "Acme Marketplace" },
  replyTo: "it-help@acme.example",
  subject: "Your password was changed",
  text: "Hello",
  html: "<p>Hello</p>",
  idempotencyKey: "01JOUTBOXROW000000000000001",
};

type Call = { url: string; init: RequestInit };

/** A `fetch` that records the request and answers with `answer`, or throws it when it's an Error. */
const recorder = (answer: Response | Error) => {
  const calls: Call[] = [];
  const fetcher: Fetch = async (url, init) => {
    calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    return answer.clone();
  };
  return { calls, fetcher };
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const KEY = "secret-key-abcdef-123456";

type Case = {
  name: string;
  make: (fetcher: Fetch) => MailTransport;
  ok: Response;
  id: string;
};

const cases: Case[] = [
  {
    name: "Amazon SES",
    make: (fetcher) =>
      sesTransport(
        { region: "eu-west-1", accessKeyId: "AKIAEXAMPLE", secretAccessKey: KEY },
        { fetch: fetcher, now: () => new Date("2026-11-21T12:00:00Z") },
      ),
    ok: json(200, { MessageId: "ses-1" }),
    id: "ses-1",
  },
  {
    name: "Mailgun",
    make: (fetcher) =>
      mailgunTransport(
        { apiKey: KEY, domain: "mg.acme.example", region: "us" },
        { fetch: fetcher },
      ),
    ok: json(200, { id: "<mg-1@mg.acme.example>", message: "Queued. Thank you." }),
    id: "<mg-1@mg.acme.example>",
  },
  {
    name: "Postmark",
    make: (fetcher) => postmarkTransport({ serverToken: KEY }, { fetch: fetcher }),
    ok: json(200, { To: "ana@example.com", MessageID: "pm-1", ErrorCode: 0, Message: "OK" }),
    id: "pm-1",
  },
  {
    name: "Resend",
    make: (fetcher) => resendTransport({ apiKey: KEY }, { fetch: fetcher }),
    ok: json(200, { id: "rs-1" }),
    id: "rs-1",
  },
];

describe.each(cases)("the $name transport (189)", ({ make, ok, id }) => {
  it("sends, and keeps the provider's ID", async () => {
    const { fetcher } = recorder(ok);
    expect(await make(fetcher).send(message)).toEqual({ status: "sent", providerId: id });
  });

  it("retries a 429, as long as Retry-After says", async () => {
    const { fetcher } = recorder(json(429, { message: "slow down" }, { "retry-after": "17" }));
    expect(await make(fetcher).send(message)).toMatchObject({
      status: "retry",
      reason: "rate_limited",
      waitSeconds: 17,
    });
  });

  it("retries a 5xx", async () => {
    const { fetcher } = recorder(json(503, { message: "down" }));
    expect(await make(fetcher).send(message)).toMatchObject({ status: "retry", reason: "server" });
  });

  it("fails for good on refused credentials, and never repeats the key", async () => {
    const { fetcher } = recorder(json(401, { message: `bad key ${KEY}` }));
    const result = await make(fetcher).send(message);
    expect(result).toMatchObject({ status: "failed", reason: "auth" });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("fails for good on another 4xx", async () => {
    const { fetcher } = recorder(json(422, { message: "invalid" }));
    expect(await make(fetcher).send(message)).toMatchObject({
      status: "failed",
      reason: "rejected",
    });
  });

  it("retries when the network fails", async () => {
    const { fetcher } = recorder(new TypeError("fetch failed"));
    expect(await make(fetcher).send(message)).toMatchObject({
      status: "retry",
      reason: "connection",
    });
  });

  it("follows no redirect and sends to an https host fixed in code", async () => {
    const { calls, fetcher } = recorder(ok);
    await make(fetcher).send(message);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(new URL(calls[0]?.url ?? "").protocol).toBe("https:");
    expect(new Headers(calls[0]?.init.headers).get("user-agent")).toBeTruthy();
  });
});

const headersOf = (call: Call | undefined) => new Headers(call?.init.headers);

describe("each provider's request (189)", () => {
  it("SES: SendEmail v2 at the region's endpoint, the raw message base64, signed with SigV4", async () => {
    const { calls, fetcher } = recorder(cases[0]?.ok ?? json(200, {}));
    await cases[0]?.make(fetcher).send(message);
    expect(calls[0]?.url).toBe("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.Destination).toEqual({ ToAddresses: ["ana@example.com"] });
    const raw = Buffer.from(body.Content.Raw.Data, "base64").toString("utf8");
    expect(raw).toMatch(/^Reply-To: it-help@acme\.example$/m);
    expect(raw).toMatch(/^Auto-Submitted: auto-generated$/m);
    expect(headersOf(calls[0]).get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20261121\/eu-west-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(headersOf(calls[0]).get("x-amz-date")).toBe("20261121T120000Z");
  });

  it("SES: retries a throttling 400, and refuses a region that isn't one", async () => {
    const throttled = recorder(
      json(400, { message: "Rate exceeded" }, { "x-amzn-errortype": "ThrottlingException" }),
    );
    expect(await cases[0]?.make(throttled.fetcher).send(message)).toMatchObject({
      status: "retry",
      reason: "rate_limited",
    });
    const rejected = recorder(json(400, { message: "Email address is not verified." }));
    expect(await cases[0]?.make(rejected.fetcher).send(message)).toMatchObject({
      status: "failed",
      reason: "rejected",
      detail: expect.stringContaining("not verified"),
    });
    const evil = recorder(json(200, {}));
    expect(
      await sesTransport(
        { region: "evil.example/x", accessKeyId: "a", secretAccessKey: "b" },
        { fetch: evil.fetcher },
      ).send(message),
    ).toMatchObject({ status: "failed", reason: "config" });
    expect(evil.calls).toEqual([]);
  });

  it("Mailgun: messages.mime with basic auth api:<key>, on the EU host for an EU domain", async () => {
    const { calls, fetcher } = recorder(json(200, { id: "x" }));
    await mailgunTransport(
      { apiKey: KEY, domain: "mg.acme.example", region: "eu" },
      { fetch: fetcher },
    ).send(message);
    expect(calls[0]?.url).toBe("https://api.eu.mailgun.net/v3/mg.acme.example/messages.mime");
    expect(headersOf(calls[0]).get("authorization")).toBe(
      `Basic ${Buffer.from(`api:${KEY}`).toString("base64")}`,
    );
    const form = calls[0]?.init.body as FormData;
    expect(form.get("to")).toBe("ana@example.com");
    const mime = await (form.get("message") as Blob).text();
    expect(mime).toMatch(/^Subject: Your password was changed$/m);
  });

  it("Mailgun: refuses a domain that could change the URL", async () => {
    const { calls, fetcher } = recorder(json(200, {}));
    expect(
      await mailgunTransport(
        { apiKey: KEY, domain: "x/../../v4", region: "us" },
        { fetch: fetcher },
      ).send(message),
    ).toMatchObject({ status: "failed", reason: "config" });
    expect(calls).toEqual([]);
  });

  it("Postmark: the email API, its server token, stream outbound, every part", async () => {
    const { calls, fetcher } = recorder(cases[2]?.ok ?? json(200, {}));
    await cases[2]?.make(fetcher).send(message);
    expect(calls[0]?.url).toBe("https://api.postmarkapp.com/email");
    expect(headersOf(calls[0]).get("x-postmark-server-token")).toBe(KEY);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      From: '"Acme Marketplace" <marketplace@acme.example>',
      To: "ana@example.com",
      ReplyTo: "it-help@acme.example",
      Subject: "Your password was changed",
      TextBody: "Hello",
      HtmlBody: "<p>Hello</p>",
      Headers: [{ Name: "Auto-Submitted", Value: "auto-generated" }],
      MessageStream: "outbound",
    });
  });

  it("Postmark: retries its own trouble (ErrorCode 100 or 101)", async () => {
    const { fetcher } = recorder(json(503, { ErrorCode: 100, Message: "Maintenance" }));
    expect(await cases[2]?.make(fetcher).send(message)).toMatchObject({ status: "retry" });
  });

  it("Resend: the emails API, a bearer key, and the outbox row's ID as Idempotency-Key", async () => {
    const { calls, fetcher } = recorder(cases[3]?.ok ?? json(200, {}));
    await cases[3]?.make(fetcher).send(message);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(headersOf(calls[0]).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headersOf(calls[0]).get("idempotency-key")).toBe("01JOUTBOXROW000000000000001");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: '"Acme Marketplace" <marketplace@acme.example>',
      to: ["ana@example.com"],
      reply_to: "it-help@acme.example",
      subject: "Your password was changed",
      text: "Hello",
      html: "<p>Hello</p>",
      headers: { "Auto-Submitted": "auto-generated" },
    });
  });

  it("Resend: retries while another try with the same key is in progress", async () => {
    const { fetcher } = recorder(json(409, { name: "concurrent_idempotent_requests" }));
    expect(await cases[3]?.make(fetcher).send(message)).toMatchObject({ status: "retry" });
    const changed = recorder(json(409, { name: "invalid_idempotent_request" }));
    expect(await cases[3]?.make(changed.fetcher).send(message)).toMatchObject({ status: "failed" });
  });

  it("every provider: a message with a line break in a header is refused before any request", async () => {
    for (const c of cases) {
      const { calls, fetcher } = recorder(c.ok);
      await expect(
        c.make(fetcher).send({ ...message, subject: "a\nBcc: x@example.com" }),
      ).rejects.toThrow(/line break/);
      expect(calls).toEqual([]);
    }
  });

  it("SES: retries only on the error's type, never on words in its message", async () => {
    const byBody = recorder(json(400, { __type: "ThrottlingException", message: "Rate exceeded" }));
    expect(await cases[0]?.make(byBody.fetcher).send(message)).toMatchObject({ status: "retry" });
    const lookalike = recorder(
      json(400, {
        __type: "MessageRejected",
        message: "ThrottlingException@x.example isn't allowed",
      }),
    );
    expect(await cases[0]?.make(lookalike.fetcher).send(message)).toMatchObject({
      status: "failed",
    });
  });

  it("Mailgun: refuses a region but us and eu, and takes the Basic blob out of an echo", async () => {
    const none = recorder(json(200, {}));
    expect(
      await mailgunTransport(
        { apiKey: KEY, domain: "mg.acme.example", region: "EU" as "eu" },
        { fetch: none.fetcher },
      ).send(message),
    ).toMatchObject({ status: "failed", reason: "config" });
    expect(none.calls).toEqual([]);
    const blob = Buffer.from(`api:${KEY}`).toString("base64");
    const echo = recorder(json(401, { message: `Forbidden: Basic ${blob}` }));
    const result = await mailgunTransport(
      { apiKey: KEY, domain: "mg.acme.example", region: "us" },
      { fetch: echo.fetcher },
    ).send(message);
    expect(JSON.stringify(result)).not.toContain(blob);
  });
});
