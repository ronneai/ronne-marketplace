import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("@/features/submissions/actions", () => ({ createDraftFromForm: vi.fn() }));
vi.mock("./dependency-picker/actions", () => ({ findDependenciesAction: vi.fn() }));
vi.mock("./actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { NewDraftForm, NameHint, NoTypeMatch, RepeatNote, StarterFiles, useTypesMatching } =
  await import("@/features/submissions/NewDraftForm");
const { ManifestForm } = await import("./ManifestForm");
const { ViewSwitch } = await import("./DraftEditor");

/** What a hook gives, in a language: hooks run inside a render. */
const grab = <T,>(locale: Locale, hook: () => T): T => {
  let value: T | undefined;
  const Grab = () => {
    value = hook();
    return null;
  };
  view(locale, <Grab />);
  return value as T;
};

/** Propose item's form and the manifest form speak the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");

const scopes = [
  { name: "ana/tools", description: "Mine.", personal: true },
  { name: "platform", description: "Shared tools." },
  { name: "acme/infra", description: "Acme's." },
];
const newDraft = (locale: Locale, props: Partial<Parameters<typeof NewDraftForm>[0]> = {}) =>
  view(locale, <NewDraftForm scopes={scopes} mine={[]} {...props} />);

const manifestOf = (type: ItemType) =>
  draftTemplate(type, "@platform/reviewer").find((file) => file.path === "ronne.yaml")?.content ??
  "";
const form = (locale: Locale, type: ItemType, text = manifestOf(type)) =>
  view(
    locale,
    <ManifestForm
      text={text}
      type={type}
      itemName="@platform/reviewer"
      files={["prompt.md"]}
      onChange={() => {}}
      onShowYaml={() => {}}
    />,
  );

describe("the new-draft form in three languages", () => {
  it("names the steps, the scope groups and the types' tags", () => {
    const en = newDraft("en");
    expect(en).toContain("Where it lives");
    expect(en).toContain("Personal (ana)");
    expect(en).toContain(">agent skills<");
    expect(en).toContain("11 types");
    expect(en).toContain("@scope/");
    const pt = newDraft("pt");
    expect(pt).toContain("Onde ele fica");
    expect(pt).toContain("Pessoal (ana)");
    expect(pt).toContain(">skills de agente<");
    expect(pt).toContain(">⚠ risco<");
    expect(pt).toContain("11 tipos");
    expect(pt).toContain("Todos (11)");
    expect(pt).toContain("@escopo/");
    const fr = newDraft("fr");
    expect(fr).toContain("Ce qu’il est");
    expect(fr).toContain(">sous-agent<");
    expect(fr).toContain('placeholder="Filtrer les types, comme mcp, rule ou agent"');
    expect(fr).toContain("Personne d’autre que vous ne voit le brouillon");
  });

  it("says when there are no scopes, with a link to Workspaces", () => {
    expect(view("pt", <NewDraftForm scopes={[]} mine={[]} />)).toMatch(
      /em <a [^>]*href="\/workspaces"[^>]*>Espaços de trabalho<\/a>, ou peça/,
    );
    expect(view("fr", <NewDraftForm scopes={[]} mine={[]} />)).toContain(
      "Il n’y a pas encore de portée.",
    );
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left on the form`, async () => {
      const html = [newDraft(locale), view(locale, <NewDraftForm scopes={[]} mine={[]} />)].join(
        "\n",
      );
      expect(await englishLeaks(["author", "help", "common", "types"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(15);
    });
  }
});

describe("the new-draft form's states in three languages", () => {
  it("shows the starter files and the review note for a standard and a high-risk type", () => {
    const standard = (l: Locale) => view(l, <StarterFiles type="agent" itemName="@platform/{x}" />);
    const risky = (l: Locale) => view(l, <StarterFiles type="hook" itemName="@platform/a" />);
    expect(standard("en")).toContain("And prompt.md. You edit them all in the next step.");
    expect(standard("pt")).toContain(">modelo<");
    expect(standard("pt")).toContain("E prompt.md. Você edita todos no próximo passo.");
    expect(standard("pt")).toContain(">Revisão<");
    expect(standard("pt")).toContain(">padrão<");
    expect(standard("pt")).toContain("Ele não executa programas nem muda permissões");
    expect(standard("pt")).toContain("name: &quot;@platform/{x}&quot;");
    expect(risky("fr")).toContain(">alerte de risque<");
    expect(risky("fr")).toContain("Il exécute des programmes");
    expect(risky("fr")).toContain(">Révision<");
    const bundle = (l: Locale) => view(l, <StarterFiles type="bundle" itemName="@p/b" />);
    expect(bundle("pt")).toContain("Você o edita no próximo passo.");
    expect(view("fr", <StarterFiles type={null} itemName="@p/b" />)).toContain(
      "Choisissez un type pour voir le ronne.yaml",
    );
  });

  it("words each name problem, the hint and the repeat note", () => {
    const hint = (l: Locale, problem: Parameters<typeof NameHint>[0]["problem"]) =>
      view(l, <NameHint problem={problem} />);
    expect(hint("en", "too_long")).toContain("Use at most 64 characters.");
    expect(hint("pt", "too_long")).toContain("Use no máximo 64 caracteres.");
    expect(hint("pt", "characters")).toContain("Use apenas letras minúsculas, dígitos e hifens.");
    expect(hint("fr", "edges")).toContain("Ne commencez ni ne terminez par un trait d’union.");
    expect(hint("fr", "reserved")).toContain("Ce nom est réservé.");
    expect(hint("pt", "empty")).toContain("Digite um nome.");
    expect(hint("fr", null)).toContain("Le nom complet de l’élément.");
    expect(view("pt", <RepeatNote itemName="@p/{x}" />)).toContain(
      "Você já tem um rascunho chamado @p/{x}. Ainda pode criar outro.",
    );
    expect(view("fr", <RepeatNote itemName="@p/a" />)).toContain(">NOTE :<");
  });

  it("says when no type matches the filter", () => {
    expect(view("en", <NoTypeMatch />)).toContain(
      "No type matches. Clear the filter to see all 11.",
    );
    expect(view("pt", <NoTypeMatch />)).toContain(
      "Nenhum tipo corresponde. Limpe o filtro para ver todos os 11.",
    );
    expect(view("fr", <NoTypeMatch />)).toContain(
      "Aucun type ne correspond. Effacez le filtre pour voir les 11.",
    );
  });

  it("searches a type's tag as it reads in the language, and its group", () => {
    const match = (l: Locale, search: string, group: "runtime" | null = null) =>
      grab(l, useTypesMatching)(search, group);
    expect(match("en", "lifecycle")).toEqual(["hook"]);
    expect(match("pt", "ciclo")).toEqual(["hook"]);
    expect(match("pt", "lifecycle")).toEqual([]);
    expect(match("fr", "sous-agent")).toEqual(["agent"]);
    expect(match("fr", "", "runtime")).toEqual([
      "hook",
      "mcp-server",
      "permission-policy",
      "statusline",
      "lsp-server",
    ]);
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left in the form's other states`, async () => {
      const html = [
        view(locale, <StarterFiles type="agent" itemName="@p/a" />),
        view(locale, <StarterFiles type="hook" itemName="@p/a" />),
        view(locale, <StarterFiles type="bundle" itemName="@p/a" />),
        view(locale, <StarterFiles type={null} itemName="@p/a" />),
        ...(["empty", "too_long", "characters", "edges", "reserved", null] as const).map((p) =>
          view(locale, <NameHint problem={p} />),
        ),
        view(locale, <RepeatNote itemName="@p/a" />),
        view(locale, <NoTypeMatch />),
      ].join("\n");
      expect(await englishLeaks(["author", "help", "common", "types"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["author", "common"], locale, html)).toBeGreaterThan(8);
    });
  }
});

describe("the editor's view switch in three languages", () => {
  it("names the views and the group", () => {
    const html = (l: Locale) =>
      view(l, <ViewSwitch views={["form", "yaml", "canvas"]} view="form" onChange={() => {}} />);
    expect(html("en")).toContain(">ronne.yaml view<");
    expect(html("en")).toContain(">Form<");
    expect(html("pt")).toContain(">Formulário<");
    expect(html("pt")).toContain(">Visão do ronne.yaml<");
    expect(html("fr")).toContain(">Canevas<");
    expect(html("fr")).toContain(">Vue de ronne.yaml<");
    expect(html("fr")).toContain(">YAML<");
  });
});

describe("the manifest form in three languages", () => {
  it("keeps ronne.yaml's keys as written and words everything around them", () => {
    const pt = form("pt", "agent");
    expect(pt).toContain(">description<");
    expect(pt).toContain(">license<");
    expect(pt).toContain(">opcional<");
    expect(pt).toContain(">(nenhum)<");
    expect(pt).toContain("O que ele faz e quando usar.");
    expect(pt).toContain("Até 10, em letras minúsculas, dígitos e hifens.");
    expect(pt).toContain(">Adicionar keywords<");
    expect(pt).toContain(">Adicionar tools<");
    // A hook's matcher names a tool, with the hint.
    expect(form("pt", "hook")).toContain("Uma ferramenta como read ou shell");
    expect(form("en", "hook")).toContain("A tool such as read or shell");
    const fr = form("fr", "agent");
    expect(fr).toContain("Le nom et le type viennent du brouillon.");
    expect(fr).toContain(">Autre identifiant SPDX…<");
    expect(fr).toContain(">facultatif<");
  });

  it("names a missing file, and the map's key and value", () => {
    const missing = form("fr", "agent", manifestOf("agent").replace("prompt.md", "gone.md"));
    expect(missing).toContain("gone.md (manquant)");
    const headers = form(
      "pt",
      "mcp-server",
      `${manifestOf("mcp-server")}  headers:\n    X-Team: "{x}"\n`,
    );
    expect(headers).toContain('placeholder="Nome"');
    expect(headers).toContain('placeholder="Valor"');
    expect(headers).toContain('aria-label="Remover headers 1"');
    expect(headers).toContain('aria-label="headers 1: Nome"');
    expect(
      form("fr", "mcp-server", `${manifestOf("mcp-server")}  headers:\n    X-Team: a\n`),
    ).toContain('aria-label="headers 1 : Valeur"');
    expect(headers).toContain('value="{x}"');
  });

  it("asks for valid YAML in the language", () => {
    expect(form("pt", "agent", "name: [")).toContain("O formulário precisa de um YAML válido.");
    expect(form("fr", "agent", "name: [")).toContain("Ouvrir le YAML");
  });

  it("words the dependencies field for a type that has them", () => {
    expect(form("pt", "bundle")).toContain("Os itens que este bundle instala.");
    expect(form("fr", "agent")).toContain("Trouvez-en une en tapant une partie de son nom");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left on any type's form`, async () => {
      const html = ITEM_TYPES.map((type) => form(locale, type)).join("\n");
      expect(await englishLeaks(["author", "help", "common"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(8);
    });
  }
});
