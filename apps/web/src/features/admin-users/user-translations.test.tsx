import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserDetail } from "@/server/domains/identity/actions/user-admin";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  changeRoleFromForm: vi.fn(),
  disableImpactFor: vi.fn(),
  disableUserFromForm: vi.fn(),
  enableUserFromForm: vi.fn(),
  resetPasswordFromForm: vi.fn(),
  resetTwoFactorFromForm: vi.fn(),
  setPasswordChangeFromForm: vi.fn(),
  eraseUserFromForm: vi.fn(),
  saveUserWorkspacesFromForm: vi.fn(),
  userWorkspacesFor: vi.fn(),
}));

const { UserPage } = await import("./UserPage");
const { ActionForm, RoleChangeNotice } = await import("./UserActionDialogs");
const { EraseUserForm } = await import("./EraseUserDialog");
const { DownloadDataBody } = await import("./DownloadDataDialog");
const { ErasedDownloadButton } = await import("./UserPageActions");
const { WorkspaceRows } = await import("./WorkspaceRows");
const { UserWorkspacesButton } = await import("./UserWorkspacesDialog");

type L = "en" | "pt" | "fr";
const NS = ["admin", "common", "help"];
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const summary = (extra: Partial<UserSummary> = {}): UserSummary => ({
  id: "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z",
  email: "sam@example.com",
  name: "Sam Lee",
  role: "user",
  disabledAt: null,
  erasedAt: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  twoFactor: false,
  workspaces: [{ name: "global", role: "user" }],
  lastSignInAt: new Date("2026-10-19T14:30:00Z"),
  ...extra,
});
const detail = (extra: Partial<UserSummary> = {}): UserDetail =>
  ({ user: summary(extra), sessions: 2, tokens: 3 }) as UserDetail;
const page = (d: UserDetail, locale: L, self = false) =>
  render(<UserPage detail={d} self={self} slots={{ role: <b>SLOT</b> }} />, locale);

const row = {
  id: "u1",
  email: "alex@example.com",
  name: "Alex",
  role: "user",
  disabled: false,
} as const;
const KINDS = [
  "role",
  "disable",
  "enable",
  "reset",
  "twoFactor",
  "askChange",
  "clearChange",
] as const;
const forms = (locale: L) =>
  [
    ...KINDS.map((kind) => render(<ActionForm kind={kind} user={row} onDone={() => {}} />, locale)),
    render(
      <ActionForm
        kind="disable"
        user={{ ...row, role: "root", managedBy: "Okta" }}
        onDone={() => {}}
      />,
      locale,
    ),
    render(<ActionForm kind="reset" user={{ ...row, role: "root" }} onDone={() => {}} />, locale),
    render(<ActionForm kind="role" user={{ ...row, role: "root" }} onDone={() => {}} />, locale),
    render(<RoleChangeNotice email="a@b.c" from="user" to="root" />, locale),
    render(<RoleChangeNotice email="a@b.c" from="root" to="user" />, locale),
    render(<RoleChangeNotice email="a@b.c" from="user" to="user" />, locale),
  ].join("\n");

const erase = (locale: L, role: "root" | "user" = "user") =>
  render(
    <EraseUserForm
      user={{ id: "u1", email: "alex@example.com", name: "Alex", role }}
      onDone={() => {}}
    />,
    locale,
  );

const rows = (locale: L) =>
  render(
    <WorkspaceRows
      workspaces={[
        { id: "g", name: "global", isGlobal: true },
        { id: "a", name: "acme", isGlobal: false },
        { id: "b", name: "beta", isGlobal: false },
      ]}
      rows={[
        { workspaceId: "g", role: "user" },
        { workspaceId: "a", role: "admin" },
      ]}
      setRows={() => {}}
    />,
    locale,
  );

