import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/sign-in/actions", () => ({
  signInFromForm: vi.fn(),
  ssoFromForm: vi.fn(),
  twoFactorFromForm: vi.fn(),
}));
vi.mock("@/features/device/actions", () => ({ deviceCodeFromForm: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));

const { inLocale } = await import("@/test/intl");
const { SignInPage } = await import("./SignInPage");
const { SignInForm } = await import("./SignInForm");
const { TwoFactorStep } = await import("./TwoFactorStep");
const { DevicePage } = await import("../device/DevicePage");
const { DeviceFlow } = await import("../device/DeviceFlow");
const english = (await import("../../../messages/en/auth.json")).default;
const owned = {
  pt: (await import("../../../messages/pt/auth.json")).default,
  fr: (await import("../../../messages/fr/auth.json")).default,
};

type L = "en" | "pt" | "fr";
const view = (locale: L, node: ReactElement) => inLocale(locale, () => renderToStaticMarkup(node));
const each = (cases: Record<L, string[]>, render: (locale: L) => string) => {
  for (const [locale, expected] of Object.entries(cases) as [L, string[]][]) {
    const html = render(locale);
    for (const text of expected) expect(html, `${locale}: ${text}`).toContain(text);
  }
};

describe("sign-in in three languages (129)", () => {
  it("the page: heading, the way to sign in, the form, and the language links", () => {
    each(
      {
        en: [
          "Sign in to Ronne AI Marketplace",
          "Use your email and password",
          ">Sign in<",
          "Forgot?",
        ],
        pt: [
          "Entrar no Ronne AI Marketplace",
          "Use o seu e-mail e senha",
          ">Entrar<",
          ">E-mail<",
          ">Senha<",
          "Esqueceu?",
          "Lembrar de mim (30 dias)",
        ],
        fr: [
          "Connexion à Ronne AI Marketplace",
          ">Courriel<",
          ">Mot de passe<",
          "Utilisez votre courriel et votre mot de passe",
          ">Se connecter<",
          "Oublié?",
          "Se souvenir de moi (30 jours)",
        ],
      },
      (l) =>
        view(
          l,
          <SignInPage next="/" resetCommand="rmk-server reset-root-password" here="/sign-in" />,
        ),
    );
    // The switch is on the page, each language in its own words.
    const html = view("pt", <SignInPage next="/" resetCommand="x" here="/sign-in?next=%2Fitems" />);
    expect(html).toContain("English");
    expect(html).toContain("Português");
    expect(html).toContain("Français");
    expect(html).toContain("/language?set=fr&amp;next=%2Fsign-in%3Fnext%3D%252Fitems");
  });

  it("with identity providers, Root only, and a provider's answer", () => {
    each(
      {
        en: [
          "Continue with Acme SSO",
          "Use your password (root)",
          "Use your company&#x27;s sign-in",
        ],
        pt: ["Continuar com Acme SSO", "Use a sua senha (root)", "Use o login da sua empresa"],
        fr: [
          "Continuer avec Acme SSO",
          "Utiliser votre mot de passe (root)",
          "Utilisez la connexion de votre entreprise",
        ],
      },
      (l) =>
        view(
          l,
          <SignInPage
            next="/"
            resetCommand="x"
            providers={[{ id: "acme", name: "Acme SSO" }]}
            rootOnly
            ssoError="provider_error"
          />,
        ),
    );
    each(
      {
        en: ["That provider didn&#x27;t answer"],
        pt: ["Esse provedor não respondeu"],
        fr: ["Ce fournisseur n’a pas répondu"],
      },
      (l) => view(l, <SignInPage next="/" resetCommand="x" ssoError="provider_error" />),
    );
    each(
      {
        en: ["Ronne AI Marketplace is set up"],
        pt: ["O Ronne AI Marketplace está configurado"],
        fr: ["Ronne AI Marketplace est configuré"],
      },
      (l) => view(l, <SignInPage next="/" resetCommand="x" setupDone />),
    );
    // A reason or an error nobody knows says nothing.
    expect(
      view("pt", <SignInPage next="/" resetCommand="x" again="<script>" ssoError="nope" />),
    ).toBe(view("pt", <SignInPage next="/" resetCommand="x" />));
  });

  it("the form's refusals", () => {
    each(
      {
        en: ["Email or password is wrong"],
        pt: ["O e-mail ou a senha está errado"],
        fr: ["Le courriel ou le mot de passe est incorrect"],
      },
      (l) =>
        view(
          l,
          <SignInForm next="/" resetCommand="x" initial={{ error: "invalid_credentials" }} />,
        ),
    );
    each(
      { en: ["Too many attempts"], pt: ["Muitas tentativas"], fr: ["Trop de tentatives"] },
      (l) => view(l, <SignInForm next="/" resetCommand="x" initial={{ error: "rate_limited" }} />),
    );
  });

  it("the second step: both methods and every refusal", () => {
    each(
      {
        en: ["Code from your authenticator app", "Verify", "Use a backup code instead"],
        pt: ["Código do seu aplicativo autenticador", "Verificar", "Usar um código de backup"],
        fr: [
          "Code de votre application d’authentification",
          "Vérifier",
          "Utiliser plutôt un code de secours",
        ],
      },
      (l) => view(l, <TwoFactorStep next="/" method="totp" />),
    );
    each(
      {
        en: ["Backup code", "such as 3fK9q-Lm2Xz", "Use a code from the app instead"],
        pt: ["Código de backup", "como 3fK9q-Lm2Xz", "Usar um código do aplicativo"],
        fr: ["Code de secours", "comme 3fK9q-Lm2Xz", "Utiliser plutôt un code de l’application"],
      },
      (l) => view(l, <TwoFactorStep next="/" method="backup_code" />),
    );
    for (const error of ["wrong_code", "used", "locked", "refused", "unreadable"] as const)
      for (const l of ["pt", "fr"] as const)
        expect(view(l, <TwoFactorStep next="/" method="totp" initial={{ error }} />)).toContain(
          owned[l].twoFactor.errors[error].replaceAll("'", "&#x27;"),
        );
  });
});

describe("the device page in three languages (129)", () => {
  const request = {
    userCode: "ABCD-EFGH",
    name: "rmk on laptop",
    clientId: "rmk",
    requestedAt: "2026-10-20T12:00:00Z",
    requesterIp: "203.0.113.9",
  };

  it("entering the code, the confirmation, and the answers", () => {
    each(
      {
        en: ["Sign in rmk", "The 8 characters rmk login --web printed.", "Continue"],
        pt: ["Entrar no rmk", "Os 8 caracteres que o rmk login --web mostrou.", "Continuar"],
        fr: ["Connecter rmk", "Les 8 caractères qu’a affichés rmk login --web.", "Continuer"],
      },
      (l) => view(l, <DevicePage typed="" />),
    );
    each(
      {
        en: ["Asked by", "Only approve if you just ran", "Approve", "Deny"],
        pt: ["Pedido por", "Só aprove se você acabou de executar", "Aprovar", "Negar"],
        fr: ["Demandé par", "N’approuvez que si vous venez d’exécuter", "Approuver", "Refuser"],
      },
      (l) => view(l, <DeviceFlow initial={{ step: "confirm", request }} />),
    );
    each(
      {
        en: ["Approved", "is signed in as you"],
        pt: ["Aprovado", "entrou como você"],
        fr: ["Approuvé", "est connecté en votre nom"],
      },
      (l) =>
        view(
          l,
          <DeviceFlow initial={{ step: "done", decision: "approved", name: "rmk on laptop" }} />,
        ),
    );
    each(
      {
        en: ["Denied", "gets no token"],
        pt: ["Negado", "não recebe token"],
        fr: ["Refusé", "ne reçoit aucun jeton"],
      },
      (l) =>
        view(
          l,
          <DeviceFlow initial={{ step: "done", decision: "denied", name: "rmk on laptop" }} />,
        ),
    );
  });

  it("a refused code says when to try again, in the language, with the right plural", () => {
    const html = (l: L, seconds: number) =>
      view(
        l,
        <DeviceFlow
          initial={{ step: "enter", typed: "", error: "rate_limited", retryAfterSeconds: seconds }}
        />,
      );
    expect(html("en", 30)).toContain("Too many codes tried. Try again in a minute.");
    expect(html("en", 400)).toContain("Try again in 7 minutes.");
    expect(html("pt", 30)).toContain("Muitos códigos tentados. Tente de novo em um minuto.");
    expect(html("pt", 400)).toContain("Tente de novo em 7 minutos.");
    expect(html("fr", 30)).toContain("Trop de codes essayés. Réessayez dans une minute.");
    expect(html("fr", 400)).toContain("Réessayez dans 7 minutes.");
  });
});

describe("no English left behind in Portuguese and French (129)", () => {
  const flat = (value: unknown, prefix = ""): Record<string, string> =>
    typeof value === "string"
      ? { [prefix]: value }
      : Object.assign(
          {},
          ...Object.entries(value as object).map(([k, v]) =>
            flat(v, prefix ? `${prefix}.${k}` : k),
          ),
        );
  const htmlEscape = (text: string) =>
    text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
  const standsAlone = (html: string, text: string) =>
    html.includes(`>${text}<`) ||
    html.includes(`"${text}"`) ||
    html.includes(`>${text} `) ||
    html.includes(` ${text}<`);
  const request = {
    userCode: "ABCD-EFGH",
    name: "rmk on laptop",
    clientId: "rmk",
    requestedAt: "2026-10-20T12:00:00Z",
    requesterIp: null,
  };
  const everything = (l: L): string =>
    [
      <SignInPage key="a" next="/" resetCommand="x" here="/sign-in" />,
      <SignInPage
        key="b"
        next="/"
        resetCommand="x"
        providers={[{ id: "a", name: "Acme" }]}
        rootOnly
        setupDone
        again="expired"
        ssoError="expired"
      />,
      <SignInPage key="c" next="/" resetCommand="x" providers={[{ id: "a", name: "Acme" }]} />,
      <SignInForm key="d" next="/" resetCommand="x" initial={{ error: "invalid_credentials" }} />,
      <TwoFactorStep key="e" next="/" method="totp" initial={{ error: "locked" }} />,
      <TwoFactorStep key="f" next="/" method="backup_code" />,
      <DevicePage key="g" typed="" />,
      <DeviceFlow key="h" initial={{ step: "confirm", request }} />,
      <DeviceFlow key="i" initial={{ step: "done", decision: "approved", name: "n" }} />,
      <DeviceFlow key="j" initial={{ step: "done", decision: "denied", name: "n" }} />,
      <DeviceFlow key="k" initial={{ step: "enter", typed: "AB", error: "invalid_code" }} />,
    ]
      .map((node) => view(l, node))
      .join("\n");

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts appears`, () => {
      const enFlat = flat(english);
      const ownFlat = flat(owned[locale]);
      const html = everything(locale);
      const leaks = Object.entries(enFlat)
        .filter(([key, text]) => text.length >= 8 && !/[{<]/.test(text) && text !== ownFlat[key])
        .filter(([, text]) => standsAlone(html, htmlEscape(text)))
        .map(([key]) => key);
      expect(leaks).toEqual([]);
      const used = Object.entries(ownFlat).filter(
        ([, text]) => text.length >= 8 && !/[{<]/.test(text) && standsAlone(html, htmlEscape(text)),
      );
      expect(used.length).toBeGreaterThan(25);
    });
  }
});
