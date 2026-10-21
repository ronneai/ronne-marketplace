import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The pages' actions reach for the server; the render needs only the components.
vi.mock("@/server/domains/identity/actions/two-factor", () => ({}));
vi.mock("@/server/domains/identity/actions/access-tokens", () => ({}));
vi.mock("@/server/domains/identity/actions/session", () => ({ setLocale: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), delete: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));

const { inLocale } = await import("@/test/intl");
const { ChangePasswordForm } = await import("./ChangePasswordForm");
const { YourDataSection } = await import("./YourDataSection");
const { LanguageForm } = await import("./LanguageForm");
const { AccountTabs } = await import("../account-security/AccountTabs");
const { SecurityPage } = await import("../account-security/SecurityPage");
const { SetupFlow } = await import("../account-security/SetupFlow");
const { RegenerateBackupCodes, TurnOffTwoFactor } = await import(
  "../account-security/ManageTwoFactor"
);
const { BackupCodes, backupCodesFile } = await import("../account-security/BackupCodes");
const { TokensPage } = await import("../account-tokens/TokensPage");
const { CreateTokenDialog } = await import("../account-tokens/CreateTokenDialog");
const { RevokeTokenButton } = await import("../account-tokens/RevokeTokenButton");
const { CreatedTokenPanel } = await import("../account-tokens/CreatedTokenPanel");
const { CliAuthPanel } = await import("@/components/cli-auth/CliAuthPanel");
const { ThemeToggle } = await import("../theme/ThemeToggle");
const accountMessages = (await import("../../../messages/pt/account.json")).default;
const english = (await import("../../../messages/en/account.json")).default;
const cliEnglish = (await import("../../../messages/en/common.json")).default.cliAuth;
const owned = {
  pt: {
    account: (await import("../../../messages/pt/account.json")).default,
    cli: (await import("../../../messages/pt/common.json")).default.cliAuth,
  },
  fr: {
    account: (await import("../../../messages/fr/account.json")).default,
    cli: (await import("../../../messages/fr/common.json")).default.cliAuth,
  },
};

type L = "en" | "pt" | "fr";
const view = (locale: L, node: ReactElement) => inLocale(locale, () => renderToStaticMarkup(node));
const each = (cases: Record<L, string[]>, render: (locale: L) => string) => {
  for (const [locale, expected] of Object.entries(cases) as [L, string[]][]) {
    const html = render(locale);
    for (const text of expected) expect(html, `${locale}: ${text}`).toContain(text);
  }
};

