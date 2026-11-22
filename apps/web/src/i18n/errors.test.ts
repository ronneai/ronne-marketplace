import { describe, expect, it } from "vitest";
import * as identityErrors from "@/server/domains/identity/exceptions/errors";
import * as itemsErrors from "@/server/domains/items/exceptions/errors";
import * as mailErrors from "@/server/domains/mail/exceptions/errors";
import * as scansErrors from "@/server/domains/scans/exceptions/errors";
import * as settingsErrors from "@/server/domains/settings/exceptions/errors";
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
  TokenLifetimeTooLongError,
  TokenLimitError,
  TokenNameTakenError,
  TokenNotFoundError,
  NoPasswordError,
} = identityErrors;
const {
  InvalidMailSetupError,
  MailHostInternalError,
  MailHostUnresolvedError,
  MailPlainSmtpError,
  MailNotSetUpError,
  MailCredentialsUnreadableError,
  MailTestLimitError,
} = mailErrors;
const { InvalidSignUpSettingError, SignUpUnavailableError } = settingsErrors;

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
      new TokenLifetimeTooLongError(90),
      {
        en: "The longest lifetime is now 90 days.",
        pt: "A validade máxima agora é de 90 dias.",
        fr: "La durée maximale est maintenant de 90 jours.",
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
    // 190: another root answered first.
    [
      new identityErrors.ApprovalAnsweredError("approved"),
      {
        en: "This account was already approved.",
        pt: "Esta conta já foi aprovada.",
        fr: "Ce compte a déjà été approuvé.",
      },
    ],
    [
      new identityErrors.ApprovalAnsweredError("declined"),
      {
        en: "This account was already declined, and is gone.",
        pt: "Esta conta já foi recusada e não existe mais.",
        fr: "Ce compte a déjà été refusé, et n’existe plus.",
      },
    ],
    // 190: the Self-registration panel's errors.
    [
      new InvalidSignUpSettingError("domains"),
      {
        en: "List each email domain once, such as acme.com, up to 100 of them, separated by commas, spaces or lines.",
        pt: "Liste cada domínio de e-mail uma vez, como acme.com, até 100, separados por vírgulas, espaços ou linhas.",
        fr: "Indiquez chaque domaine de courriel une fois, comme acme.com, jusqu’à 100, séparés par des virgules, des espaces ou des lignes.",
      },
    ],
    [
      new InvalidSignUpSettingError("termsUrl"),
      {
        en: "The terms link is an https:// address without a user name, 500 characters at most, or empty.",
        pt: "O link dos termos é um endereço https:// sem nome de usuário, com no máximo 500 caracteres, ou vazio.",
        fr: "Le lien des conditions est une adresse https:// sans nom d’utilisateur, d’au plus 500 caractères, ou vide.",
      },
    ],
    [
      new SignUpUnavailableError("mail"),
      {
        en: "Set up email first: people get a code by email to create an account.",
        pt: "Configure o e-mail primeiro: as pessoas recebem um código por e-mail para criar uma conta.",
        fr: "Configurez d’abord le courriel : les gens reçoivent un code par courriel pour créer un compte.",
      },
    ],
    [
      new SignUpUnavailableError("password"),
      {
        en: "Let everyone sign in with a password first: an account made here signs in with one.",
        pt: "Permita primeiro que todos entrem com senha: uma conta criada aqui entra com uma.",
        fr: "Permettez d’abord à tout le monde de se connecter avec un mot de passe : un compte créé ici se connecte avec un.",
      },
    ],
    // 189: the Email tab's errors, a field's code worded by `InvalidMailSetupError`'s select.
    [
      new InvalidMailSetupError("contact"),
      {
        en: "The instance contact is an email address or an https:// address without a user name, 500 characters at most.",
        pt: "O contato da instância é um endereço de e-mail ou um endereço https:// sem nome de usuário, com no máximo 500 caracteres.",
        fr: "Le contact de l’instance est une adresse courriel ou une adresse https:// sans nom d’utilisateur, d’au plus 500 caractères.",
      },
    ],
    [
      new InvalidMailSetupError("replyTo"),
      {
        en: "Reply-To is an email address, ASCII only, and it's required.",
        pt: "O Reply-To é um endereço de e-mail, só em ASCII, e é obrigatório.",
        fr: "Le Reply-To est une adresse courriel, en ASCII seulement, et il est obligatoire.",
      },
    ],
    [
      new MailHostInternalError(),
      {
        en: "That host is on a private network. A relay there works only once the operator lists it in RONNE_MAIL_HOSTS on the server.",
        pt: "Esse servidor está numa rede privada. Um relay ali só funciona depois que o operador o inclui em RONNE_MAIL_HOSTS no servidor.",
        fr: "Ce serveur est sur un réseau privé. Un relais à cet endroit ne fonctionne qu’une fois que l’opérateur l’a inscrit dans RONNE_MAIL_HOSTS sur le serveur.",
      },
    ],
    [
      new MailHostUnresolvedError(),
      {
        en: "That host name doesn't resolve.",
        pt: "Esse nome de servidor não resolve.",
        fr: "Ce nom de serveur ne se résout pas.",
      },
    ],
    [
      new MailPlainSmtpError(),
      {
        en: "No TLS is only for a relay the operator lists in RONNE_MAIL_HOSTS, and never with a user name and password.",
        pt: "Sem TLS é só para um relay que o operador inclui em RONNE_MAIL_HOSTS, e nunca com nome de usuário e senha.",
        fr: "Sans TLS ne sert qu’à un relais que l’opérateur inscrit dans RONNE_MAIL_HOSTS, et jamais avec un nom d’utilisateur et un mot de passe.",
      },
    ],
    [
      new MailNotSetUpError(),
      {
        en: "Email isn't set up: choose a transport and save first.",
        pt: "O e-mail não está configurado: escolha um transporte e salve primeiro.",
        fr: "Le courriel n’est pas configuré : choisissez un transport et enregistrez d’abord.",
      },
    ],
    [
      new MailCredentialsUnreadableError(),
      {
        en: "The saved credential can't be read (an older AUTH_SECRET): type it again and save.",
        pt: "Não é possível ler a credencial salva (um AUTH_SECRET antigo): digite-a de novo e salve.",
        fr: "L’identifiant enregistré est illisible (un ancien AUTH_SECRET) : tapez-le de nouveau et enregistrez.",
      },
    ],
    [
      new MailTestLimitError(5),
      {
        en: "At most 5 test emails in 10 minutes: wait a few minutes, then try again.",
        pt: "No máximo 5 e-mails de teste em 10 minutos: espere alguns minutos e tente de novo.",
        fr: "Au plus 5 courriels d’essai en 10 minutes : attendez quelques minutes, puis réessayez.",
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
      itemsErrors,
      settingsErrors,
      scansErrors,
      mailErrors,
    ];
    for (const key of Object.keys(en))
      expect(
        domains.some((domain) => typeof domain[key] === "function"),
        key,
      ).toBe(true);
  });
});
