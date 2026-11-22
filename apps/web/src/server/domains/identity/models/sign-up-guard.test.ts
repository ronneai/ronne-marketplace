import { describe, expect, it } from "vitest";
import { solveChallenge } from "@/features/sign-up/solve-challenge";
import {
  CHALLENGE_MS,
  checkChallengeAnswer,
  checkForm,
  formStamp,
  issueChallenge,
  isThrowawayDomain,
  MIN_FILL_MS,
  parseChallengeAnswer,
  signUpDomainAllowed,
} from "./sign-up-guard";

const SECRET = "test-secret-test-secret-test-secret-00";
const NOW = new Date("2026-11-21T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("throwaway and allowed domains (190)", () => {
  it("knows the bundled throwaway domains, and the domains under them", () => {
    expect(isThrowawayDomain("mailinator.com")).toBe(true);
    expect(isThrowawayDomain("MAILINATOR.com")).toBe(true);
    expect(isThrowawayDomain("x.mailinator.com")).toBe(true);
    expect(isThrowawayDomain("gmail.com")).toBe(false);
    expect(isThrowawayDomain("acme.com")).toBe(false);
  });

  it("refuses a throwaway address with Any domain, and only when root blocks them", () => {
    expect(
      signUpDomainAllowed({ domains: "any", blockThrowaway: true }, "bot@mailinator.com"),
    ).toBe(false);
    expect(
      signUpDomainAllowed({ domains: "any", blockThrowaway: false }, "bot@mailinator.com"),
    ).toBe(true);
    expect(signUpDomainAllowed({ domains: "any", blockThrowaway: true }, "ana@acme.com")).toBe(
      true,
    ); // Trailing dots and spaces still reach the throwaway provider: read as it does.
    for (const address of [
      "bot@mailinator.com.",
      "bot@mailinator.com ",
      " bot@MAILINATOR.com..",
      "bot@x.mailinator.com.",
      "bot@.",
    ])
      expect(signUpDomainAllowed({ domains: "any", blockThrowaway: true }, address), address).toBe(
        false,
      );
  });

  it("ignores the throwaway list with an allow list, which matches domains exactly", () => {
    const listed = { domains: ["acme.com", "mailinator.com"], blockThrowaway: true };
    expect(signUpDomainAllowed(listed, "ana@acme.com")).toBe(true);
    expect(signUpDomainAllowed(listed, "ana@ACME.com")).toBe(true);
    expect(signUpDomainAllowed(listed, "ana@eu.acme.com")).toBe(false);
    expect(signUpDomainAllowed(listed, "ana@acme.com.evil.example")).toBe(false);
    expect(signUpDomainAllowed(listed, "ana@acme.com.")).toBe(true);
    // Root's own entries are read as delivery reads them too.
    for (const entry of ["EXAMPLE.com.", "ｅxample.com", "example。com"])
      expect(
        signUpDomainAllowed({ domains: [entry], blockThrowaway: true }, "a@example.com"),
        entry,
      ).toBe(true);
    // A domain root typed with spaces around it still matches.
    expect(
      signUpDomainAllowed({ domains: [" acme.com "], blockThrowaway: true }, "ana@acme.com"),
    ).toBe(true);
    // Root listed it, so it's allowed: the throwaway list is for Any domain only.
    expect(signUpDomainAllowed(listed, "x@mailinator.com")).toBe(true);
    // A listed `*` or `any` is a domain of that name, never a wildcard.
    expect(
      signUpDomainAllowed({ domains: ["*", "any"], blockThrowaway: true }, "ana@acme.com"),
    ).toBe(false);
    // An empty list lets no domain in.
    expect(signUpDomainAllowed({ domains: [], blockThrowaway: false }, "ana@acme.com")).toBe(false);
    expect(signUpDomainAllowed(listed, "no-at-sign")).toBe(false);
  });
});