describe("Account in three languages (129)", () => {
  it("the tabs name each page", () => {
    each(
      {
        en: [">Password<", ">Two-factor sign-in<", ">Language<", 'aria-label="Account"'],
        pt: [">Senha<", ">Autenticação de dois fatores<", ">Idioma<", 'aria-label="Conta"'],
        fr: [">Mot de passe<", ">Connexion à deux facteurs<", ">Langue<", 'aria-label="Compte"'],
      },
      (l) => view(l, <AccountTabs current="language" />),
    );
  });

  it("the password form: labels, hint and button", () => {
    each(
      {
        en: ["Current password", "New password", "12 to 128 characters.", "Change password"],
        pt: ["Senha atual", "Nova senha", "De 12 a 128 caracteres.", "Alterar senha"],
        fr: [
          "Mot de passe actuel",
          "Nouveau mot de passe",
          "De 12 à 128 caractères.",
          "Changer le mot de passe",
        ],
      },
      (l) => view(l, <ChangePasswordForm />),
    );
  });

  it("the password form: every error, next to its field, and the confirmation", () => {
    const errors = {
      wrong_password: [
        "The current password is wrong",
        "A senha atual está errada",
        "Le mot de passe actuel est incorrect",
      ],
      mismatch: ["passwords don&#x27;t match", "não são iguais", "ne correspondent pas"],
      rate_limited: ["Too many attempts", "Muitas tentativas", "Trop de tentatives"],
    } as const;
    for (const [error, [en, pt, fr]] of Object.entries(errors)) {
      const html = (l: L) =>
        view(l, <ChangePasswordForm initial={{ error: error as keyof typeof errors }} />);
      expect(html("en")).toContain(en);
      expect(html("pt")).toContain(pt);
      expect(html("fr")).toContain(fr);
    }
    each(
      {
        en: ["Password changed", "other sessions were signed out"],
        pt: ["Senha alterada", "as outras sessões foram encerradas"],
        fr: ["Mot de passe changé", "les autres sessions ont été fermées"],
      },
      (l) => view(l, <ChangePasswordForm initial={{ changed: true }} />),
    );
  });

  it("Your data", () => {
    each(
      {
        en: ["Your data", "Download my data", "Last downloaded"],
        pt: ["Seus dados", "Baixar meus dados", "Último download em"],
        fr: ["Vos données", "Télécharger mes données", "Dernier téléchargement :"],
      },
      (l) => view(l, <YourDataSection lastDownloadedAt={new Date("2026-10-01T12:00:00Z")} />),
    );
  });

  it("the Language form: each language in its own name, the saved one selected", () => {
    each(
      {
        en: ["Language of the screens", "Automatic (the browser&#x27;s language)", "Save"],
        pt: ["Idioma das telas", "Automático (o idioma do navegador)", "Salvar"],
        fr: ["Langue des écrans", "Automatique (la langue du navigateur)", "Enregistrer"],
      },
      (l) => view(l, <LanguageForm />),
    );
    const html = view("en", <LanguageForm saved="fr" />);
    expect(html).toContain("English");
    expect(html).toContain("Português");
    expect(html).toContain("Français");
    expect(html).toMatch(/<option value="fr" lang="fr" selected="">Français<\/option>/);
    expect(view("pt", <LanguageForm />)).toMatch(/<option value="" selected="">Automático/);
  });

  it("the Language form's confirmation and refusal", () => {
    each(
      {
        en: ["Language saved", "now use the language you chose"],
        pt: ["Idioma salvo", "agora usam o idioma que você escolheu"],
        fr: ["Langue enregistrée", "utilisent maintenant la langue que vous avez choisie"],
      },
      (l) => view(l, <LanguageForm initial={{ saved: "pt" }} />),
    );
    each(
      {
        en: ["follow your browser&#x27;s language"],
        pt: ["seguem o idioma do seu navegador"],
        fr: ["suivent maintenant la langue de votre navigateur"],
      },
      (l) => view(l, <LanguageForm initial={{ saved: "automatic" }} />),
    );
    each(
      {
        en: ["Choose one of the languages in the list."],
        pt: ["Escolha um dos idiomas da lista."],
        fr: ["Choisissez l’une des langues de la liste."],
      },
      (l) => view(l, <LanguageForm initial={{ error: "invalid" }} />),
    );
  });
});

