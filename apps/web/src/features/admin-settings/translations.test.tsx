import { createTranslator, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IdentityProvider } from "@/server/domains/identity/models/identity-provider";
import { OIDC_PRESETS } from "@/server/domains/identity/models/oidc-presets";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import enAdmin from "../../../messages/en/admin.json";
import frAdmin from "../../../messages/fr/admin.json";
import ptAdmin from "../../../messages/pt/admin.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => (
    <a href={href} {...(rest as object)}>
      {children as never}
    </a>
  ),
}));
vi.mock("./actions", () => ({
  saveTwoFactorPolicy: vi.fn(),
  savePasswordSignInPolicy: vi.fn(),
  saveUsagePolicy: vi.fn(),
  saveUsageMinimum: vi.fn(),
  saveRetention: vi.fn(),
  retryErasures: vi.fn(),
}));
vi.mock("./authentication/providers/actions", () => ({
  saveProviderFromForm: vi.fn(),
  deleteProviderFromForm: vi.fn(),
  disableProviderFromForm: vi.fn(),
  enableProviderFromForm: vi.fn(),
  testConnectionFromForm: vi.fn(),
  generateScimFromForm: vi.fn(),
  revokeScimFromForm: vi.fn(),
  turnOffScimFromForm: vi.fn(),
  turnOnScimFromForm: vi.fn(),
}));

const { signInMethods } = await import("./authentication/AuthenticationTab");
const { SignInMethodsPanel } = await import("./authentication/SignInMethodsPanel");
const { TwoFactorPolicyForm } = await import("./authentication/TwoFactorPolicyForm");
const { PasswordPolicyForm } = await import("./authentication/PasswordPolicyForm");
const { IdentityProvidersPanel } = await import(
  "./authentication/providers/IdentityProvidersPanel"
);
const { ProviderForm, ProviderFormMessages } = await import(
  "./authentication/providers/ProviderForm"
);
const { TestNotice, UnreadableSecretNotice } = await import(
  "./authentication/providers/ProviderPage"
);
const { ProviderControls, ConnectionResult, TestResult, DeleteConfirm } = await import(
  "./authentication/providers/ProviderControls"
);
const { ScimSection, NewToken } = await import("./authentication/providers/ScimSection");
const { SETTINGS_TABS } = await import("./tabs");
const { UsagePolicyForm } = await import("./usage/UsagePolicyForm");
const { UsageMinimumForm } = await import("./usage/UsageMinimumForm");
const { PluginFeedsPanel } = await import("./feeds/PluginFeedsPanel");
const { LastRun } = await import("./privacy/LastRun");
const { PendingErasures } = await import("./privacy/PendingErasures");
const { RetentionForm } = await import("./privacy/RetentionForm");

type L = "en" | "pt" | "fr";
const NS = ["admin", "common", "help"];
const FILES = { en: enAdmin, pt: ptAdmin, fr: frAdmin };
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));
const methodsT = (locale: L) =>
  createTranslator({
    locale,
    messages: { admin: FILES[locale] },
    namespace: "admin.settings.methods",
  } as never) as unknown as Parameters<typeof signInMethods>[1];

const row = (extra = {}) => ({
  id: "acme",
  name: "Acme SSO",
  type: "oidc" as const,
  typeLabel: "OpenID Connect",
  presetLabel: "Okta",
  issuer: "https://acme.okta.com",
  domains: ["acme.com"],
  status: "on" as const,
  enabled: true,
  lastSignedInAt: null,
  lastFailureReason: null,
  ...extra,
});
const provider: IdentityProvider = {
  id: "acme",
  type: "oidc",
  preset: "okta",
  name: "Acme SSO",
  enabled: false,
  config: { issuer: "https://acme.okta.com", clientId: "ronne", scopes: ["openid", "email"] },
  hasSecret: true,
  domains: ["acme.com"],
  linkByEmail: true,
  groupsClaim: "groups",
  testedAt: null,
  testedBy: null,
  lastSignedInAt: null,
  failures: 0,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: new Date("2026-10-16T12:00:00Z"),
  updatedAt: new Date("2026-10-16T12:30:00.123Z"),
};
const form = (locale: L, props: Partial<Parameters<typeof ProviderForm>[0]> = {}) =>
  render(
    <ProviderForm
      provider={provider}
      presets={OIDC_PRESETS}
      workspaces={[{ id: "w1", name: "acme" }]}
      mappings={[{ group: "devs", workspaceId: "w1", role: "admin", warning: null }]}
      callbackBase="https://ronne.example/api/auth/sso/callback/"
      steps={{ okta: [{ title: "Set up", body: "Do it." }] }}
      {...props}
    />,
    locale,
  );
