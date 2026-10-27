import { describe, expect, it } from "vitest";
import * as i from "@/server/domains/identity/exceptions/errors";
import * as items from "@/server/domains/items/exceptions/errors";
import * as s from "@/server/domains/settings/exceptions/errors";
import { inLocale } from "@/test/intl";
import { errorText } from "./errors";

/**
 * The identity and settings errors the admin screens show (feature 132): each reads in the three
 * languages, English is the error's own message word for word (so the API's stays as it was), and
 * the values it carries land in the sentence.
 */
type L = "en" | "pt" | "fr";
const text = (locale: L, error: Error) => inLocale(locale, () => errorText(error));

/** One of each class and of each of its variants, with the values that show up in the sentence. */
const CASES: [Error, string[]][] = [
  [new i.InvalidEmailError("a@b"), ["a@b"]],
  [new i.InvalidNameError(), ["255"]],
  [new i.InvalidPasswordError("too_short", 12), ["12"]],
  [new i.InvalidPasswordError("too_long", 128), ["128"]],
  [new i.UserErasedError(), []],
  [new i.EraseConfirmationError(), []],
  [new i.EmailTakenError("a@b.c"), ["a@b.c"]],
  [new i.CannotModifySelfError(), []],
  [new i.LastRootError(), []],
  [new i.InvalidRoleError("boss"), ["boss"]],
  [new i.InvalidProviderIdError("x"), ["32"]],
  [new i.ProviderIdTakenError("acme"), ["acme"]],
  [new i.InvalidProviderDomainsError("not a domain"), ["not a domain"]],
  [new i.InvalidProviderDomainsError(""), ["example.com"]],
  [new i.InvalidProviderNameError(), ["100"]],
  [new i.UnknownProviderTypeError("saml"), ["saml"]],
  [new i.ProviderNotFoundError(), []],
  [new i.ProviderNotTestedError(), []],
  [new i.StaleProviderError(new Date()), []],
  [new i.ScimOffError(), []],
  [new i.ScimTokenExistsError(), []],
  [new i.NoScimTokenError(), []],
  [new i.ProviderSecretUnreadableError(), ["AUTH_SECRET"]],
  [new i.InvalidGroupMappingError("group"), ["255"]],
  [new i.InvalidGroupMappingError("role"), []],
  [new i.InvalidGroupMappingError("workspace"), []],
  [new i.InvalidGroupMappingError("personal"), []],
  [new items.InvalidScopeNameError("empty"), []],
  [new items.InvalidScopeNameError("too_long"), ["64"]],
  [new items.InvalidScopeNameError("characters"), []],
  [new items.InvalidScopeNameError("edges"), []],
  [new items.InvalidScopeNameError("reserved"), []],
  [new items.InvalidScopeDescriptionError(), ["300"]],
  [new items.ScopeNameTakenError("platform"), ["@platform"]],
  [new items.ScopeWorkspaceNotFoundError(), []],
  [new items.ScopeNotFoundError(), []],
  [new s.InvalidUsagePolicyError(), []],
  [new s.InvalidUsageMinimumError(), []],
  [new s.InvalidRetentionError("ipDays"), []],
  [new s.InvalidRetentionError("sessionsDays"), []],
  [new s.InvalidRetentionError("feedbackDays"), []],
  [new s.InvalidTwoFactorPolicyError(), []],
  [new s.InvalidPasswordSignInPolicyError(), []],
  [new s.NoUsableProviderError(), []],
  [new s.ConfirmationNeededError(), []],
];

describe("the admin screens' domain errors in three languages (132)", () => {
  it("English is the error's own message, word for word", async () => {
    for (const [error] of CASES)
      expect(await text("en", error), `${error.name}: ${error.message}`).toBe(error.message);
  });

  it("Portuguese and French are not the English message", async () => {
    for (const [error] of CASES)
      for (const locale of ["pt", "fr"] as const)
        expect(await text(locale, error), `${locale} ${error.name}`).not.toBe(error.message);
  });

  it("the values the error carries land in the sentence, in every language", async () => {
    for (const [error, values] of CASES)
      for (const locale of ["en", "pt", "fr"] as const) {
        const said = await text(locale, error);
        for (const value of values) expect(said, `${locale} ${error.name}`).toContain(value);
        expect(said, `${locale} ${error.name}`).not.toMatch(/[{}]|errors\./);
      }
  });

  it("a value that looks like a placeholder is shown as typed", async () => {
    for (const locale of ["en", "pt", "fr"] as const) {
      expect(await text(locale, new i.EmailTakenError("{x}@b.c")), locale).toContain("{x}@b.c");
      expect(await text(locale, new i.InvalidRoleError("<b>{count}</b>")), locale).toContain(
        "<b>{count}</b>",
      );
    }
  });

  it("the variants of one class read differently", async () => {
    for (const locale of ["en", "pt", "fr"] as const) {
      const reasons = [
        await text(locale, new i.InvalidPasswordError("too_short", 12)),
        await text(locale, new i.InvalidPasswordError("too_long", 12)),
      ];
      expect(new Set(reasons).size, locale).toBe(2);
      const groups = await Promise.all(
        (["group", "role", "workspace", "personal"] as const).map((reason) =>
          text(locale, new i.InvalidGroupMappingError(reason)),
        ),
      );
      expect(new Set(groups).size, locale).toBe(4);
      const retention = await Promise.all(
        (["ipDays", "sessionsDays", "feedbackDays"] as const).map((which) =>
          text(locale, new s.InvalidRetentionError(which)),
        ),
      );
      expect(new Set(retention).size, locale).toBe(3);
    }
  });

  it("the API's messages are what they were (the classes that gained a field)", () => {
    expect(new i.InvalidPasswordError("too_short", 12).message).toBe(
      "The password needs at least 12 characters.",
    );
    expect(new i.InvalidPasswordError("too_long", 128).message).toBe(
      "The password can have at most 128 characters.",
    );
    expect(new i.InvalidProviderDomainsError("x y").message).toBe(
      '"x y" isn\'t an email domain. Write domains like example.com, separated by commas.',
    );
    expect(new i.InvalidProviderDomainsError("").message).toBe(
      "Write email domains like example.com, separated by commas.",
    );
    expect(new s.InvalidRetentionError("ipDays").message).toBe(
      "IP addresses are kept for a whole number of days from 1 to 3,650.",
    );
    expect(new s.InvalidRetentionError("sessionsDays").message).toBe(
      "Expired sessions are kept for a whole number of days from 1 to 3,650.",
    );
    expect(new s.InvalidRetentionError("feedbackDays").message).toBe(
      "Handled feedback are kept for a whole number of days from 1 to 3,650.",
    );
  });

  it("the classes the admin screens do not show keep their English", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const config = new i.InvalidProviderConfigError({ issuer: "Enter the issuer." });
      expect(await text(locale, config)).toBe("Enter the issuer.");
      const noRoot = new i.RootNotFoundError();
      expect(await text(locale, noRoot)).toBe(noRoot.message);
    }
  });
});
