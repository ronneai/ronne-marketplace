import { describe, expect, it } from "vitest";
import {
  accountRulesFromRows,
  accountRulesRows,
  DEFAULT_ACCOUNT_RULES,
  emailDomain,
  isDomainBlocked,
  MAX_BLOCKED_DOMAINS,
  normalizeBlockedDomain,
  parseBlockedDomains,
} from "./account-rules";

describe("normalizeBlockedDomain (191)", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["@acme.com", "acme.com"],
    ["ACME.COM.", "acme.com"],
    ["  Eu.Acme.Com  ", "eu.acme.com"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
    ["privaterelay.appleid.com", "privaterelay.appleid.com"],
  ])("keeps %j as %j", (typed, kept) => {
    expect(normalizeBlockedDomain(typed)).toBe(kept);
  });

  it.each([
    ["bücher.example", "not plain ASCII"],
    ["ａｃｍｅ.com", "full-width letters"],
    ["\u212Aacme.com", "the Kelvin sign, which lowercases to k"],
    ["localhost", "one label"],
    ["*.acme.com", "a wildcard"],
    ["1.2.3.4", "an address"],
    ["acme.123", "a last label of digits"],
    ["-acme.com", "a label starting with -"],
    ["acme..com", "an empty label"],
    ["acme.com..", "two final dots"],
    ["ana@acme.com", "an email"],
    ["", "nothing"],
    [`${"a".repeat(64)}.com`, "a label past 63"],
    [`${"a.".repeat(130)}com`, "past 253"],
  ])("refuses %j (%s)", (typed) => {
    expect(normalizeBlockedDomain(typed)).toBeNull();
  });
});

describe("parseBlockedDomains", () => {
  it("splits on commas, semicolons, spaces and lines, once each, in order", () => {
    expect(parseBlockedDomains("yahoo.com, @MAILINATOR.com;\nacme.org  yahoo.com.")).toEqual({
      ok: true,
      domains: ["yahoo.com", "mailinator.com", "acme.org"],
    });
  });

  it("an empty text is an empty list", () => {
    expect(parseBlockedDomains("  \n ")).toEqual({ ok: true, domains: [] });
  });

  it("names the first entry that isn't a domain", () => {
    expect(parseBlockedDomains("acme.com, *.evil.com, x")).toEqual({
      ok: false,
      invalid: "*.evil.com",
    });
  });

  it("refuses more than the most it keeps", () => {
    const many = Array.from({ length: MAX_BLOCKED_DOMAINS + 1 }, (_, i) => `d${i}.example`);
    expect(parseBlockedDomains(many.join("\n")).ok).toBe(false);
    expect(parseBlockedDomains(many.slice(1).join("\n")).ok).toBe(true);
  });
});

describe("isDomainBlocked", () => {
  const rules = { blockedDomains: ["acme.org", "xn--bcher-kva.example"], damaged: false };

  it("matches the email's domain exactly, any case, with or without a final dot", () => {
    expect(isDomainBlocked(rules, "sam@acme.org")).toBe(true);
    expect(isDomainBlocked(rules, "Sam@ACME.org.")).toBe(true);
    expect(isDomainBlocked(rules, "sam@eu.acme.org")).toBe(false);
    expect(isDomainBlocked(rules, "sam@acme.org.uk")).toBe(false);
    expect(isDomainBlocked(rules, "sam@notacme.org")).toBe(false);
  });

  it("meets a non-ASCII domain at its xn-- entry", () => {
    expect(isDomainBlocked(rules, "ana@bücher.example")).toBe(true);
  });

  it("uses the part after the last @", () => {
    expect(isDomainBlocked(rules, '"a@gmail.com"@acme.org')).toBe(true);
    expect(isDomainBlocked(rules, '"a@acme.org"@gmail.com')).toBe(false);
  });

  it("keeps out an email with no domain, and everything while the list is damaged", () => {
    expect(isDomainBlocked(rules, "nobody")).toBe(true);
    expect(isDomainBlocked({ blockedDomains: [], damaged: true }, "ana@gmail.com")).toBe(true);
  });

  it("an empty list blocks nothing", () => {
    expect(isDomainBlocked(DEFAULT_ACCOUNT_RULES, "ana@gmail.com")).toBe(false);
  });

  it("emailDomain reads the domain as delivery does", () => {
    expect(emailDomain(" Ana@ACME.com. ")).toBe("acme.com");
    expect(emailDomain("@acme.com")).toBe("");
  });
});

describe("accountRulesFromRows and accountRulesRows", () => {
  it("nothing stored is the default: an empty list, throwaway blocked, version 0", () => {
    expect(accountRulesFromRows({})).toEqual(DEFAULT_ACCOUNT_RULES);
  });

  it("reads back what it writes", () => {
    const rows = accountRulesRows({
      blockedDomains: ["yahoo.com"],
      blockThrowaway: false,
      version: 7,
    });
    expect(
      accountRulesFromRows({
        blockedDomains: rows.blocked_domains,
        version: rows.account_rules_version,
        blockThrowaway: rows.sign_up_block_throwaway,
      }),
    ).toEqual({ blockedDomains: ["yahoo.com"], damaged: false, blockThrowaway: false, version: 7 });
  });

  it.each([["not json"], ['"any"'], ["[1]"], ['["*.evil.com"]'], ["{}"]])(
    "a stored list it can't read (%j) is damaged, and blocks everything",
    (stored) => {
      const rules = accountRulesFromRows({ blockedDomains: stored });
      expect(rules.damaged).toBe(true);
      expect(isDomainBlocked(rules, "ana@gmail.com")).toBe(true);
    },
  );

  it("an unreadable version is 0", () => {
    expect(accountRulesFromRows({ version: "x" }).version).toBe(0);
    expect(accountRulesFromRows({ version: "-3" }).version).toBe(0);
  });
});