const coverage = {
  optional: { covered: 0, unenrolled: 0 },
  reviewers: { covered: 3, unenrolled: 0 },
  everyone: { covered: 1, unenrolled: 2 },
} as never;
const checks = {
  ok: true,
  lines: ["Checked."],
  claims: { subject: "s1", email: "a@b.c", emailVerified: false, name: null, groups: null },
  decision: "create an account.",
  groupChanges: [
    { kind: "add", workspaceId: "w1", role: "moderator" },
    { kind: "change", workspaceId: "w1", from: "user", to: "admin", takeOver: false },
    { kind: "remove", workspaceId: "w1" },
    { kind: "release", workspaceId: "w1" },
  ],
} as never;
const controls = (locale: L, extra = {}) =>
  render(
    <ProviderControls
      id="acme"
      name="Acme SSO"
      status="tested"
      enabled={false}
      canEnable={false}
      lastTest={checks}
      workspaceNames={{ w1: "acme" }}
      {...extra}
    />,
    locale,
  );
const scim = (locale: L, extra = {}) =>
  render(
    <ScimSection
      id="acme"
      name="Acme SSO"
      preset="okta"
      enabledAt="2026-10-20T10:00:00Z"
      base="https://ronne.example/api/v1/scim/v2"
      tokens={[
        {
          id: "t1",
          createdAt: "2026-10-21T10:00:00Z",
          createdBy: "root@example.com",
          expiresAt: null,
          lastUsedAt: null,
        },
        {
          id: "t0",
          createdAt: "2026-10-01T10:00:00Z",
          createdBy: null,
          expiresAt: "2026-10-22T10:00:00Z",
          lastUsedAt: "2026-10-21T09:00:00Z",
        },
      ]}
      {...extra}
    />,
    locale,
  );

const everything = (locale: L) =>
  [
    render(
      <SignInMethodsPanel
        methods={signInMethods(
          {
            twoFactorPolicy: "reviewers",
            passwordPolicy: "root_only",
            providers: [
              row({ enabled: true }),
              row({ name: "B", status: "failing", domains: [] }),
              row({ name: "C", domains: [] }),
            ],
          },
          methodsT(locale),
        )}
      />,
      locale,
    ),
    render(<TwoFactorPolicyForm policy="optional" coverage={coverage} />, locale),
    render(<PasswordPolicyForm policy="everyone" usableProvider affected={2} />, locale),
    render(<PasswordPolicyForm policy="everyone" usableProvider={false} affected={0} />, locale),
    render(<IdentityProvidersPanel rows={[]} />, locale),
    render(
      <IdentityProvidersPanel
        rows={[row(), row({ id: "b", status: "off", lastSignedInAt: new Date(0), domains: [] })]}
      />,
      locale,
    ),
    ...["done", "unavailable", "provider_error", "rate_limited"].map((test) =>
      render(<TestNotice test={test} />, locale),
    ),
    render(<UnreadableSecretNotice reason="secret_unreadable" />, locale),
    render(<ProviderFormMessages state={{ stale: true }} />, locale),
    form(locale, { provider: null }),
    form(locale, { provider: null, initialPreset: "okta" }),
    form(locale),
    form(locale, {
      mappings: [{ group: "devs", workspaceId: null, role: "user", warning: "gone" }],
    }),
    controls(locale),
    controls(locale, { enabled: true, canEnable: true, status: "on" }),
    render(<ConnectionResult state={{ ok: true, lines: ["fine"] }} />, locale),
    render(<ConnectionResult state={{ ok: false, lines: ["bad"] }} />, locale),
    render(<TestResult result={checks} workspaceNames={{ w1: "acme" }} />, locale),
    render(
      <DeleteConfirm
        id="acme"
        name="Acme SSO"
        open
        onClose={() => {}}
        action={() => {}}
        pending={false}
      />,
      locale,
    ),
    scim(locale),
    scim(locale, { enabledAt: null }),
    scim(locale, { preset: "entra" }),
    scim(locale, { preset: "other", tokens: [] }),
    render(
      <NewToken state={{ token: "scim_x", previousExpiresAt: "2026-10-22T10:00:00Z" }} />,
      locale,
    ),
  ].join("\n");

