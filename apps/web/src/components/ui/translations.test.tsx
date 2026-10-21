import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import type { Locale } from "@/server/domains/identity/models/locale";
import { inLocale } from "@/test/intl";
import { CopyableCommand } from "./CopyableCommand";
import { Dialog } from "./Dialog";
import { DirtyMark } from "./DirtyMark";
import { DataTable } from "./data-table/DataTable";
import { FilterChips } from "./data-table/FilterChips";
import { defineList, parseListQuery } from "./data-table/list-query";
import { FieldError, FieldWarning } from "./Field";
import { NewTabLink } from "./NewTabLink";
import { PasswordInput } from "./PasswordInput";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

/**
 * The shared pieces speak the person's language (feature 129): each renders in English, Portuguese
 * and French from the message files, with numbers formatted the way the language writes them.
 */
const html = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const each = (cases: Record<Locale, string[]>, render: (locale: Locale) => string) => {
  for (const [locale, expected] of Object.entries(cases) as [Locale, string[]][]) {
    const out = render(locale);
    for (const text of expected) expect(out, `${locale}: ${text}`).toContain(text);
  }
};

const LIST = defineList({
  path: "/things",
  sorts: { time: "desc", name: "asc" },
  defaultSort: "time",
  sizes: [25, 50],
  defaultSize: 50,
  filters: { q: "string" },
});

