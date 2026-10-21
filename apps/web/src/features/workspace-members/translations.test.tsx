import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { Member } from "@/server/domains/workspaces/models/member";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { workspaceMembersList } from "./list";

vi.mock("@/server/domains/workspaces/actions/workspaces", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/workspaces/acme",
  useSearchParams: () => new URLSearchParams(),
}));

const { MembersTable } = await import("./MembersTable");
const { AddMembersDialog, MemberRoleSelect, RemoveMemberButton } = await import("./MemberControls");

/** A workspace's Members tab in three languages (feature 130). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const member = (extra: Partial<Member> = {}): Member => ({
  userId: "u1",
  email: "ana@example.com",
  name: "Ana",
  role: "moderator",
  disabled: false,
  addedAt: new Date("2026-10-01T10:00:00Z"),
  ...extra,
});

const ACME = { id: "w1", name: "acme" };
const list = workspaceMembersList("/workspaces/acme");

const table = (locale: Locale, rows: Member[], count = rows.length) =>
  view(
    locale,
    <MembersTable
      workspace={{ ...ACME, isGlobal: false }}
      list={list}
      state={parseListQuery(list, {})}
      members={rows}
      page={{ next: null, previous: null }}
      total={{ count, capped: false }}
      me="me"
    />,
  );

describe("the Members tab in three languages", () => {
  it("the filters, the columns and the count with its noun", () => {
    const rows = [
      member(),
      member({ userId: "me", email: "me@example.com", name: "Me", role: "admin", disabled: true }),
    ];
    const en = table("en", rows);
    expect(en).toContain("2 members");
    expect(en).toContain("(you)");
    const pt = table("pt", rows);
    for (const text of [
      "Pesquisar",
      "E-mail ou nome",
      "Qualquer papel",
      "Filtrar",
      ">Nome<",
      "Adicionado em",
      "(você)",
      "desativado",
      "2 membros",
    ])
      expect(pt, text).toContain(text);
    const fr = table("fr", rows);
    for (const text of [
      "Rechercher",
      "Courriel ou nom",
      "Tout rôle",
      "Filtrer",
      ">Nom<",
      "Ajouté le",
      "(vous)",
      "désactivé",
      "2 membres",
    ])
      expect(fr, text).toContain(text);
  });

  it("counts members by the language's plural at 0, 1 and 2", () => {
    expect(table("pt", [member()], 0)).toContain("0 membro<");
    expect(table("pt", [member()], 1)).toContain("1 membro<");
    expect(table("pt", [member(), member({ userId: "x" })], 2)).toContain("2 membros");
    expect(table("fr", [member()], 0)).toContain("0 membre<");
    expect(table("fr", [member()], 1)).toContain("1 membre<");
    expect(table("fr", [member(), member({ userId: "x" })], 2)).toContain("2 membres");
  });

  it("the empty states and the role names", () => {
    expect(table("pt", [])).toContain(
      "Ninguém ainda. Adicione membros para que possam propor aqui.",
    );
    expect(table("fr", [])).toContain("Personne pour l’instant.");
    const pt = view("pt", <MemberRoleSelect workspace={ACME} member={member()} />);
    expect(pt).toContain('aria-label="Papel de ana@example.com"');
    expect(pt).toContain(">Moderador<");
    expect(view("fr", <MemberRoleSelect workspace={ACME} member={member()} />)).toContain(
      ">Modérateur<",
    );
    // The signed-in user's own role is a badge, in the language.
    expect(table("fr", [member({ userId: "me", role: "admin" })])).toContain("admin");
  });

  it("Remove and Add members", () => {
    const remove = (l: Locale) =>
      view(
        l,
        <RemoveMemberButton workspace={ACME} member={{ userId: "u1", email: "ana@example.com" }} />,
      );
    expect(remove("pt")).toContain('aria-label="Remover ana@example.com"');
    expect(remove("fr")).toContain('aria-label="Retirer ana@example.com"');
    expect(view("pt", <AddMembersDialog workspace={ACME} />)).toContain("Adicionar membros");
    expect(view("fr", <AddMembersDialog workspace={ACME} />)).toContain("Ajouter des membres");
  });

  it("an email or name that looks like a placeholder is shown as typed", () => {
    const html = table("pt", [member({ name: "{x} <b>", email: "{y}@example.com" })]);
    expect(html).toContain("{x} &lt;b&gt;");
    expect(html).toContain("{y}@example.com");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English text is left`, async () => {
      const html = [
        table(locale, [member(), member({ userId: "me", name: "Me", disabled: true })]),
        table(locale, []),
        view(locale, <MemberRoleSelect workspace={ACME} member={member()} />),
        view(
          locale,
          <RemoveMemberButton workspace={ACME} member={{ userId: "u1", email: "a@b.c" }} />,
        ),
        view(locale, <AddMembersDialog workspace={ACME} />),
      ].join("\n");
      expect(await englishLeaks(["workspaces", "common"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["workspaces"], locale, html)).toBeGreaterThan(5);
    });
  }
});
