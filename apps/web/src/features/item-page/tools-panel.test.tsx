import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placeFor } from "@/components/tools/tool-paths";
import type { Locale } from "@/server/domains/identity/models/locale";
import { englishLeaks } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { ToolsPanel } from "./ToolsPanel";

/** The Works in tab words each tool's place in the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");
const code = (text: string) => `<code class="font-mono text-[11px] text-fg">${text}</code>`;
const panel = (locale: Locale, type: string, name = "fmt") =>
  view(locale, <ToolsPanel name={name} type={type} manifest={{ name: `@t/${name}`, type }} />);

describe("the Works in tab's places", () => {
  it("names a key in a file, with the key and the file as code", () => {
    expect(panel("en", "hook")).toContain(
      `Goes to ${code("hooks")} in ${code(".claude/settings.json")}.`,
    );
    expect(panel("pt", "hook")).toContain(
      `Vai para ${code("hooks")} em ${code(".claude/settings.json")}.`,
    );
    expect(panel("fr", "hook")).toContain(
      `Va dans la clé ${code("hooks")} de ${code(".claude/settings.json")}.`,
    );
  });

  it("names a path with the item's name in it", () => {
    expect(panel("pt", "skill", "{x}")).toContain(`Vai para ${code(".claude/skills/{x}/")}.`);
    expect(panel("fr", "agent")).toContain(`Va dans ${code(".codex/agents/fmt.toml")}.`);
  });

  it("names a section of AGENTS.md and a local plugin", () => {
    expect(panel("pt", "rule")).toContain(`uma seção de ${code("AGENTS.md")}`);
    expect(panel("fr", "rule")).toContain(`une section du fichier ${code("AGENTS.md")}`);
    expect(placeFor("claude-code", "lsp-server", "ls")).toEqual({
      kind: "plugin",
      path: ".claude/rmk-plugins/ls/",
    });
  });

  it("says a bundle installs its items, in a sentence of its own", () => {
    expect(panel("en", "bundle")).toContain("Installs its items one by one.");
    expect(panel("pt", "bundle")).toContain("Instala seus itens um por um.");
    expect(panel("fr", "bundle")).toContain("Installe ses éléments un par un.");
    expect(placeFor("codex", "bundle")).toBeNull();
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left in the places`, async () => {
      const html = ["hook", "rule", "bundle", "mcp-server", "permission-policy", "lsp-server"]
        .map((type) => panel(locale, type))
        .join("\n");
      expect(html).not.toMatch(/ in <code|installs its items|a local plugin|a section in/);
      expect(await englishLeaks(["item"], locale, html)).toEqual([]);
    });
  }
});