describe("Two-factor sign-in in three languages (129)", () => {
  const off = { enabled: false, backupCodesLeft: 0, hasPassword: true };
  const on = { enabled: true, backupCodesLeft: 7, hasPassword: true };

  it("the page when it is off, and root requires it", () => {
    each(
      {
        en: [
          "Set up two-factor sign-in to continue",
          "root and the moderators and admins of shared workspaces",
          "Set up two-factor",
        ],
        pt: [
          "Configure a autenticação de dois fatores para continuar",
          "o root e os moderadores e administradores dos espaços de trabalho compartilhados",
          "Inativa",
        ],
        fr: [
          "Configurez la connexion à deux facteurs pour continuer",
          "root ainsi que les modérateurs et administrateurs des espaces de travail partagés",
          "Désactivée",
        ],
      },
      (l) => view(l, <SecurityPage status={off} required="reviewers" />),
    );
    expect(view("pt", <SecurityPage status={off} required="everyone" />)).toContain(
      "todas as pessoas",
    );
    expect(view("fr", <SecurityPage status={off} required="everyone" />)).toContain(
      "tout le monde",
    );
  });

  it("the page when it is on: the plural count, backup codes and turning it off", () => {
    each(
      {
        en: ["7 backup codes left.", "Turn off two-factor sign-in", "Backup codes"],
        pt: [
          "Restam 7 códigos de backup.",
          "Desativar a autenticação de dois fatores",
          "Códigos de backup",
        ],
        fr: [
          "7 codes de secours restants.",
          "Désactiver la connexion à deux facteurs",
          "Codes de secours",
        ],
      },
      (l) => view(l, <SecurityPage status={on} />),
    );
    each(
      {
        en: ["1 backup code left."],
        pt: ["Resta 1 código de backup."],
        fr: ["1 code de secours restant."],
      },
      (l) => view(l, <SecurityPage status={{ ...on, backupCodesLeft: 1 }} />),
    );
  });

  it("the page of someone who signs in through their company", () => {
    each(
      {
        en: ["Your company&#x27;s sign-in protects your account"],
        pt: ["O login da sua empresa protege a sua conta"],
        fr: ["La connexion de votre entreprise protège votre compte"],
      },
      (l) => view(l, <SecurityPage status={{ ...on, hasPassword: false }} />),
    );
  });

  it("the setup: password step, the scan step, and a refusal", () => {
    each(
      {
        en: ["Your password", "Set up two-factor"],
        pt: ["Sua senha", "Configurar a autenticação de dois fatores"],
        fr: ["Votre mot de passe", "Configurer la connexion à deux facteurs"],
      },
      (l) => view(l, <SetupFlow />),
    );
    const setup = {
      uri: "otpauth://x?secret=ABCD",
      qrSvg: "<svg/>",
      secret: "ABCD",
      backupCodes: ["A-B"],
    };
    each(
      {
        en: ["Open your authenticator app", 'alt="QR code for your authenticator app"', "Turn on"],
        pt: [
          "Abra o seu aplicativo autenticador",
          'alt="Código QR para o seu aplicativo autenticador"',
          "Ativar",
        ],
        fr: [
          "Ouvrez votre application d’authentification",
          'alt="Code QR pour votre application d’authentification"',
          "Activer",
        ],
      },
      (l) => view(l, <SetupFlow initial={{ setup }} />),
    );
    each(
      {
        en: ["replaced by a newer one"],
        pt: ["substituída por uma mais nova"],
        fr: ["remplacée par une plus récente"],
      },
      (l) => view(l, <SetupFlow initial={{ error: "replaced" }} />),
    );
  });

  it("new backup codes, turning it off, and the codes themselves", () => {
    each(
      {
        en: ["Ten new codes, shown once", "Make new backup codes"],
        pt: ["Dez códigos novos, mostrados uma só vez", "Gerar novos códigos de backup"],
        fr: ["Dix nouveaux codes, affichés une seule fois", "Créer de nouveaux codes de secours"],
      },
      (l) => view(l, <RegenerateBackupCodes />),
    );
    each(
      {
        en: ["A code from the app, or a backup code", "Turn off two-factor"],
        pt: [
          "Um código do aplicativo, ou um código de backup",
          "Desativar a autenticação de dois fatores",
        ],
        fr: [
          "Un code de l’application, ou un code de secours",
          "Désactiver la connexion à deux facteurs",
        ],
      },
      (l) => view(l, <TurnOffTwoFactor />),
    );
    each(
      {
        en: ["Save them now", "Copy all", "Download (.txt)"],
        pt: ["Salve-os agora", "Copiar todos", "Baixar (.txt)"],
        fr: ["Enregistrez-les maintenant", "Tout copier", "Télécharger (.txt)"],
      },
      (l) => view(l, <BackupCodes codes={["A-B", "C-D"]} />),
    );
  });

  it("the downloaded file is written in the person's language", () => {
    const file = backupCodesFile(
      ["A-B"],
      [accountMessages.security.backup.fileTitle, accountMessages.security.backup.fileAbout],
    );
    expect(file).toMatch(/^Ronne AI Marketplace: códigos de backup/);
    expect(file).toContain("A-B");
  });
});