describe("Settings › Authentication in three languages (132)", () => {
  it("the tabs read in each language", () => {
    const t = (locale: L, id: (typeof SETTINGS_TABS)[number]["id"]) =>
      (FILES[locale].settings.tabs as Record<string, string>)[id];
    expect(SETTINGS_TABS.map((tab) => t("pt", tab.id))).toEqual([
      "Uso",
      "Feeds de plugins",
      "Autenticação",
      "Privacidade",
      "Comunicado",
    ]);
    expect(SETTINGS_TABS.map((tab) => t("fr", tab.id))).toEqual([
      "Utilisation",
      "Flux de plugins",
      "Authentification",
      "Confidentialité",
      "Avis",
    ]);
  });

  it("the sign-in methods read in each language", () => {
    const html = (locale: L) =>
      render(
        <SignInMethodsPanel
          methods={signInMethods(
            { twoFactorPolicy: "everyone", passwordPolicy: "root_only", providers: [row()] },
            methodsT(locale),
          )}
        />,
        locale,
      );
    expect(html("en")).toContain("Required for everyone.");
    expect(html("pt")).toContain("Formas de entrar");
    expect(html("pt")).toContain(
      "Só o root: todos os outros entram com um provedor de identidade.",
    );
    expect(html("pt")).toContain("Cria contas para acme.com.");
    expect(html("fr")).toContain("Méthodes de connexion");
    expect(html("fr")).toContain("Obligatoire pour tout le monde.");
    expect(html("fr")).toContain("Courriel et mot de passe");
  });

  it("the two-factor choices count people by each language's rule (0, 1, 2)", () => {
    const html = (locale: L) =>
      render(<TwoFactorPolicyForm policy="optional" coverage={coverage} />, locale);
    expect(html("en")).toContain("3 people, all with two-factor on.");
    expect(html("en")).toContain("1 person; 2 people must set it up at their next visit.");
    expect(html("pt")).toContain("3 pessoas, todas com a autenticação de dois fatores ligada.");
    expect(html("pt")).toContain("1 pessoa; 2 pessoas precisam configurar na próxima visita.");
    expect(html("fr")).toContain("3 personnes, toutes avec la double authentification activée.");
    expect(html("fr")).toContain(
      "1 personne; 2 personnes doivent la configurer à leur prochaine visite.",
    );
  });

  it("the password confirmation counts the people who lose it (1 and 2)", () => {
    const Probe = ({ affected }: { affected: number }) => (
      <p>{useTranslations("admin.settings.password")("confirm", { affected })}</p>
    );
    const say = (locale: L, affected: number) => render(<Probe affected={affected} />, locale);
    expect(say("en", 1)).toContain("1 person with a password loses");
    expect(say("en", 2)).toContain("2 people with a password lose");
    expect(say("pt", 1)).toContain("1 pessoa com senha perde");
    expect(say("pt", 2)).toContain("2 pessoas com senha perdem");
    expect(say("fr", 1)).toContain("1 personne avec un mot de passe perd");
    expect(say("fr", 2)).toContain("2 personnes avec un mot de passe perdent");
  });

  it("the provider list, notices and form read in each language", () => {
    expect(render(<IdentityProvidersPanel rows={[]} />, "pt")).toContain("Ainda não há provedores");
    expect(render(<IdentityProvidersPanel rows={[row({ status: "failing" })]} />, "fr")).toContain(
      "En échec",
    );
    expect(render(<TestNotice test="done" />, "pt")).toContain("O seu teste de login terminou");
    expect(render(<TestNotice test="rate_limited" />, "fr")).toContain("Trop de tentatives");
    expect(render(<TestNotice test="constructor" />, "fr")).toBe("");
    expect(form("pt", { provider: null })).toContain("Escolha o seu provedor de identidade");
    expect(form("fr", { provider: null })).toContain("Choisissez votre fournisseur d’identité");
    expect(form("pt")).toContain("Segredo salvo");
    expect(form("pt")).toContain("Adicionar um grupo");
    expect(form("fr")).toContain("Ajouter un groupe");
    expect(form("fr")).toContain("admin");
  });

  it("the controls, the test result and the SCIM section read in each language", () => {
    expect(controls("pt")).toContain("Testar conexão");
    expect(controls("fr")).toContain("Tester la connexion");
    expect(controls("pt")).toContain("O seu teste de login passou.");
    expect(controls("pt")).toContain("entraria em acme como moderador");
    expect(controls("pt")).toContain("mudaria o papel em acme de usuário para admin");
    expect(controls("fr")).toContain("redeviendrait utilisateur dans acme");
    expect(controls("fr")).toContain("(non vérifié)");
    expect(scim("pt")).toContain("Provisionamento (SCIM)");
    expect(scim("pt")).toContain("Desligar o SCIM");
    expect(scim("fr")).toContain("Désactiver SCIM");
    expect(scim("pt", { enabledAt: null })).toContain("Ligar o SCIM");
    expect(scim("pt")).toContain("No Okta, abra o app do Ronne");
    expect(scim("fr", { preset: "entra" })).toContain(
      "Dans Entra, ouvrez l’application d’entreprise",
    );
    expect(scim("pt", { preset: "other" })).toContain("Nas configurações de SCIM do provedor");
  });

  it("shows a provider's name and recorded values as typed", () => {
    const html = render(
      <IdentityProvidersPanel rows={[row({ name: "{count} <b>x</b>" })]} />,
      "pt",
    );
    expect(html).toContain("{count} &lt;b&gt;x&lt;/b&gt;");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every panel, form, dialog and notice leaves no English behind`, async () => {
      // The identity domain's own words (a preset's steps and labels, the checks of a test) stay
      // English like core's.
      // A product's name, as the preset cards write it, is left out.
      const html = everything(locale).replaceAll("Google Workspace", "Google");
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(60);
    });
  }
});

// Usage, Plugin feeds and Privacy (task 8).
const at = new Date("2026-10-18T12:00:00.000Z");
const counts = (n: number) => ({
  ipsCleared: n,
  emailsCleared: n,
  sessionsDeleted: n,
  grantsDeleted: n,
  feedbackDeleted: n,
});
const lastRun = (locale: L, n: number) =>
  render(
    <LastRun
      status={{
        lastRunAt: at,
        lastResult: { at: at.toISOString(), ms: 1, status: "ok", counts: counts(n) },
        running: true,
        schedulerOff: false,
      }}
    />,
    locale,
  );
const feeds = (locale: L, extra = {}) =>
  render(
    <PluginFeedsPanel
      rows={
        [
          {
            tool: "claude-code",
            stats: { sizeBytes: 4_800_000, plugins: 1234, buildMs: 1250, builtAt: at },
            warnings: ["size", "time"],
          },
          {
            tool: "codex",
            stats: { sizeBytes: 2048, plugins: 2, buildMs: 80, builtAt: at },
            warnings: [],
          },
          { tool: "cursor", stats: null, warnings: [], ...extra },
        ] as never
      }
    />,
    locale,
  );
const ret = { ipDays: 90, sessionsDays: 90, feedbackDays: 1 };
const erasures = (locale: L, n: number) =>
  render(
    <PendingErasures
      erasures={Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, startedAt: at }))}
    />,
    locale,
  );
const usageAndPrivacy = (locale: L) =>
  [
    render(<UsagePolicyForm policy="choice" />, locale),
    render(<UsageMinimumForm minimum={5} />, locale),
    feeds(locale),
    render(
      <LastRun
        status={{ lastRunAt: null, lastResult: null, running: false, schedulerOff: true }}
      />,
      locale,
    ),
    render(
      <LastRun
        status={{ lastRunAt: null, lastResult: null, running: false, schedulerOff: false }}
      />,
      locale,
    ),
    render(
      <LastRun
        status={{
          lastRunAt: at,
          lastResult: { at: at.toISOString(), ms: 1, status: "failed", error: "Error" },
          running: false,
          schedulerOff: false,
        }}
      />,
      locale,
    ),
    lastRun(locale, 1),
    lastRun(locale, 2),
    erasures(locale, 1),
    erasures(locale, 2),
    render(<RetentionForm retention={ret} />, locale),
  ].join("\n");

describe("Settings › Usage, Plugin feeds and Privacy in three languages (132)", () => {
  it("the usage forms read in each language", () => {
    expect(render(<UsagePolicyForm policy="off" />, "pt")).toContain("Cada pessoa escolhe");
    expect(render(<UsagePolicyForm policy="off" />, "fr")).toContain("Chacun choisit");
    expect(render(<UsagePolicyForm policy="off" />, "pt")).toContain("Obrigatório");
    expect(render(<UsagePolicyForm policy="off" />, "fr")).toContain("Désactivé");
    expect(render(<UsageMinimumForm minimum={0} />, "pt")).toContain(
      "Mostrar o uso de um item a partir de",
    );
    expect(render(<UsageMinimumForm minimum={0} />, "fr")).toContain(
      "installations ou exécutions en 30 jours",
    );
  });

  it("the plugin feeds read in each language, with numbers written by the language", () => {
    expect(feeds("en")).toContain("Claude Code’s marketplace is near its limits.");
    expect(feeds("pt")).toContain("O marketplace de Claude Code está perto dos seus limites.");
    expect(feeds("fr")).toContain("Le marketplace de Claude Code approche de ses limites.");
    expect(feeds("en")).toContain("4.6 MiB");
    expect(feeds("pt")).toContain("4,6 MiB");
    expect(feeds("pt")).toContain("1,3 s");
    expect(feeds("fr")).toMatch(/1[\s\u202f\u00a0]234/);
    expect(feeds("en")).toContain("1,234");
    expect(feeds("pt")).toContain("Tempo de geração");
    expect(feeds("fr")).toContain("Pas encore construit");
  });

  it("names the limit it nears: size only, time only, or both", () => {
    const one = (locale: L, warnings: string[]) =>
      render(
        <PluginFeedsPanel
          rows={
            [
              {
                tool: "claude-code",
                stats: { sizeBytes: 1, plugins: 1, buildMs: 1, builtAt: at },
                warnings,
              },
            ] as never
          }
        />,
        locale,
      );
    expect(one("en", ["size"])).toContain("is near its size limit.");
    expect(one("en", ["time"])).toContain("is near its time limit.");
    expect(one("pt", ["size"])).toContain("perto do seu limite de tamanho.");
    expect(one("fr", ["time"])).toContain("approche de sa limite de temps.");
  });

  it("the purge's last run counts what it cleared by each language's rule (0, 1 and 2)", () => {
    expect(lastRun("en", 0)).toContain("cleared 0 IP addresses and 0 failed sign-ins’ emails");
    // Zero is singular in Portuguese and French.
    expect(lastRun("pt", 0)).toContain("apagou 0 endereço IP e 0 e-mail de acesso que falhou");
    expect(lastRun("fr", 0)).toContain("0 adresse IP effacée");
    expect(lastRun("en", 1)).toContain("cleared 1 IP address and 1 failed sign-in’s email");
    expect(lastRun("en", 2)).toContain("cleared 2 IP addresses and 2 failed sign-ins’ emails");
    expect(lastRun("pt", 1)).toContain("apagou 1 endereço IP e 1 e-mail de acesso que falhou");
    expect(lastRun("pt", 2)).toContain("apagou 2 endereços IP");
    expect(lastRun("fr", 1)).toContain("1 adresse IP effacée");
    expect(lastRun("fr", 2)).toContain("2 adresses IP effacées");
    expect(lastRun("pt", 1)).toContain("Uma execução está em andamento.");
  });

  it("the purge's other states and the retention form read in each language", () => {
    const idle = (locale: L, schedulerOff: boolean) =>
      render(
        <LastRun status={{ lastRunAt: null, lastResult: null, running: false, schedulerOff }} />,
        locale,
      );
    expect(idle("pt", false)).toContain("Nenhuma execução ainda.");
    expect(idle("fr", true)).toContain("RONNE_JOBS");
    expect(render(<RetentionForm retention={ret} />, "pt")).toContain("Guardar endereços IP por");
    expect(render(<RetentionForm retention={ret} />, "fr")).toContain(
      "Garder les adresses IP pendant",
    );
    // The unit follows the number typed: 1 day, 90 days.
    expect(render(<RetentionForm retention={ret} />, "en")).toContain(">day<");
    expect(render(<RetentionForm retention={ret} />, "pt")).toContain(">dias<");
    expect(render(<RetentionForm retention={ret} />, "pt")).toContain(">dia<");
  });

  it("the pending erasures count by each language's rule (0, 1 and 2)", () => {
    // None: nothing is shown but the Retry result.
    expect(erasures("en", 0)).toBe("");
    expect(erasures("pt", 0)).toBe("");
    expect(erasures("en", 1)).toContain("An erasure wasn’t completed.");
    expect(erasures("en", 2)).toContain("2 erasures weren’t completed.");
    expect(erasures("pt", 1)).toContain("Um apagamento não foi concluído.");
    expect(erasures("pt", 2)).toContain("2 apagamentos não foram concluídos.");
    expect(erasures("fr", 1)).toContain("Un effacement n’a pas été terminé.");
    expect(erasures("fr", 2)).toContain("2 effacements n’ont pas été terminés.");
    expect(render(<PendingErasures erasures={[]} />, "pt")).toBe("");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: usage, feeds and privacy leave no English behind`, async () => {
      const html = usageAndPrivacy(locale);
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(25);
    });
  }
});
