import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MailMessage } from "../../models/message";
import {
  type FakeSmtp,
  type FakeSmtpOptions,
  makeTestCertificate,
  startFakeSmtp,
  type TestCertificate,
} from "../../testing/smtp-fake";
import {
  detailOf,
  SMTP_TIMEOUTS,
  type SmtpConfig,
  type SmtpDeps,
  type SmtpTls,
  smtpTransport,
} from "./smtp";

const message: MailMessage = {
  to: "ana@example.com",
  from: { address: "marketplace@acme.example", name: "Acme Marketplace" },
  replyTo: "it-help@acme.example",
  subject: "Two-factor sign-in was turned off",
  text: "Hello",
  html: "<p>Hello</p>",
};

let certificate: TestCertificate;
beforeAll(() => {
  certificate = makeTestCertificate();
});

let fake: FakeSmtp | null = null;
afterEach(async () => {
  await fake?.close();
  fake = null;
});

const start = async (options: Omit<FakeSmtpOptions, "certificate">) => {
  fake = await startFakeSmtp({ ...options, certificate });
  return fake;
};

/** The transport, on the fake: `localhost` is listed (it's this machine), and the cert trusted. */
const send = (config: Partial<SmtpConfig>, deps: Partial<SmtpDeps> = {}) =>
  smtpTransport(
    { host: "localhost", port: fake?.port ?? 0, tls: "starttls", ...config },
    {
      allowedHosts: new Set(["localhost"]),
      ca: certificate.cert,
      timeouts: { connection: 2000, greeting: 1000, socket: 3000 },
      ...deps,
    },
  ).send(message);