describe("Access tokens and the terminal in three languages (129)", () => {
  const token = {
    id: "t1",
    name: "laptop",
    preview: "rmk_AbC1dEf2",
    via: "device" as const,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };

  it("the page, its table and the empty state", () => {
    each(
      {
        en: [
          "Access tokens",
          "Last used",
          "browser approval",
          ">never<",
          ">no expiry<",
          ">active<",
        ],
        pt: [
          "Tokens de acesso",
          "Último uso",
          "aprovação no navegador",
          ">nunca<",
          ">sem expiração<",
          ">ativo<",
        ],
        fr: [
          "Jetons d’accès",
          "Dernière utilisation",
          "approbation dans le navigateur",
          ">jamais<",
          ">sans expiration<",
          ">actif<",
        ],
      },
      (l) => view(l, <TokensPage tokens={[token]} now={new Date("2026-09-27T00:00:00Z")} />),
    );
    each(
      {
        en: ["No tokens yet. Create one, or run <code"],
        pt: ["Nenhum token ainda. Crie um, ou execute <code"],
        fr: ["Aucun jeton pour l’instant. Créez-en un, ou exécutez <code"],
      },
      (l) => view(l, <TokensPage tokens={[]} now={new Date()} />),
    );
    each({ en: [">expired<"], pt: [">expirado<"], fr: [">expiré<"] }, (l) =>
      view(
        l,
        <TokensPage
          tokens={[{ ...token, expiresAt: new Date("2026-09-01T00:00:00Z") }]}
          now={new Date("2026-09-27T00:00:00Z")}
        />,
      ),
    );
  });

  it("creating a token: the button, the dialog's form and the one-time panel", () => {
    each(
      {
        en: ["Create token", "Create access token", "Expires after", "30 days", "Cancel"],
        pt: ["Criar token", "Criar token de acesso", "Expira depois de", "30 dias", "Cancelar"],
        fr: ["Créer un jeton", "Créer un jeton d’accès", "Expire après", "30 jours", "Annuler"],
      },
      (l) => view(l, <CreateTokenDialog />),
    );
    each(
      {
        en: ["Copy it now", "Token: laptop", "It never expires."],
        pt: ["Copie agora", "Token: laptop", "Ele nunca expira."],
        fr: ["Copiez-le maintenant", "Jeton : laptop", "Il n’expire jamais."],
      },
      (l) =>
        view(l, <CreatedTokenPanel value={{ token: "rmk_x", name: "laptop", expiresAt: null }} />),
    );
  });

  it("revoking a token", () => {
    each(
      {
        en: ['aria-label="Revoke laptop"', "Revoke access token", "Revoke token"],
        pt: ['aria-label="Revogar laptop"', "Revogar token de acesso", "Revogar token"],
        fr: ['aria-label="Révoquer laptop"', "Révoquer le jeton d’accès", "Révoquer le jeton"],
      },
      (l) => view(l, <RevokeTokenButton id="t1" name="laptop" />),
    );
    expect(view("pt", <RevokeTokenButton id="t1" name="laptop" />)).toMatch(
      /Revogar <strong[^>]*>laptop<\/strong>\?/,
    );
  });

  it("the terminal panel, with and without the link to Access tokens", () => {
    each(
      {
        en: ["Use rmk from the terminal", "Get rmk", "Check, then install"],
        pt: ["Use o rmk no terminal", "Instale o rmk", "Confira e instale"],
        fr: ["Utilisez rmk dans le terminal", "Obtenez rmk", "Vérifiez, puis installez"],
      },
      (l) => view(l, <CliAuthPanel />),
    );
    expect(view("pt", <CliAuthPanel />)).toMatch(
      /<a [^>]*href="\/account\/tokens"[^>]*>Tokens de acesso<\/a>/,
    );
    expect(view("fr", <CliAuthPanel linkToTokens={false} />)).toContain(
      "avec un jeton personnel de cette page",
    );
    expect(view("pt", <CliAuthPanel registry="https://r.example" />)).toContain(
      "rmk login --registry https://r.example",
    );
  });

  it("the theme switch", () => {
    each(
      {
        en: ['aria-label="Switch to the dark theme"'],
        pt: ['aria-label="Mudar para o tema escuro"'],
        fr: ['aria-label="Passer au thème sombre"'],
      },
      (l) => view(l, <ThemeToggle theme="light" />),
    );
    expect(view("fr", <ThemeToggle theme="dark" />)).toContain("Passer au thème clair");
  });
});

