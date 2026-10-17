import { describe, expect, it } from "vitest";
import { InvalidProviderDomainsError, InvalidProviderIdError } from "../exceptions/errors";
import {
  checkProviderId,
  emailInDomains,
  type IdentityProvider,
  parseDomains,
  providerStatus,
  redirectUriFor,
} from "./identity-provider";

describe("provider ids", () => {
  it.each(["abc", "acme", "okta-prod", "a1-b2", "x".repeat(32)])("accepts %s", (id) => {
    expect(checkProviderId(id)).toBe(id);
  });

  it.each([
    "ab",
    "x".repeat(33),
    "Acme",
    "-acme",
    "acme-",
    "ac_me",
    "ac me",
    "acmé",
    "credential",
    "new",
    "",
    42,
    null,
  ])("refuses %s", (id) => {
    expect(() => checkProviderId(id)).toThrow(InvalidProviderIdError);
  });
});

describe("email domains", () => {
  it("lowercases, trims, drops an @ and duplicates, and splits on commas and spaces", () => {
    expect(parseDomains(" Acme.com, @example.org  acme.com,,")).toEqual([
      "acme.com",
      "example.org",
    ]);
    expect(parseDomains(["a.co", "B.CO"])).toEqual(["a.co", "b.co"]);
  });

  it("is empty when nothing is listed", () => {
    expect(parseDomains("")).toEqual([]);
    expect(parseDomains(undefined)).toEqual([]);
  });

  it.each(["acme", "acme..com", "-acme.com", "acme.c", "a@b.com", "acme.com/x"])(
    "refuses %s",
    (value) => {
      expect(() => parseDomains(value)).toThrow(InvalidProviderDomainsError);
    },
  );

  it("matches an email's domain exactly, not a subdomain or a suffix", () => {
    expect(emailInDomains("ana@Acme.com", ["acme.com"])).toBe(true);
    expect(emailInDomains("ana@eu.acme.com", ["acme.com"])).toBe(false);
    expect(emailInDomains("ana@notacme.com", ["acme.com"])).toBe(false);
    expect(emailInDomains("acme.com", ["acme.com"])).toBe(false);
  });
});

describe("the panel's status", () => {
  const base: IdentityProvider = {
    id: "acme",
    type: "oidc",
    preset: "okta",
    name: "Acme",
    enabled: false,
    config: {},
    hasSecret: true,
    domains: [],
    linkByEmail: true,
    groupsClaim: null,
    testedAt: null,
    testedBy: null,
    lastSignedInAt: null,
    failures: 0,
    lastFailureAt: null,
    lastFailureReason: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  it("is off, tested, on, or failing", () => {
    expect(providerStatus(base)).toBe("off");
    expect(providerStatus({ ...base, testedAt: new Date() })).toBe("tested");
    expect(providerStatus({ ...base, testedAt: new Date(), enabled: true })).toBe("on");
    expect(providerStatus({ ...base, enabled: true, failures: 3 })).toBe("failing");
    expect(providerStatus({ ...base, enabled: true, failures: 2 })).toBe("on");
  });
});

it("builds the redirect URI from PUBLIC_URL", () => {
  expect(redirectUriFor("https://ronne.example/", "acme")).toBe(
    "https://ronne.example/api/auth/sso/callback/acme",
  );
});
