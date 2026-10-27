import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({ createUserFromForm: vi.fn() }));
const { UsersPage } = await import("./UsersPage");
const { CreateUserForm } = await import("./CreateUserDialog");
const { OneTimePassword } = await import("./OneTimePassword");
const { checkedUsersState, USERS_LIST } = await import("./list");

type L = "en" | "pt" | "fr";
const NS = ["admin", "common", "help"];

const user = (id: string, extra: Partial<UserSummary> = {}): UserSummary => ({
  id,
  email: `${id.toLowerCase()}@example.com`,
  name: `Name ${id}`,
  role: "user",
  disabledAt: null,
  erasedAt: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  ...extra,
});
const USERS: [UserSummary, UserSummary, UserSummary, UserSummary] = [
  user("A1", { role: "root", lastSignInAt: new Date("2026-10-01T10:00:00Z") }),
  user("A2", {
    workspaces: [
      { name: "acme", role: "admin" },
      { name: "beta", role: "user" },
    ],
    scim: {
      providerName: "Okta",
      managed: true,
      adoptedAt: new Date("2026-10-02T10:00:00Z"),
      deprovisionedAt: new Date("2026-10-03T10:00:00Z"),
    },
  } as Partial<UserSummary>),
  user("A3", { disabledAt: new Date("2026-10-02T10:00:00Z") }),
  user("A4", { erasedAt: new Date("2026-10-03T10:00:00Z") }),
];

const list = (users: UserSummary[], params: Record<string, string> = {}, locale: L = "en") =>
  inLocale(locale, () =>
    renderToStaticMarkup(
      <UsersPage
        state={checkedUsersState(parseListQuery(USERS_LIST, params))}
        users={users}
        page={{ next: null, previous: null }}
        total={{ count: users.length, capped: false }}
      />,
    ),
  );
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));

describe("the users list in three languages (132)", () => {
  it("reads in each language", () => {
    const cases: Record<L, string[]> = {
      en: [
        "Users",
        "Any role",
        "Any status",
        "Email or name",
        "Last sign-in",
        "Never",
        "disabled",
        "4 users",
      ],
      pt: [
        "Usuários",
        "Qualquer papel",
        "Qualquer situação",
        "E-mail ou nome",
        "Último acesso",
        "Nunca",
        "desativado",
        "4 usuários",
      ],
      fr: [
        "Utilisateurs",
        "Tous les rôles",
        "Tous les statuts",
        "Courriel ou nom",
        "Dernière connexion",
        "Jamais",
        "désactivé",
        "4 utilisateurs",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = list(USERS, {}, locale);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  it("words the SCIM badges, the roles and the empty states", () => {
    expect(list(USERS, {}, "pt")).toContain("Gerenciado por Okta");
    expect(list(USERS, {}, "fr")).toContain("Géré par Okta");
    expect(list(USERS, {}, "pt")).toContain("Apagado em");
    expect(list(USERS, {}, "fr")).toContain("Effacé le");
    expect(list([], {}, "pt")).toContain("Ainda não há usuários.");
    expect(list([], { q: "x" }, "fr")).toContain("Aucun utilisateur ne correspond à ces filtres.");
  });

  it("counts 0, 1 and 2 users by each language's rule", () => {
    const one = [USERS[0]];
    const two = [USERS[0], USERS[1]];
    expect(list(one, {}, "en")).toContain("1 user");
    expect(list(one, {}, "pt")).toContain("1 usuário");
    expect(list(one, {}, "fr")).toContain("1 utilisateur");
    expect(list(two, {}, "en")).toContain("2 users");
    expect(list(two, {}, "pt")).toContain("2 usuários");
    expect(list(two, {}, "fr")).toContain("2 utilisateurs");
    // With none, the table shows its empty state instead of a count.
    for (const [locale, text] of [
      ["en", "No users yet."],
      ["pt", "Ainda não há usuários."],
      ["fr", "Aucun utilisateur pour l’instant."],
    ] as const)
      expect(list([], {}, locale), locale).toContain(text);
  });

  it("shows a name or an email as typed even when it looks like a placeholder", () => {
    const html = list(
      [user("A1", { name: "{count} <b>x</b>", email: "{x}@example.com" })],
      {},
      "pt",
    );
    expect(html).toContain("{count} &lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("{x}@example.com");
  });

  it("shows the chosen filters as chips in the language", () => {
    const html = list(USERS, { role: "root", status: "disabled" }, "pt");
    expect(html).toContain("Papel:");
    expect(html).toContain("Situação:");
    expect(html).toContain("desativado");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: the list, the create form and the one-time panel leave no English behind`, async () => {
      const html = [
        list(USERS, {}, locale),
        list([], {}, locale),
        list([], { q: "x", role: "root", status: "erased" }, locale),
        render(<CreateUserForm onDone={() => {}} />, locale),
        render(
          <OneTimePassword value={{ email: "a@example.com", password: "Gen3rated" }} />,
          locale,
        ),
      ].join("\n");
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(15);
    });
  }
});

describe("the create-user form and the one-time panel in three languages (132)", () => {
  it("reads in each language", () => {
    const cases: Record<L, string[]> = {
      en: ["Email", "Name", "Create user", "Cancel", "Generate one (20 characters)"],
      pt: ["E-mail", "Nome", "Criar usuário", "Cancelar", "Gerar uma (20 caracteres)"],
      fr: ["Courriel", "Nom", "Créer un utilisateur", "Annuler", "En générer un (20 caractères)"],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = render(<CreateUserForm onDone={() => {}} />, locale);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
    const panel = (locale: L) =>
      render(<OneTimePassword value={{ email: "a@example.com", password: "p" }} />, locale);
    expect(panel("pt")).toContain("Mostrada uma só vez");
    expect(panel("fr")).toContain("Affiché une seule fois");
  });
});