describe("the form's stamp and honeypot (190)", () => {
  const stamp = formStamp(SECRET, NOW);

  it("takes a form filled in 3 seconds or more, with the honeypot empty", () => {
    expect(checkForm(SECRET, { stamp, honeypot: "" }, later(MIN_FILL_MS))).toBe("ok");
    expect(checkForm(SECRET, { stamp, honeypot: undefined }, later(60_000))).toBe("ok");
  });

  it("calls a filled honeypot, a fast post or a forged stamp a bot", () => {
    expect(checkForm(SECRET, { stamp, honeypot: "https://spam.example" }, later(10_000))).toBe(
      "bot",
    );
    expect(checkForm(SECRET, { stamp, honeypot: ["x"] }, later(10_000))).toBe("bot");
    expect(checkForm(SECRET, { stamp, honeypot: "" }, later(MIN_FILL_MS - 1))).toBe("bot");
    const [, signature] = stamp.split(".");
    // Backdated: the signature no longer matches.
    expect(
      checkForm(SECRET, { stamp: `${NOW.getTime() - 60_000}.${signature}`, honeypot: "" }, NOW),
    ).toBe("bot");
    expect(
      checkForm("another-secret-another-secret-00000", { stamp, honeypot: "" }, later(10_000)),
    ).toBe("bot");
    for (const bad of [undefined, "", "123", "abc.def", `${NOW.getTime()}.zz`, `${stamp}.x`])
      expect(checkForm(SECRET, { stamp: bad, honeypot: "" }, later(10_000)), String(bad)).toBe(
        "bot",
      );
  });

  it("calls a form older than an hour stale", () => {
    expect(checkForm(SECRET, { stamp, honeypot: "" }, later(60 * 60_000 + 1))).toBe("stale");
  });
});

