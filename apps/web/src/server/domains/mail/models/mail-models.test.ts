import { describe, expect, it } from "vitest";
import { cleanDetail, retryAfterSeconds } from "../repositories/transports/http";
import { composeMime } from "./compose";
import { isMailAddress, type MailMessage } from "./message";
import { checkSmtpHost } from "./smtp-host";

const message: MailMessage = {
  to: "ana@example.com",
  from: { address: "marketplace@acme.example", name: "Acme Marketplace" },
  replyTo: "it-help@acme.example",
  subject: "Café: ça marche",
  text: "Olá",
  html: "<p>Olá</p>",
};

describe("composeMime (189)", () => {
  it("builds one message with both bodies, the Reply-To and Auto-Submitted, headers encoded", async () => {
    const mime = (await composeMime(message)).toString("utf8");
    expect(mime).toMatch(/^From: Acme Marketplace <marketplace@acme\.example>$/m);
    expect(mime).toMatch(/^To: ana@example\.com$/m);
    expect(mime).toMatch(/^Reply-To: it-help@acme\.example$/m);
    expect(mime).toMatch(/^Auto-Submitted: auto-generated$/m);
    expect(mime).toMatch(/^Subject: =\?UTF-8\?/m);
    expect(mime).toMatch(/multipart\/alternative/);
    expect(mime).toMatch(/text\/plain/);
    expect(mime).toMatch(/text\/html/);
  });

  it("refuses a line break in the subject, the sender's name or an address", async () => {
    for (const changed of [
      { subject: "Hi\r\nBcc: x@example.com" },
      { subject: "Hi\rBcc: x@example.com" },
      { from: { address: "a@example.com", name: "A\nBcc: x@example.com" } },
      { to: "ana@example.com\r\nBcc: x@example.com" },
      { replyTo: "not an address" },
    ])
      await expect(composeMime({ ...message, ...changed })).rejects.toThrow();
  });
});

describe("isMailAddress", () => {
  it("takes ASCII addresses with a domain, and nothing else", () => {
    expect(isMailAddress("ana+notices@acme.example")).toBe(true);
    for (const bad of [
      "ana",
      "ana@localhost",
      "ána@acme.example",
      "ana@acme.example\n",
      `${"a".repeat(250)}@x.co`,
    ])
      expect(isMailAddress(bad)).toBe(false);
  });
});

describe("checkSmtpHost (189)", () => {
  const allowedHosts = new Set(["relay.internal"]);
  const resolve = (addresses: string[]) => async () => addresses;

  it("passes a host whose every address is public, with the addresses to connect to", async () => {
    expect(
      await checkSmtpHost("Smtp.Example.", { allowedHosts, resolve: resolve(["93.184.216.34"]) }),
    ).toEqual({
      ok: true,
      host: "smtp.example",
      addresses: ["93.184.216.34"],
    });
  });

  it("refuses private, loopback, link-local and mixed answers, and localhost", async () => {
    for (const answer of [
      ["10.0.0.1"],
      ["127.0.0.1"],
      ["169.254.169.254"],
      ["93.184.216.34", "192.168.1.1"],
      ["::1"],
      ["::ffff:10.0.0.1"],
    ])
      expect(
        await checkSmtpHost("smtp.example", { allowedHosts, resolve: resolve(answer) }),
      ).toEqual({
        ok: false,
        problem: "internal address",
      });
    expect(
      await checkSmtpHost("localhost", { allowedHosts, resolve: resolve(["93.184.216.34"]) }),
    ).toMatchObject({
      ok: false,
    });
    expect(await checkSmtpHost("10.1.2.3", { allowedHosts, resolve: resolve([]) })).toMatchObject({
      ok: false,
    });
  });

  it("lets a listed host skip the check, unresolved", async () => {
    expect(
      await checkSmtpHost("relay.internal", { allowedHosts, resolve: resolve(["10.0.0.1"]) }),
    ).toEqual({
      ok: true,
      host: "relay.internal",
      addresses: null,
    });
  });

  it("refuses what isn't a host name, and a name that doesn't resolve", async () => {
    for (const bad of ["", "smtp.example:25", "smtp://smtp.example", "user@smtp.example", "a b"])
      expect(
        await checkSmtpHost(bad, { allowedHosts, resolve: resolve(["93.184.216.34"]) }),
      ).toEqual({
        ok: false,
        problem: "not a host",
      });
    expect(
      await checkSmtpHost("nowhere.example", {
        allowedHosts,
        resolve: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).toEqual({ ok: false, problem: "unresolved" });
  });
});

describe("the web APIs' helpers", () => {
  it("reads Retry-After as seconds or a date, capped at 6 hours", () => {
    expect(retryAfterSeconds("30")).toBe(30);
    expect(retryAfterSeconds("999999")).toBe(6 * 60 * 60);
    const now = Date.parse("2026-11-21T12:00:00Z");
    expect(retryAfterSeconds("Sat, 21 Nov 2026 12:01:00 GMT", now)).toBe(60);
    expect(retryAfterSeconds("soon")).toBeUndefined();
    for (const garbage of ["-5", "+5", "12.5", "1e3", "2026-11-21"])
      expect(retryAfterSeconds(garbage)).toBeUndefined();
    expect(retryAfterSeconds(null)).toBeUndefined();
  });

  it("takes every secret out of a provider's answer, and keeps it short", () => {
    expect(cleanDetail("bad key sk-12345 and sk-12345 again", ["sk-12345"])).toBe(
      "bad key [redacted] and [redacted] again",
    );
    expect(cleanDetail("x".repeat(1000), []).length).toBeLessThanOrEqual(300);
    const secret = "tok+en/1==";
    const echoed = `raw ${secret} url ${encodeURIComponent(secret)} b64 ${Buffer.from(secret).toString("base64")}`;
    expect(cleanDetail(echoed, [secret])).toBe("raw [redacted] url [redacted] b64 [redacted]");
    // Padded base64 echoed without its padding, base64url, and hex in either case: a key whose
    // base64 holds a "/" and padding, so each form differs from the others.
    const key = "p>?key1";
    expect(Buffer.from(key).toString("base64")).toBe("cD4/a2V5MQ==");
    for (const form of [
      "cD4/a2V5MQ",
      "cD4_a2V5MQ",
      Buffer.from(key).toString("hex"),
      Buffer.from(key).toString("hex").toUpperCase(),
    ])
      expect(cleanDetail(`x ${form} y`, [key])).toBe("x [redacted] y");
    // JSON-escaped: a quote and a backslash, and a "/" left as it is or escaped as "\/".
    expect(cleanDetail(JSON.stringify({ m: 'bad a"b\\c' }), ['a"b\\c'])).toBe(
      '{"m":"bad [redacted]"}',
    );
    expect(cleanDetail(JSON.stringify({ m: 'bad a/"b' }), ['a/"b'])).toBe('{"m":"bad [redacted]"}');
    expect(cleanDetail('{"m":"bad a\\/\\"b"}', ['a/"b'])).toBe('{"m":"bad [redacted]"}');
    // JSON-escaped and form-encoded.
    expect(cleanDetail('{"m":"bad a\\/b c"}', ["a/b c"])).toBe('{"m":"bad [redacted]"}');
    expect(cleanDetail("k=a+b%2Fc", ["a b/c"])).toBe("k=[redacted]");
    // A blob holding a secret goes whole, not with the secret cut out of it.
    expect(cleanDetail("echo api:key-1234 end", ["key-1234", "api:key-1234"])).toBe(
      "echo [redacted] end",
    );
  });
});
