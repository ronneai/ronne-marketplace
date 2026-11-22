import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGN_UP_POLICY,
  SIGN_UP_KEYS,
  signUpPolicyFromRows,
  signUpPolicyRows,
} from "./sign-up-policy";

describe("the sign-up policy (190)", () => {
  it("reads as off, any domain, no approval, throwaway blocked, 15 minutes, challenge on, with nothing stored", () => {
    expect(signUpPolicyFromRows({})).toEqual({
      enabled: false,
      domains: "any",
      approval: false,
      blockThrowaway: true,
      codeMinutes: 15,
      challenge: true,
      termsUrl: "",
      termsVersion: "",
      termsRequiredVersion: "",
    });
  });

  it("reads what root saved, and its default for anything unreadable", () => {
    expect(
      signUpPolicyFromRows({
        enabled: "on",
        domains: '["acme.com","acme.co.uk"]',
        approval: "on",
        blockThrowaway: "off",
        codeMinutes: "30",
        challenge: "off",
        termsUrl: "https://acme.com/terms",
        termsVersion: "2026-11",
        termsRequiredVersion: "2026-11",
      }),
    ).toEqual({
      enabled: true,
      domains: ["acme.com", "acme.co.uk"],
      approval: true,
      blockThrowaway: false,
      codeMinutes: 30,
      challenge: false,
      termsUrl: "https://acme.com/terms",
      termsVersion: "2026-11",
      termsRequiredVersion: "2026-11",
    });
    expect(
      signUpPolicyFromRows({ enabled: "yes", domains: "{nope", codeMinutes: "999" }),
    ).toMatchObject({ enabled: false, domains: [], codeMinutes: 60 });
  });

  it("fails closed on a damaged or empty domain list: no domain, never any", () => {
    for (const stored of ['["acme.com"', "[]", '[""]', '"some"', "42", "{}", "", " "])
      expect(signUpPolicyFromRows({ domains: stored }).domains, stored).toEqual([]);
    expect(signUpPolicyFromRows({ domains: '["acme.com", "", 7]' }).domains).toEqual(["acme.com"]);
    expect(signUpPolicyFromRows({ domains: '"any"' }).domains).toBe("any");
    expect(signUpPolicyFromRows({ domains: null }).domains).toBe("any");
  });

  it("round-trips through its rows, one per key", () => {
    const policy = { ...DEFAULT_SIGN_UP_POLICY, enabled: true, domains: ["acme.com"] };
    const rows = signUpPolicyRows(policy);
    expect(Object.keys(rows).sort()).toEqual(Object.values(SIGN_UP_KEYS).sort());
    expect(
      signUpPolicyFromRows({
        enabled: rows.sign_up_enabled,
        domains: rows.sign_up_domains,
        approval: rows.sign_up_approval,
        blockThrowaway: rows.sign_up_block_throwaway,
        codeMinutes: rows.email_code_minutes,
        challenge: rows.sign_up_challenge,
        termsUrl: rows.terms_url,
        termsVersion: rows.terms_version,
        termsRequiredVersion: rows.terms_required_version,
      }),
    ).toEqual(policy);
  });
});
