import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { CliAuthPanel } from "./CliAuthPanel";
import { rmkCommands } from "./commands";

type L = "en" | "pt" | "fr";
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));

describe("the CLI sign-in panel in three languages (132)", () => {
  it("reads in each language, with the commands left as they are typed", () => {
    const registry = "https://ronne.example";
    for (const locale of ["en", "pt", "fr"] as const) {
      const html = render(<CliAuthPanel registry={registry} />, locale);
      for (const command of Object.values(rmkCommands(registry)))
        expect(html, `${locale}: ${command}`).toContain(
          command.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
        );
    }
    expect(render(<CliAuthPanel />, "pt")).toContain("rmk login --registry &lt;url&gt;");
  });

  it("links to Access tokens, or says it is on that page", () => {
    expect(render(<CliAuthPanel />, "pt")).toContain('href="/account/tokens"');
    expect(render(<CliAuthPanel linkToTokens={false} />, "pt")).not.toContain(
      'href="/account/tokens"',
    );
    expect(render(<CliAuthPanel linkToTokens={false} />, "fr")).not.toContain(
      'href="/account/tokens"',
    );
  });

  it("the title and the three steps read in each language", () => {
    const cases: Record<L, string[]> = {
      en: ["Use rmk from the terminal", "Get rmk", "Sign in", "Check, then install"],
      pt: ["Use o rmk no terminal", "Instale o rmk", "Entre", "Confira e instale"],
      fr: [
        "Utilisez rmk dans le terminal",
        "Obtenez rmk",
        "Connectez-vous",
        "Vérifiez, puis installez",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = render(<CliAuthPanel />, locale);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: the panel leaves no English behind`, async () => {
      const html = [
        render(<CliAuthPanel registry="https://ronne.example" />, locale),
        render(<CliAuthPanel linkToTokens={false} />, locale),
      ].join("\n");
      expect(await englishLeaks(["common"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["common"], locale, html)).toBeGreaterThan(3);
    });
  }
});