describe("the shared UI pieces in three languages (129)", () => {
  it("Dialog's close button", () => {
    each(
      { en: ['aria-label="Close"'], pt: ['aria-label="Fechar"'], fr: ['aria-label="Fermer"'] },
      (l) =>
        html(
          l,
          <Dialog open={false} onClose={() => {}} title="x">
            y
          </Dialog>,
        ),
    );
  });

  it("CopyableCommand's button", () => {
    each({ en: [">copy<"], pt: [">copiar<"], fr: [">copier<"] }, (l) =>
      html(l, <CopyableCommand command="rmk login" />),
    );
  });

  it("CopyableCommand keeps a caller's own label, lowercased", () => {
    expect(html("pt", <CopyableCommand command="x" label="Copy token" />)).toContain(
      ">copy token<",
    );
  });

  it("PasswordInput's show button", () => {
    each(
      {
        en: ['aria-label="Show password"'],
        pt: ['aria-label="Mostrar senha"'],
        fr: ['aria-label="Afficher le mot de passe"'],
      },
      (l) => html(l, <PasswordInput />),
    );
  });

  it("field errors and warnings", () => {
    each({ en: ["ERR:"], pt: ["ERRO:"], fr: ["ERREUR :"] }, (l) =>
      html(l, <FieldError id="a">x</FieldError>),
    );
    each({ en: ["WARN:"], pt: ["AVISO:"], fr: ["ATTENTION :"] }, (l) =>
      html(l, <FieldWarning id="a">x</FieldWarning>),
    );
  });

  it("NewTabLink's spoken note", () => {
    each(
      {
        en: ["(opens in a new tab)"],
        pt: ["(abre em uma nova aba)"],
        fr: ["(s’ouvre dans un nouvel onglet)"],
      },
      (l) => html(l, <NewTabLink href="https://example.com">Docs</NewTabLink>),
    );
  });

  it("DirtyMark's words and hint, unless the caller gives its own", () => {
    each(
      {
        en: ["Unsaved changes", "Save with Ctrl+S or ⌘S."],
        pt: ["Alterações não salvas", "Salve com Ctrl+S ou ⌘S."],
        fr: ["Modifications non enregistrées", "Enregistrez avec Ctrl+S ou ⌘S."],
      },
      (l) => html(l, <DirtyMark />),
    );
    const own = html("fr", <DirtyMark label="Draft changed" hint="Press save" />);
    expect(own).toContain("Draft changed");
    expect(own).toContain("Press save");
  });

  it("the leave-without-saving dialog", () => {
    each(
      {
        en: ["Leave without saving?", "Stay on this page"],
        pt: ["Sair sem salvar?", "Ficar nesta página"],
        fr: ["Quitter sans enregistrer?", "Rester sur cette page"],
      },
      (l) => html(l, <UnsavedChangesGuard dirty />),
    );
  });

  it("DataTable's pager, count and empty state", () => {
    const render = (locale: Locale, count: number, capped: boolean, rows = 2) =>
      html(
        locale,
        <DataTable
          list={LIST}
          state={parseListQuery(LIST, { cursor: "c1" })}
          columns={[{ id: "name", header: "Name", render: (t: { id: string }) => t.id }]}
          rows={Array.from({ length: rows }, (_, i) => ({ id: `r${i}` }))}
          rowKey={(t) => t.id}
          page={{ next: "c2", previous: "c0" }}
          total={{ count, capped }}
          noun="things"
          empty={{ none: "None", filtered: "Filtered" }}
        />,
      );
    each(
      {
        en: ["Previous page", "Next page", "First page", "Show"],
        pt: ["Página anterior", "Próxima página", "Primeira página", "Mostrar"],
        fr: ["Page précédente", "Page suivante", "Première page", "Afficher"],
      },
      (l) => render(l, 2, false),
    );
    // Numbers are written the way each language writes them, and a capped count keeps its +.
    expect(render("en", 12345, true)).toContain("12,345+ things");
    expect(render("pt", 12345, false)).toContain("12.345 things");
    expect(render("fr", 12345, false)).toMatch(/12\s345 things/);
    each(
      {
        en: ["Nothing left on this page."],
        pt: ["Não há mais nada nesta página."],
        fr: ["Il ne reste rien sur cette page."],
      },
      (l) => render(l, 0, false, 0),
    );
  });

  it("the sr-only header of a column with no name", () => {
    const render = (locale: Locale) =>
      html(
        locale,
        <DataTable
          list={LIST}
          state={parseListQuery(LIST, {})}
          columns={[{ id: "open", header: "", render: () => "x" }]}
          rows={[{ id: "a" }]}
          rowKey={(t: { id: string }) => t.id}
          page={{ next: null, previous: null }}
          total={{ count: 1, capped: false }}
          noun="things"
          empty={{ none: "None", filtered: "Filtered" }}
        />,
      );
    each({ en: [">Actions<"], pt: [">Ações<"], fr: [">Actions<"] }, render);
  });

  it("FilterChips", () => {
    each(
      {
        en: [
          'aria-label="Active filters"',
          'aria-label="Remove the name filter"',
          ">Clear<",
          ">Name:<",
        ],
        pt: [
          'aria-label="Filtros ativos"',
          'aria-label="Remover o filtro name"',
          ">Limpar<",
          ">Name:<",
        ],
        fr: [
          'aria-label="Filtres actifs"',
          'aria-label="Retirer le filtre name"',
          ">Effacer<",
          ">Name :<",
        ],
      },
      (l) =>
        html(
          l,
          <FilterChips
            list={LIST}
            state={parseListQuery(LIST, { q: "alpha" })}
            labels={{ q: "Name" }}
          />,
        ),
    );
  });

  it("the not-found and error pages", () => {
    each(
      {
        en: ["Page not found", "Go to Home"],
        pt: ["Página não encontrada", "Ir para o início"],
        fr: ["Page introuvable", "Aller à l’accueil"],
      },
      (l) => html(l, <NotFound />),
    );
    each(
      {
        en: ["Something went wrong", "Try again", "Reference: abc123"],
        pt: ["Algo deu errado", "Tentar de novo", "Referência: abc123"],
        fr: ["Une erreur s’est produite", "Réessayer", "Référence : abc123"],
      },
      (l) =>
        html(
          l,
          <ErrorPage
            error={Object.assign(new Error("x"), { digest: "abc123" })}
            reset={() => {}}
          />,
        ),
    );
    // Without a digest there is no reference line.
    expect(html("en", <ErrorPage error={new Error("x")} reset={() => {}} />)).not.toContain(
      "Reference",
    );
  });
});
