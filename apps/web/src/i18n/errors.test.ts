import { describe, expect, it } from "vitest";
import * as identityErrors from "@/server/domains/identity/exceptions/errors";
import * as shelvesErrors from "@/server/domains/shelves/exceptions/errors";
import * as submissionsErrors from "@/server/domains/submissions/exceptions/errors";
import * as workspacesErrors from "@/server/domains/workspaces/exceptions/errors";
import { inLocale } from "@/test/intl";
import { errorText } from "./errors";

const en = (await import("../../messages/en/errors.json")).default;
const pt = (await import("../../messages/pt/errors.json")).default;
const fr = (await import("../../messages/fr/errors.json")).default;

const {
  ForbiddenError,
  InvalidTokenNameError,
  InvalidTokenLifetimeError,
  TokenLimitError,
  TokenNameTakenError,
  TokenNotFoundError,
  NoPasswordError,
} = identityErrors;

type L = "en" | "pt" | "fr";
const text = (locale: L, error: Error) => inLocale(locale, () => errorText(error));

describe("domain errors in three languages (129)", () => {
  const cases: [Error, Record<L, string>][] = [
    [
      new ForbiddenError("users.manage"),
      {
        en: "You don't have permission to do this (users.manage).",
        pt: "Você não tem permissão para fazer isto (users.manage).",
        fr: "Vous n’avez pas la permission de faire cela (users.manage).",
      },
    ],
    [
      new InvalidTokenNameError(),
      {
        en: "A token name needs 1 to 100 characters.",
        pt: "O nome de um token precisa ter de 1 a 100 caracteres.",
        fr: "Le nom d’un jeton doit contenir de 1 à 100 caractères.",
      },
    ],
    [
      new InvalidTokenLifetimeError("7"),
      {
        en: '"7" isn\'t a token lifetime. Use 30, 90 or 365 days, or no expiry.',
        pt: '"7" não é uma duração de token. Use 30, 90 ou 365 dias, ou sem expiração.',
        fr: "« 7 » n’est pas une durée de jeton. Utilisez 30, 90 ou 365 jours, ou sans expiration.",
      },
    ],
    [
      new TokenLimitError(50),
      {
        en: "You have 50 active tokens, the most allowed. Revoke an old token first.",
        pt: "Você tem 50 tokens ativos, o máximo permitido. Revogue um token antigo primeiro.",
        fr: "Vous avez 50 jetons actifs, le maximum permis. Révoquez d’abord un ancien jeton.",
      },
    ],
    [
      new TokenNameTakenError("ci"),
      {
        en: 'You already have an active token named "ci".',
        pt: 'Você já tem um token ativo chamado "ci".',
        fr: "Vous avez déjà un jeton actif nommé « ci ».",
      },
    ],
    [
      new TokenNotFoundError(),
      {
        en: "That token doesn't exist, or isn't yours.",
        pt: "Esse token não existe, ou não é seu.",
        fr: "Ce jeton n’existe pas, ou ne vous appartient pas.",
      },
    ],
    [
      new NoPasswordError(),
      {
        en: "That account has no password (it signs in with a provider), so there is none to replace.",
        pt: "Esta conta não tem senha (ela entra por um provedor), então não há senha para trocar.",
        fr: "Ce compte n’a pas de mot de passe (il se connecte par un fournisseur); il n’y a donc rien à remplacer.",
      },
    ],
  ];

  it.each(cases)("%s: each language says its own words", async (error, expected) => {
    for (const locale of ["en", "pt", "fr"] as const)
      expect(await text(locale, error), `${error.name} in ${locale}`).toBe(expected[locale]);
  });

  it("English is the error's own message, word for word", async () => {
    for (const [error] of cases) expect(await text("en", error)).toBe(error.message);
  });

  it("an error nobody translated shows its English message, in every language", async () => {
    class SomethingNewError extends identityErrors.IdentityError {
      override readonly name: string = "SomethingNewError";
      constructor(readonly count: number) {
        super(`Something new went wrong ${count} times.`);
      }
    }
    for (const locale of ["en", "pt", "fr"] as const)
      expect(await text(locale, new SomethingNewError(3))).toBe(
        "Something new went wrong 3 times.",
      );
    // A plain Error, and one whose name is a prototype property, are not looked up as keys.
    expect(await text("pt", new Error("plain"))).toBe("plain");
    const odd = Object.assign(new Error("odd"), { name: "toString" });
    expect(await text("fr", odd)).toBe("odd");
    for (const name of ["constructor", "__proto__", "hasOwnProperty", "A.b", "X".repeat(81)])
      expect(await text("pt", Object.assign(new Error("m"), { name })), name).toBe("m");
  });

  it("a known error missing a value it needs shows its English message, never a key", async () => {
    for (const locale of ["en", "pt", "fr"] as const) {
      for (const limit of [undefined, null, { a: 1 }, [1], () => 1]) {
        const broken = Object.assign(new Error("You have too many tokens."), {
          name: "TokenLimitError",
          limit,
        });
        expect(await text(locale, broken), `${locale} ${String(limit)}`).toBe(
          "You have too many tokens.",
        );
      }
    }
  });

  it("every key is a real error class of a domain, with the same keys in each language", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    const domains: Record<string, unknown>[] = [
      identityErrors,
      workspacesErrors,
      submissionsErrors,
      shelvesErrors,
    ];
    for (const key of Object.keys(en))
      expect(
        domains.some((domain) => typeof domain[key] === "function"),
        key,
      ).toBe(true);
  });
});