describe("the proof of work (190)", () => {
  it("accepts a real solve, found by the browser's solver", async () => {
    const challenge = issueChallenge(SECRET, NOW, 5000);
    const number = await solveChallenge(challenge);
    expect(number).not.toBeNull();
    const answer = parseChallengeAnswer(JSON.stringify({ challenge, number }));
    expect(answer).not.toBeNull();
    const check = checkChallengeAnswer(SECRET, answer as NonNullable<typeof answer>, later(5000));
    expect(check).toMatchObject({
      result: "ok",
      expiresAt: new Date(NOW.getTime() + CHALLENGE_MS),
    });
    expect((check as { challengeHmac: string }).challengeHmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a wrong answer, an expired challenge and a challenge changed or not signed here", async () => {
    const challenge = issueChallenge(SECRET, NOW, 2000);
    const number = (await solveChallenge(challenge)) as number;
    expect(checkChallengeAnswer(SECRET, { challenge, number: (number + 1) % 2001 }, NOW)).toEqual({
      result: "wrong",
    });
    expect(checkChallengeAnswer(SECRET, { challenge, number: -1 }, NOW)).toEqual({
      result: "wrong",
    });
    expect(checkChallengeAnswer(SECRET, { challenge, number }, later(CHALLENGE_MS))).toEqual({
      result: "expired",
    });
    for (const changed of [
      { ...challenge, maxNumber: 10 },
      { ...challenge, expires: challenge.expires + 60_000 },
      { ...challenge, salt: `${challenge.salt}0` },
      { ...challenge, signature: "00".repeat(32) },
    ])
      expect(checkChallengeAnswer(SECRET, { challenge: changed, number }, NOW)).toEqual({
        result: "invalid",
      });
    expect(
      checkChallengeAnswer("another-secret-another-secret-00000", { challenge, number }, NOW),
    ).toEqual({ result: "invalid" });
  });

  it("reads only a well-formed answer", () => {
    const challenge = issueChallenge(SECRET, NOW);
    for (const bad of [
      undefined,
      "",
      "{",
      "[]",
      JSON.stringify({ challenge }),
      JSON.stringify({ number: 1 }),
      "x".repeat(2001),
    ])
      expect(parseChallengeAnswer(bad), String(bad).slice(0, 20)).toBeNull();
    expect(parseChallengeAnswer(JSON.stringify({ challenge, number: 1.5 }))).toBeNull();
  });

  it("gives the same HMAC for one challenge however it's answered, so a replay is found", async () => {
    const challenge = issueChallenge(SECRET, NOW, 1000);
    const number = (await solveChallenge(challenge)) as number;
    const a = checkChallengeAnswer(SECRET, { challenge, number }, NOW);
    const b = checkChallengeAnswer(SECRET, { challenge, number }, later(1000));
    expect((a as { challengeHmac: string }).challengeHmac).toBe(
      (b as { challengeHmac: string }).challengeHmac,
    );
  });

  it("refuses a signature changed in any way, even one Node.js would decode the same", async () => {
    const challenge = issueChallenge(SECRET, NOW, 500);
    const number = (await solveChallenge(challenge)) as number;
    for (const signature of [
      `${challenge.signature}0`,
      `${challenge.signature}zz`,
      challenge.signature.toUpperCase(),
      ` ${challenge.signature}`,
    ])
      expect(
        checkChallengeAnswer(SECRET, { challenge: { ...challenge, signature }, number }, NOW),
      ).toEqual({
        result: "invalid",
      });
  });

  it("reads an answer with exactly the fields Ronne sends, and nothing more", async () => {
    const challenge = issueChallenge(SECRET, NOW, 500);
    expect(
      parseChallengeAnswer(JSON.stringify({ challenge: { ...challenge, extra: 1 }, number: 1 })),
    ).toBeNull();
    expect(parseChallengeAnswer(JSON.stringify({ challenge, number: 1, extra: 1 }))).toBeNull();
  });

  it("draws a fresh random salt and secret number for every challenge", async () => {
    const many = Array.from({ length: 50 }, () => issueChallenge(SECRET, NOW, 50_000));
    expect(new Set(many.map((c) => c.salt)).size).toBe(50);
    expect(new Set(many.map((c) => c.challenge)).size).toBe(50);
    for (const c of many) expect(c.salt).toMatch(/^[0-9a-f]{24}$/);
    // The secret numbers themselves vary: not one answer for every challenge.
    const small = Array.from({ length: 20 }, () => issueChallenge(SECRET, NOW, 200));
    const numbers = await Promise.all(small.map((c) => solveChallenge(c)));
    expect(new Set(numbers).size).toBeGreaterThan(5);
  });
});

describe("hardening (190)", () => {
  it("refuses a stamp whose signature has anything added or changed", () => {
    const stamp = formStamp(SECRET, NOW);
    for (const bad of [`${stamp}zz`, `${stamp}0`, stamp.toUpperCase()])
      expect(checkForm(SECRET, { stamp: bad, honeypot: "" }, later(10_000)), bad.slice(-6)).toBe(
        "bot",
      );
  });

  it("reads a domain as mail delivery does: full-width letters and the ideographic stop are the same domain", () => {
    for (const address of ["a@ｍailinator.com", "a@0-mailer.dynv6。net", "a@MAILINATOR．COM"])
      expect(signUpDomainAllowed({ domains: "any", blockThrowaway: true }, address), address).toBe(
        false,
      );
    expect(
      signUpDomainAllowed({ domains: ["acme.com"], blockThrowaway: true }, "a@ａcme.com"),
    ).toBe(true);
    expect(
      signUpDomainAllowed({ domains: ["acme.com"], blockThrowaway: true }, "a@acme。com"),
    ).toBe(true);
  });

  it("refuses a name longer than a domain can be, at once", () => {
    const started = performance.now();
    expect(
      signUpDomainAllowed({ domains: "any", blockThrowaway: true }, `a@${"a.".repeat(30_000)}com`),
    ).toBe(false);
    expect(
      signUpDomainAllowed({ domains: "any", blockThrowaway: true }, `a@${"a".repeat(254)}.com`),
    ).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
    // Trailing dots past 1,024 characters don't make an allowed domain out of a long name.
    expect(
      signUpDomainAllowed(
        { domains: ["acme.com"], blockThrowaway: true },
        `a@acme.com${".".repeat(2000)}`,
      ),
    ).toBe(false);
  });
});
