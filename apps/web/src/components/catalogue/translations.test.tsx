import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { ItemCard } from "./ItemCard";
import { ItemPlace } from "./ItemPlace";

/** The card and the place line speak the person's language (feature 130). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const entry = (overrides: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "i1",
  workspace: "acme",
  privateWorkspace: true,
  personalWorkspace: false,
  scope: "team",
  name: "fmt",
  type: "hook",
  version: "1.2.0",
  description: "",
  keywords: ["format"],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: true,
  deprecatedMessage: "Use the new one.",
  installable: false,
  downloadCount: 12345,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
  ...overrides,
});

describe("ItemCard in three languages", () => {
  const cases: Record<Locale, string[]> = {
    en: ["⚠ risk", "deprecated", "no installable version", "No description.", "12,345 installs"],
    pt: [
      "⚠ risco",
      "obsoleto",
      "nenhuma versão instalável",
      "Sem descrição.",
      "12.345 instalações",
    ],
    fr: ["⚠ risque", "obsolète", "aucune version installable", "Aucune description."],
  };
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: its badges, empty description and install count`, () => {
      const html = view(locale, <ItemCard entry={entry()} />);
      for (const text of cases[locale]) expect(html, text).toContain(text);
    });
  }

  it("the line under the card reads in the language's order, dot-separated", () => {
    expect(view("en", <ItemCard entry={entry()} />)).toMatch(/#format · published .* · works in/);
    expect(view("pt", <ItemCard entry={entry()} />)).toMatch(
      /#format · publicado em .* · funciona em/,
    );
    expect(view("fr", <ItemCard entry={entry()} />)).toMatch(
      /#format · publié le .* · fonctionne dans/,
    );
  });

  it("counts installs by the language's plural rule", () => {
    const one = (l: Locale) => view(l, <ItemCard entry={entry({ downloadCount: 1 })} />);
    expect(one("en")).toContain("1 install<");
    expect(one("pt")).toContain("1 instalação");
    expect(one("fr")).toContain("1 installation");
    const none = (l: Locale) => view(l, <ItemCard entry={entry({ downloadCount: 0 })} />);
    expect(none("en")).toContain("0 installs");
    expect(none("pt")).toContain("0 instalação<");
    expect(none("fr")).toContain("0 installation<");
    const two = (l: Locale) => view(l, <ItemCard entry={entry({ downloadCount: 2 })} />);
    expect(two("en")).toContain("2 installs");
    expect(two("pt")).toContain("2 instalações");
    expect(two("fr")).toContain("2 installations");
  });

  it("a keyword or description that looks like a placeholder is shown as typed", () => {
    const html = view(
      "pt",
      <ItemCard entry={entry({ keywords: ["{x}"], description: "Uses {count} things." })} />,
    );
    expect(html).toContain("#{x}");
    expect(html).toContain("Uses {count} things.");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English text is left`, async () => {
      const html = [
        view(locale, <ItemCard entry={entry()} />),
        view(
          locale,
          <ItemCard
            entry={entry({ workspace: "u", privateWorkspace: false, personalWorkspace: true })}
          />,
        ),
      ].join("\n");
      expect(await englishLeaks(["catalogue"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["catalogue"], locale, html)).toBeGreaterThan(4);
    });
  }
});

describe("ItemPlace in three languages", () => {
  it("names the workspace and the scope", () => {
    const place = (l: Locale) =>
      view(
        l,
        <ItemPlace
          workspace="acme"
          scope="team"
          privateWorkspace={false}
          personalWorkspace={false}
        />,
      );
    expect(place("en")).toContain("<span>Workspace</span>");
    expect(place("pt")).toContain("<span>Espaço de trabalho</span>");
    expect(place("fr")).toContain("<span>Espace de travail</span>");
    expect(place("fr")).toContain("<span>Portée</span>");
  });

  it("says personal and private, with the workspace in the hover text", () => {
    const priv = (l: Locale) =>
      view(
        l,
        <ItemPlace workspace="acme" scope="team" privateWorkspace personalWorkspace={false} />,
      );
    expect(priv("pt")).toContain("Só os membros de acme e o root veem este item.");
    expect(priv("fr")).toContain("Seuls les membres de acme et root voient cet élément.");
    const personal = (l: Locale) =>
      view(l, <ItemPlace workspace="u" scope="team" privateWorkspace={false} personalWorkspace />);
    expect(personal("pt")).toContain("(pessoal)");
    expect(personal("fr")).toContain("(personnel)");
  });
});