describe("no English left behind in Portuguese and French (129)", () => {
  // Every English message of the Account area that reads differently in the language, so that if a
  // component goes back to English text, or shows another language's, a render here contains it.
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

  const setup = {
    uri: "otpauth://x?secret=ABCD",
    qrSvg: "<svg/>",
    secret: "ABCD",
    backupCodes: ["A-B"],
  };
  const token = {
    id: "t1",
    name: "laptop",
    preview: "rmk_AbC1dEf2",
    via: "device" as const,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };
  /** The text as a whole text node or attribute value, not a piece of a longer word or sentence. */
  const standsAlone = (html: string, text: string) =>
    html.includes(`>${text}<`) ||
    html.includes(`"${text}"`) ||
    html.includes(`>${text} `) ||
    html.includes(` ${text}<`);
  const everything = (l: L): string =>
    [
      <AccountTabs key="a" current="password" />,
      <ChangePasswordForm key="b" initial={{ error: "wrong_password" }} />,
      <ChangePasswordForm key="c" initial={{ changed: true }} />,
      <ChangePasswordForm key="d" initial={{ error: "mismatch" }} />,
      <YourDataSection key="e" lastDownloadedAt={new Date("2026-10-01T12:00:00Z")} />,
      <LanguageForm key="f" saved="pt" initial={{ saved: "pt" }} />,
      <LanguageForm key="g" initial={{ saved: "automatic" }} />,
      <LanguageForm key="h" initial={{ error: "invalid" }} />,
      <SecurityPage
        key="i"
        status={{ enabled: false, backupCodesLeft: 0, hasPassword: true }}
        required="everyone"
      />,
      <SecurityPage
        key="j"
        status={{ enabled: true, backupCodesLeft: 7, hasPassword: true }}
        continueTo="/device"
      />,
      <SecurityPage key="k" status={{ enabled: true, backupCodesLeft: 1, hasPassword: false }} />,
      <SetupFlow key="l" initial={{ setup }} />,
      <SetupFlow key="m" initial={{ error: "wrong_code" }} />,
      <RegenerateBackupCodes key="n" />,
      <TurnOffTwoFactor key="o" />,
      <BackupCodes key="p" codes={["A-B"]} />,
      <TokensPage key="q" tokens={[token]} now={new Date("2026-09-27T00:00:00Z")} />,
      <TokensPage key="r" tokens={[]} now={new Date()} />,
      <CreateTokenDialog key="s" />,
      <RevokeTokenButton key="t" id="t1" name="laptop" />,
      <CreatedTokenPanel key="u" value={{ token: "rmk_x", name: "laptop", expiresAt: null }} />,
      <CliAuthPanel key="v" />,
      <CliAuthPanel key="w" linkToTokens={false} />,
      <ThemeToggle key="x" theme="light" />,
    ]
      .map((node) => view(l, node))
      .join("\n");

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts appears`, () => {
      const own = owned[locale].account;
      const ownCli = owned[locale].cli;
      const enFlat = { ...flat(english), ...flat(cliEnglish, "cli") };
      const ownFlat = { ...flat(own), ...flat(ownCli, "cli") };
      const html = everything(locale);
      const leaks = Object.entries(enFlat)
        // Plain texts that differ; messages with placeholders or tags are compared in their parts.
        .filter(([key, text]) => text.length >= 8 && !/[{<]/.test(text) && text !== ownFlat[key])
        .filter(([, text]) => standsAlone(html, htmlEscape(text)))
        .map(([key]) => key);
      expect(leaks).toEqual([]);
      // And the render does use the language's own words for most of the area.
      const used = Object.entries(ownFlat).filter(
        ([, text]) => text.length >= 8 && !/[{<]/.test(text) && standsAlone(html, htmlEscape(text)),
      );
      expect(used.length).toBeGreaterThan(40);
    });
  }
});