describe("a user's page in three languages (132)", () => {
  it("reads in each language", () => {
    const cases: Record<L, string[]> = {
      en: [
        "← Users",
        "Account",
        "Sign-in and access",
        "Their data",
        "Erase this account",
        "Active",
        "Automatic",
        "Two-factor",
      ],
      pt: [
        "← Usuários",
        "Conta",
        "Acesso e login",
        "Dados da pessoa",
        "Apagar esta conta",
        "Ativa",
        "Automático",
        "Dois fatores",
      ],
      fr: [
        "← Utilisateurs",
        "Compte",
        "Connexion et accès",
        "Ses données",
        "Effacer ce compte",
        "Actif",
        "Automatique",
        "Double authentification",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = page(detail(), locale);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  it("words the disabled, erased, root, own-account and SCIM states", () => {
    expect(page(detail({ disabledAt: new Date("2026-10-02T10:00:00Z") }), "pt")).toContain(
      "Desativada em",
    );
    expect(page(detail({ erasedAt: new Date("2026-10-02T10:00:00Z") }), "fr")).toContain(
      "Effacé le",
    );
    expect(page(detail({ role: "root" }), "pt")).toContain("Root: todos os espaços de trabalho.");
    expect(page(detail(), "fr", true)).toContain("Voici votre propre compte.");
    const scim = { providerName: "Okta", managed: true } as UserSummary["scim"];
    expect(page(detail({ scim }), "pt")).toContain("Gerenciado por Okta");
  });

  it("shows the person's data as typed", () => {
    const html = page(detail({ name: "{count} <b>x</b>", email: "{x}@example.com" }), "pt");
    expect(html).toContain("{count} &lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("{x}@example.com");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: the page leaves no English behind`, async () => {
      const html = [
        page(detail(), locale),
        page(detail({ role: "root", locale: null, twoFactor: true }), locale),
        page(detail({ disabledAt: new Date("2026-10-02T10:00:00Z"), workspaces: [] }), locale),
        page(detail({ erasedAt: new Date("2026-10-02T10:00:00Z") }), locale),
        page(detail(), locale, true),
      ].join("\n");
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(15);
    });
  }
});

describe("a user's action dialogs in three languages (132)", () => {
  it("title and button read in each language", () => {
    const cases: Record<L, string[]> = {
      en: ["New role", "Cancel", "Counting their sessions and tokens…", "Reset password"],
      pt: ["Novo papel", "Cancelar", "Contando as sessões e os tokens…", "Redefinir senha"],
      fr: [
        "Nouveau rôle",
        "Annuler",
        "Décompte des sessions et des jetons…",
        "Réinitialiser le mot de passe",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = forms(locale);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  it("words the role changes with the role in the language", () => {
    expect(render(<RoleChangeNotice email="a@b.c" from="user" to="root" />, "pt")).toContain(
      "Tornar a@b.c root?",
    );
    expect(render(<RoleChangeNotice email="a@b.c" from="root" to="user" />, "fr")).toContain(
      "Retirer le rôle root à a@b.c?",
    );
    expect(render(<RoleChangeNotice email="a@b.c" from="user" to="root" />, "fr")).toContain(
      "Faire de a@b.c un root?",
    );
    expect(render(<RoleChangeNotice email="a@b.c" from="user" to="user" />, "pt")).toContain(
      "<strong",
    );
  });

  it("counts sessions and tokens by each language's plural rule (0, 1, 2)", () => {
    const Probe = ({ sessions, tokens }: { sessions: number; tokens: number }) => (
      <p>{useTranslations("admin.actions")("impact", { sessions, tokens })}</p>
    );
    const say = (locale: L, sessions: number, tokens: number) =>
      render(<Probe sessions={sessions} tokens={tokens} />, locale);
    expect(say("en", 1, 1)).toContain("(1 session) and revokes 1 access token.");
    expect(say("en", 2, 0)).toContain("(2 sessions) and revokes 0 access tokens.");
    expect(say("pt", 1, 2)).toContain("(1 sessão) e revoga 2 tokens de acesso.");
    expect(say("pt", 0, 1)).toContain("(0 sessão) e revoga 1 token de acesso.");
    expect(say("fr", 1, 2)).toContain("(1 session) et révoque 2 jetons d’accès.");
    expect(say("fr", 0, 1)).toContain("(0 session) et révoque 1 jeton d’accès.");
    expect(say("fr", 2, 2)).toContain("(2 sessions)");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every dialog leaves no English behind`, async () => {
      const html = [forms(locale), erase(locale), erase(locale, "root")].join("\n");
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(15);
    });
  }
});

describe("erase, download and workspaces in three languages (132)", () => {
  it("the erase dialog reads in each language, with the pseudonym as written", () => {
    expect(erase("en")).toContain("This can’t be undone.");
    expect(erase("pt")).toContain("Não dá para desfazer.");
    expect(erase("fr")).toContain("C’est irréversible.");
    for (const locale of ["en", "pt", "fr"] as const)
      expect(erase(locale), locale).toContain("deleted-user-&lt;id&gt;");
    expect(erase("pt", "root")).toContain("alex@example.com é root.");
    expect(erase("fr")).toContain("Télécharger ses données");
  });

  it("the download dialog and the erased account's button", () => {
    const body = (locale: L) =>
      render(
        <DownloadDataBody user={{ id: "u1", email: "alex@example.com" }} onClose={() => {}} />,
        locale,
      );
    expect(body("pt")).toContain("Fechar");
    expect(body("fr")).toContain("Fermer");
    expect(body("pt")).toContain("Baixar");
    expect(render(<ErasedDownloadButton email="a@b.c" />, "pt")).toContain(
      "Baixar os dados de a@b.c: conta apagada",
    );
    expect(render(<ErasedDownloadButton email="a@b.c" />, "fr")).toContain(
      "Télécharger ses données (compte effacé)",
    );
  });

  it("the workspaces editor and its button", () => {
    expect(rows("pt")).toContain("Espaços de trabalho");
    expect(rows("pt")).toContain("Adicionar espaço de trabalho");
    expect(rows("pt")).toContain("Papel em acme");
    expect(rows("fr")).toContain("Ajouter un espace de travail");
    expect(rows("fr")).toContain("Toujours");
    const button = (locale: L) =>
      render(
        <UserWorkspacesButton user={{ id: "u", email: "u@example.com" }} workspaces={[]}>
          x
        </UserWorkspacesButton>,
        locale,
      );
    expect(button("en")).toContain("<button");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: download, erased button and workspaces leave no English behind`, async () => {
      const html = [
        render(<DownloadDataBody user={{ id: "u1", email: "a@b.c" }} onClose={() => {}} />, locale),
        render(<ErasedDownloadButton email="a@b.c" />, locale),
        rows(locale),
      ].join("\n");
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(5);
    });
  }
});
