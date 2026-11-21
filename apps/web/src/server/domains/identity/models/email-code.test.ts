import { createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkEmailCode,
  codeHmac,
  EMAIL_CODE_MAX_ATTEMPTS,
  emailCodeMinutes,
  emailCodeSendable,
  emailHmac,
  newEmailCode,
  type StoredEmailCode,
  typedCode,
} from "./email-code";

const SECRET = "test-secret-test-secret-test-secret-00";
const NOW = new Date("2026-11-21T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const stored = (code: string, extra: Partial<StoredEmailCode> = {}): StoredEmailCode => ({
  purpose: "sign_up",
  subjectId: "01PENDING00000000000000000",
  codeHmac: codeHmac(SECRET, "sign_up", "01PENDING00000000000000000", code),
  attempts: 0,
  expiresAt: later(15 * 60_000),
  consumedAt: null,
  ...extra,
});

describe("email codes (190)", () => {
  it("are 6 digits, leading zeros kept, and differ from one to the next", () => {
    const codes = Array.from({ length: 2000 }, newEmailCode);
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(1990);
  });

  it("are stored only as an HMAC, bound to their purpose, subject and AUTH_SECRET", () => {
    const h = codeHmac(SECRET, "sign_up", "01A", "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123456");
    expect(codeHmac(SECRET, "sign_up", "01A", "123456")).toBe(h);
    expect(codeHmac(SECRET, "password_reset", "01A", "123456")).not.toBe(h);
    expect(codeHmac(SECRET, "sign_up", "01B", "123456")).not.toBe(h);
    expect(codeHmac("another-secret-another-secret-00000", "sign_up", "01A", "123456")).not.toBe(h);
  });

  it("use a key HKDF-SHA256 derives from AUTH_SECRET for the purpose email-code, never the secret itself", () => {
    const key = Buffer.from(hkdfSync("sha256", SECRET, Buffer.alloc(0), "email-code", 32));
    const known = createHmac("sha256", key).update("code:sign_up:01A:123456", "utf8").digest("hex");
    expect(codeHmac(SECRET, "sign_up", "01A", "123456")).toBe(known);
    expect(codeHmac(SECRET, "sign_up", "01A", "123456")).not.toBe(
      createHmac("sha256", SECRET).update("code:sign_up:01A:123456", "utf8").digest("hex"),
    );
    expect(emailHmac(SECRET, "ana@example.com")).toBe(
      createHmac("sha256", key).update("email:ana@example.com", "utf8").digest("hex"),
    );
  });

  it("keep the address only as an HMAC, its case and spaces ignored", () => {
    expect(emailHmac(SECRET, " Ana@Example.com ")).toBe(emailHmac(SECRET, "ana@example.com"));
    expect(emailHmac(SECRET, "ana@example.com")).not.toContain("ana");
  });

  it("read a typed code without spaces or dashes, and refuse anything but 6 digits", () => {
    expect(typedCode(" 482 913 ")).toBe("482913");
    expect(typedCode("482-913")).toBe("482913");
    for (const bad of ["48291", "4829134", "48291a", "", "４８２９１３"])
      expect(typedCode(bad)).toBeNull();
  });

  it("accept the right code once", () => {
    expect(checkEmailCode(SECRET, stored("482913"), "482913", NOW)).toEqual({ result: "ok" });
    expect(checkEmailCode(SECRET, stored("482913", { consumedAt: NOW }), "482913", NOW)).toEqual({
      result: "used",
    });
  });

  it("count a wrong code as a try, and end after the fifth", () => {
    expect(checkEmailCode(SECRET, stored("482913"), "000000", NOW)).toEqual({
      result: "wrong",
      attemptsLeft: 4,
    });
    expect(checkEmailCode(SECRET, stored("482913", { attempts: 4 }), "000000", NOW)).toEqual({
      result: "wrong",
      attemptsLeft: 0,
    });
    // Out of tries, the right code doesn't work either.
    expect(
      checkEmailCode(
        SECRET,
        stored("482913", { attempts: EMAIL_CODE_MAX_ATTEMPTS }),
        "482913",
        NOW,
      ),
    ).toEqual({ result: "spent" });
    // A malformed code is a wrong one.
    expect(checkEmailCode(SECRET, stored("482913"), "abc", NOW)).toMatchObject({ result: "wrong" });
  });

  it("end at their lifetime, up to the instant and not at it", () => {
    const code = stored("482913", { expiresAt: later(60_000) });
    expect(checkEmailCode(SECRET, code, "482913", later(59_999))).toEqual({ result: "ok" });
    expect(checkEmailCode(SECRET, code, "482913", later(60_000))).toEqual({ result: "expired" });
  });

  it("don't open with a code for another subject or under another AUTH_SECRET", () => {
    expect(
      checkEmailCode(SECRET, stored("482913", { subjectId: "01OTHER" }), "482913", NOW),
    ).toMatchObject({ result: "wrong" });
    expect(
      checkEmailCode("another-secret-another-secret-00000", stored("482913"), "482913", NOW),
    ).toMatchObject({ result: "wrong" });
  });

  it("wait 60 seconds before another code for the same subject", () => {
    expect(
      emailCodeSendable({ lastForSubject: later(-59_000), forAddressLastHour: [] }, NOW),
    ).toEqual({
      ok: false,
      reason: "wait",
      seconds: 1,
    });
    expect(
      emailCodeSendable({ lastForSubject: later(-60_000), forAddressLastHour: [] }, NOW),
    ).toEqual({
      ok: true,
    });
  });

  it("send at most 3 to one address in an hour", () => {
    const three = [later(-50 * 60_000), later(-30 * 60_000), later(-2 * 60_000)];
    expect(emailCodeSendable({ lastForSubject: null, forAddressLastHour: three }, NOW)).toEqual({
      ok: false,
      reason: "hourly",
    });
    // One of them an hour old: it's left the hour.
    expect(
      emailCodeSendable(
        { lastForSubject: null, forAddressLastHour: [later(-60 * 60_000), ...three.slice(1)] },
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it("keep root's lifetime between 5 and 60 minutes, 15 by default", () => {
    expect(emailCodeMinutes(undefined)).toBe(15);
    expect(emailCodeMinutes("30")).toBe(30);
    expect(emailCodeMinutes(1)).toBe(5);
    expect(emailCodeMinutes(999)).toBe(60);
    expect(emailCodeMinutes("7.5")).toBe(15);
  });
});