describe("the SMTP transport (189)", () => {
  it("sends through required STARTTLS, with the user name and password", async () => {
    const server = await start({
      mode: "starttls",
      credentials: { user: "u", password: "pw-123456" },
    });
    expect(await send({ user: "u", password: "pw-123456" })).toMatchObject({ status: "sent" });
    expect(server.received).toHaveLength(1);
    const [got] = server.received;
    expect(got).toMatchObject({
      from: "marketplace@acme.example",
      to: ["ana@example.com"],
      tls: true,
      user: "u",
    });
    expect(got?.data).toMatch(/^Auto-Submitted: auto-generated$/m);
    expect(got?.data).toMatch(/^Reply-To: it-help@acme\.example$/m);
  });

  it("sends over TLS from the first byte", async () => {
    const server = await start({ mode: "tls" });
    expect(await send({ tls: "tls" })).toMatchObject({ status: "sent" });
    expect(server.received[0]?.tls).toBe(true);
  });

  it("fails, never falls back, when the server doesn't offer STARTTLS", async () => {
    const server = await start({
      mode: "plain",
      credentials: { user: "u", password: "pw-123456" },
    });
    expect(await send({ user: "u", password: "pw-123456" })).toMatchObject({
      status: "failed",
      reason: "tls",
    });
    expect(server.received).toEqual([]);
  });

  it("refuses a certificate it can't verify", async () => {
    const server = await start({ mode: "starttls" });
    expect(await send({}, { ca: undefined })).toMatchObject({ status: "failed", reason: "tls" });
    expect(server.received).toEqual([]);
  });

  it("refuses a certificate for another name, even one it trusts", async () => {
    const other = makeTestCertificate({ dns: "other.example" });
    fake = await startFakeSmtp({ mode: "tls", certificate: other });
    expect(await send({ tls: "tls" }, { ca: other.cert })).toMatchObject({
      status: "failed",
      reason: "tls",
    });
    expect(fake.received).toEqual([]);
  });

  it("fails for good on 535, and never shows the password", async () => {
    await start({ mode: "starttls", credentials: { user: "u", password: "right-password" } });
    const result = await send({ user: "u", password: "wrong-password-99" });
    expect(result).toMatchObject({ status: "failed", reason: "auth" });
    expect(JSON.stringify(result)).not.toContain("wrong-password-99");
  });

  it("fails for good when the recipient is refused with a 5xx, and retries a 4xx", async () => {
    await start({ mode: "starttls", rcptReply: "550 5.1.1 No such user" });
    expect(await send({})).toMatchObject({ status: "failed", reason: "rejected" });
    await fake?.close();
    await start({ mode: "starttls", rcptReply: "451 4.3.0 Try again later" });
    expect(await send({})).toMatchObject({ status: "retry", reason: "server" });
  });

  it("retries a server that doesn't greet in time", async () => {
    await start({ mode: "starttls", greetingDelayMs: 3000 });
    expect(await send({})).toMatchObject({ status: "retry", reason: "timeout" });
  });

  it("retries when nothing listens", async () => {
    const server = await start({ mode: "starttls" });
    const port = server.port;
    await server.close();
    fake = null;
    expect(await send({ port })).toMatchObject({ status: "retry", reason: "connection" });
  });

  it("sends plain SMTP only to a listed relay, and never with a user name", async () => {
    const server = await start({ mode: "plain" });
    expect(await send({ tls: "none" })).toMatchObject({ status: "sent" });
    expect(server.received[0]?.tls).toBe(false);
    expect(await send({ tls: "none", user: "u", password: "pw" })).toMatchObject({
      status: "failed",
      reason: "config",
    });
    expect(
      await send(
        { tls: "none", host: "relay.example" },
        { allowedHosts: new Set(), resolve: async () => ["198.51.100.7"] },
      ),
    ).toMatchObject({ status: "failed", reason: "config" });
  });

  it("refuses a host that resolves to a private address unless it's listed", async () => {
    expect(
      await send(
        { host: "smtp.example" },
        { allowedHosts: new Set(), resolve: async () => ["10.0.0.5"] },
      ),
    ).toMatchObject({ status: "failed", reason: "config" });
    expect(await send({ host: "127.0.0.1" }, { allowedHosts: new Set() })).toMatchObject({
      status: "failed",
      reason: "config",
    });
  });

  it("refuses a message with a line break in a header before connecting", async () => {
    const server = await start({ mode: "starttls" });
    await expect(
      smtpTransport(
        { host: "localhost", port: server.port, tls: "starttls" },
        { allowedHosts: new Set(["localhost"]), ca: certificate.cert },
      ).send({ ...message, subject: "Hi\r\nBcc: someone@example.com" }),
    ).rejects.toThrow(/line break/);
    expect(server.received).toEqual([]);
  });

  it("refuses any TLS mode but the three, so it never falls back to plain text", async () => {
    const server = await start({
      mode: "plain",
      credentials: { user: "u", password: "pw-123456" },
    });
    for (const tls of ["STARTTLS", "", "ssl", undefined] as unknown as SmtpTls[])
      expect(await send({ tls, user: "u", password: "pw-123456" })).toMatchObject({
        status: "failed",
        reason: "config",
      });
    expect(server.received).toEqual([]);
  });

  it("connects to the address the check returned, verified against the typed host", async () => {
    // smtp.good.test exists nowhere: only the checked address reaches the fake, and its
    // certificate (for that name only, no IP) passes only when checked as that name.
    const good = makeTestCertificate({ dns: "smtp.good.test" });
    const server = await startFakeSmtp({ mode: "tls", certificate: good });
    fake = server;
    const deps = {
      allowedHosts: new Set<string>(),
      ca: good.cert,
      check: async () => ({ ok: true as const, host: "smtp.good.test", addresses: ["127.0.0.1"] }),
    };
    expect(
      await smtpTransport({ host: "smtp.good.test", port: server.port, tls: "tls" }, deps).send(
        message,
      ),
    ).toMatchObject({ status: "sent" });
    expect(server.received).toHaveLength(1);
    // A certificate for another name fails, even when it also names the address connected to.
    const other = makeTestCertificate({ dns: "other.test", ip: "127.0.0.1" });
    await server.close();
    fake = await startFakeSmtp({ mode: "tls", certificate: other });
    expect(
      await smtpTransport(
        { host: "smtp.good.test", port: fake.port, tls: "tls" },
        { ...deps, ca: other.cert },
      ).send(message),
    ).toMatchObject({ status: "failed", reason: "tls" });
    expect(fake.received).toEqual([]);
  });

  it("retries a 4xx at AUTH: it's temporary", async () => {
    await start({
      mode: "starttls",
      credentials: { user: "u", password: "pw" },
      authReply: "454 4.7.0",
    });
    expect(await send({ user: "u", password: "pw-123456" })).toMatchObject({
      status: "retry",
      reason: "server",
    });
  });

  it("shows only the reply's codes for a refusal at AUTH, whatever the server echoes", async () => {
    // A user name whose length doesn't line the password's base64 up inside the blob's.
    await start({
      mode: "starttls",
      credentials: { user: "us", password: "x" },
      authReply: "535 5.7.8",
    });
    const password = "p@ss w/rd+Secret9";
    const result = await send({ user: "us", password });
    expect(result).toEqual({
      status: "failed",
      reason: "auth",
      detail: "authentication refused (535 5.7.8)",
    });
    const text = JSON.stringify(result);
    for (const form of [
      password,
      Buffer.from(`\u0000us\u0000${password}`).toString("base64"),
      Buffer.from(password).toString("base64"),
      Buffer.from(password).toString("hex"),
    ])
      expect(text).not.toContain(form);
  });

  it("fails on TLS when the handshake after STARTTLS breaks, before any password goes", async () => {
    const server = await start({
      mode: "starttls",
      credentials: { user: "u", password: "pw" },
      brokenStartTls: true,
    });
    expect(await send({ user: "u", password: "pw-123456" })).toMatchObject({
      status: "failed",
      reason: "tls",
    });
    expect(server.received).toEqual([]);
  });

  it("waits 10, 10 and 30 seconds by default", () => {
    expect(SMTP_TIMEOUTS).toEqual({ connection: 10_000, greeting: 10_000, socket: 30_000 });
  });

  it("shows codes only at AUTH, known by the error's code or by the command alike", () => {
    const reply = "535 5.7.8 rejected: AUTH PLAIN AHVzAHBhc3MtOTk=";
    const codesOnly = "authentication refused (535 5.7.8)";
    expect(detailOf({ name: "Error", message: "x", code: "EAUTH", response: reply }, [])).toBe(
      codesOnly,
    );
    expect(
      detailOf({ name: "Error", message: "x", command: "AUTH PLAIN", response: reply }, []),
    ).toBe(codesOnly);
  });

  it("cleans the password, and the AUTH PLAIN blob, out of a reply at another stage", () => {
    const blob = Buffer.from("\u0000us\u0000pass-99").toString("base64");
    const detail = detailOf(
      {
        name: "Error",
        message: "x",
        command: "MAIL FROM",
        response: `550 5.7.1 you sent ${blob} and pass-99`,
      },
      ["pass-99", "\u0000us\u0000pass-99"],
    );
    expect(detail).toBe("550 5.7.1 you sent [redacted] and [redacted]");
  });

  it("cleans the AUTH PLAIN blob out of a later reply that echoes it, through the transport", async () => {
    // Accepted at AUTH, refused at MAIL FROM with the AUTH line echoed back: the transport's own
    // list of secrets must hold the blob, as base64(password) isn't inside it for this user.
    await start({
      mode: "starttls",
      credentials: { user: "us", password: "pw-123456" },
      echoAuthAtMail: true,
    });
    const result = await send({ user: "us", password: "pw-123456" });
    expect(result).toMatchObject({ status: "failed", reason: "rejected" });
    const blob = Buffer.from("\u0000us\u0000pw-123456").toString("base64");
    expect(Buffer.from("pw-123456").toString("base64")).not.toBe(blob.slice(-12));
    expect(JSON.stringify(result)).not.toContain(blob);
    expect(JSON.stringify(result)).toContain("[redacted]");
  });
});
