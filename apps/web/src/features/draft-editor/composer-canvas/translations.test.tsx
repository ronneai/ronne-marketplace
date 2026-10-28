import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ComposerCanvas,
  toFlowEdges,
  useAriaLabels,
  useDescribe,
} from "@/components/dependency-canvas/ComposerCanvas";
import { ComposerContext } from "@/components/dependency-canvas/context";
import { toGraph } from "@/components/dependency-canvas/graph";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { DependencyPanel } from "./DependencyPanel";
import type { PickerEntry } from "./types";

vi.mock("./actions", () => ({
  dependencyReportsAction: vi.fn(),
  searchDependenciesAction: vi.fn(() => new Promise(() => {})),
}));
vi.mock("../dependency-picker/actions", () => ({ findDependenciesAction: vi.fn() }));

const { ComposerView } = await import("./ComposerView");
const { CataloguePicker, PickerResults } = await import("./CataloguePicker");
const { DependencyField, RangeInput } = await import("../dependency-picker/DependencyField");
const { usePickerWords } = await import("../dependency-picker/words");

/** The dependency canvas, its list and the pickers speak the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");

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

const facts = {
  type: "mcp-server" as const,
  version: "1.4.0",
  description: "",
  tools: ["Claude Code", "Codex"],
};
const graph = toGraph({
  itemName: "@team/reviewer",
  type: "agent",
  dependencies: {
    "@team/git": "^1.0.0",
    "@team/tone": "",
    "@team/new": "^1.0.0",
    "@team/{x}": "1.0.0",
  },
  layout: {},
  reports: {
    "@team/git": { facts: { ...facts }, problems: [], warnings: ["`@team/git` is odd."] },
    "@team/tone": { facts: null, status: "submitted", problems: ["`@team/tone` isn't released."] },
    "@team/new": { facts: null, problems: [] },
    "@team/{x}": { facts: { ...facts, tools: [] }, problems: [] },
  },
  issues: [],
});

/**
 * React Flow's hidden how-to texts for screen readers, which it fills from `useAriaLabels` once the
 * page loads (an effect): on the server they're its English defaults. Their words are checked
 * through `useAriaLabels` below.
 */
const withoutHowTo = (html: string) =>
  html.replace(/<div id="react-flow__(?:node|edge)-desc-[^"]*"[^>]*>[^<]*<\/div>/g, "");

const canvas = (locale: Locale, readOnly = false) =>
  view(
    locale,
    <ComposerContext value={{ readOnly, setRange: () => {}, remove: () => {} }}>
      <ComposerCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        readOnly={readOnly}
        settled
        onMove={() => {}}
        onRemove={() => {}}
      />
    </ComposerContext>,
  );

const panel = (
  locale: Locale,
  readOnly = false,
  failed = false,
  type: "agent" | "bundle" = "agent",
) =>
  view(
    locale,
    <ComposerContext value={{ readOnly, setRange: () => {}, remove: () => {} }}>
      <DependencyPanel type={type} nodes={graph.nodes} failed={failed} onShow={() => {}} />
    </ComposerContext>,
  );

const entry = (overrides: Partial<PickerEntry> = {}): PickerEntry => ({
  ...facts,
  tools: ["Claude Code"],
  name: "@team/git",
  status: "published",
  mine: false,
  ...overrides,
});

const option = (overrides: Partial<DependencyOption> = {}): DependencyOption => ({
  name: "@team/github",
  type: "mcp-server",
  status: "published",
  mine: false,
  description: null,
  versions: ["1.4.0", "0.2.3", "0.0.3"],
  latest: "1.4.0",
  ...overrides,
});

describe("the canvas in three languages", () => {
  it("words each node: its facts, range, tools, problems and the unreleased badge", () => {
    const en = canvas("en");
    expect(en).toContain("works in Claude Code, Codex");
    expect(en).toContain("works in no built-in tool");
    expect(en).toContain(">in review, yours<");
    expect(en).toContain(">not published<");
    const pt = canvas("pt");
    expect(pt).toContain("funciona em Claude Code, Codex");
    expect(pt).toContain("não funciona em nenhuma ferramenta integrada");
    expect(pt).toContain(">em revisão, seu<");
    expect(pt).toContain(">não publicado<");
    expect(pt).toContain('aria-label="Intervalo de @team/git"');
    expect(pt).toContain('aria-label="Remover @team/git"');
    expect(pt).toContain(">ERRO:<");
    expect(pt).toContain(">AVISO:<");
    // The registry's checks stay as they come, as core's do.
    expect(pt).toContain("<code");
    expect(pt).toContain("isn&#x27;t released.");
    const fr = canvas("fr");
    expect(fr).toContain(">plage<");
    expect(fr).toContain("ne fonctionne dans aucun outil intégré");
    expect(fr).toContain(">en révision, à vous<");
    expect(fr).toContain('aria-label="Zoom avant"');
    expect(fr).toContain('aria-label="Ajuster à la vue"');
  });

  it("names each node for screen readers, with a placeholder-looking name as typed", () => {
    const [item, ...deps] = graph.nodes;
    const describe = (l: Locale) => grab(l, useDescribe);
    expect(item && describe("en")(item)).toBe("@team/reviewer, this agent");
    expect(item && describe("pt")(item)).toBe("@team/reviewer, este item (agent)");
    const git = deps.find((n) => n.data.name === "@team/git");
    const tone = deps.find((n) => n.data.name === "@team/tone");
    const odd = deps.find((n) => n.data.name === "@team/{x}");
    expect(git && describe("en")(git)).toBe("@team/git, mcp-server, range ^1.0.0");
    expect(tone && describe("en")(tone)).toBe("@team/tone, dependency, range empty");
    expect(tone && describe("fr")(tone)).toBe("@team/tone, dépendance, plage vide");
    expect(odd && describe("pt")(odd)).toBe("@team/{x}, mcp-server, intervalo 1.0.0");
  });

  it("reads each edge as a sentence, and each node and edge with its role in the language", () => {
    const edges = (l: Locale) => {
      const t = grab(l, () => useTranslations("author.canvas"));
      return toFlowEdges(graph.edges, graph.nodes, {
        label: (item, dependency) => t("edge", { item, dependency }),
        role: t("roleEdge"),
      });
    };
    expect(edges("en").map((e) => e.ariaLabel)).toContain("@team/reviewer depends on @team/git");
    expect(edges("pt").map((e) => e.ariaLabel)).toContain("@team/reviewer depende de @team/{x}");
    expect(edges("fr")[0]?.domAttributes).toEqual({ "aria-roledescription": "lien" });
    expect(edges("fr").some((e) => /Edge from/.test(e.ariaLabel))).toBe(false);
    expect(grab("pt", useDescribe).role).toBe("nó");
    // The nodes carry it: React Flow's own "node" is replaced.
    expect(canvas("fr")).toContain('aria-roledescription="nœud"');
    expect(canvas("fr")).not.toContain('aria-roledescription="node"');
  });

  it("tells screen readers how to move a node, and where it went", () => {
    const en = grab("en", () => useAriaLabels(false));
    expect(en["node.a11yDescription.default"]).toContain("move it with the arrow keys");
    expect(en["node.a11yDescription.ariaLiveMessage"]({ direction: "up", x: 1, y: 2 })).toBe(
      "Moved selected node up. New position, x: 1, y: 2",
    );
    const pt = grab("pt", () => useAriaLabels(true));
    expect(pt["node.a11yDescription.default"]).toBe(
      "Pressione Enter ou espaço para selecionar um nó.",
    );
    expect(pt["node.a11yDescription.ariaLiveMessage"]({ direction: "left", x: 3, y: 4 })).toBe(
      "Nó selecionado movido para a esquerda. Nova posição, x: 3, y: 4",
    );
    const fr = grab("fr", () => useAriaLabels(false));
    expect(fr["node.a11yDescription.ariaLiveMessage"]({ direction: "right", x: 5, y: 6 })).toBe(
      "Nœud sélectionné déplacé vers la droite. Nouvelle position, x : 5, y : 6",
    );
    expect(fr["minimap.ariaLabel"]).toBe("Mini-carte du canevas");
    expect(fr["edge.a11yDescription.default"]).toBe(
      "Appuyez sur Entrée ou Espace pour sélectionner un lien.",
    );
    // Only the hidden how-to texts are stripped: the canvas keeps everything else.
    expect(canvas("pt").length - withoutHowTo(canvas("pt")).length).toBeLessThan(400);
  });
});

describe("the dependency list in three languages", () => {
  it("heads, counts and notes the list", () => {
    expect(panel("en")).toContain(
      'Dependencies <span class="font-mono text-xs text-muted">(4)</span>',
    );
    expect(panel("pt")).toContain("Dependências <span");
    expect(panel("pt")).toContain("Itens instalados com este.");
    expect(panel("fr", false, false, "bundle")).toContain("Les éléments que ce bundle installe.");
    expect(panel("pt", false, true)).toContain("Não foi possível acessar o catálogo.");
    expect(panel("fr")).toContain('title="Afficher sur le canevas"');
  });

  it("says when there are none yet, and how to add one unless it's read-only", () => {
    const empty = (l: Locale, readOnly: boolean) =>
      view(
        l,
        <ComposerContext value={{ readOnly, setRange: () => {}, remove: () => {} }}>
          <DependencyPanel
            type="agent"
            nodes={graph.nodes.slice(0, 1)}
            failed={false}
            onShow={() => {}}
          />
        </ComposerContext>,
      );
    expect(empty("pt", true)).toContain(">Nenhuma ainda.<");
    expect(empty("fr", false)).toContain(
      "Aucune pour l’instant. Ajoutez-en une depuis le catalogue, ou glissez-la sur le canevas.",
    );
  });

  it("asks for valid YAML in the language", () => {
    const html = view(
      "fr",
      <ComposerView
        itemName="@platform/reviewer"
        type="agent"
        manifest="name: ["
        layout={undefined}
        issues={[]}
        readOnly={false}
        onChange={() => {}}
        onShowYaml={() => {}}
      />,
    );
    expect(html).toContain("Le canevas a besoin d’un YAML valide.");
    expect(html).toContain("Ouvrir le YAML");
  });
});

describe("the catalogue picker in three languages", () => {
  it("labels the search and says it's searching", () => {
    const html = (l: Locale) =>
      view(l, <CataloguePicker itemName="@t/a" type="agent" added={new Set()} onAdd={() => {}} />);
    expect(html("pt")).toContain('placeholder="Nome ou palavra-chave"');
    expect(html("pt")).toContain(">Qualquer tipo<");
    expect(html("pt")).toContain("Pesquisando…");
    expect(html("fr")).toContain(">Ajouter depuis le catalogue<");
  });

  it("words each result: yours, on its way, added or to add", () => {
    const html = (l: Locale) =>
      view(
        l,
        <PickerResults
          entries={[
            entry({ mine: true }),
            entry({ name: "@team/b", status: "approved", mine: true }),
            entry({ name: "@team/c" }),
          ]}
          added={new Set(["@team/c"])}
          onAdd={() => {}}
        />,
      );
    expect(html("en")).toContain("v1.4.0, yours");
    expect(html("pt")).toContain("v1.4.0, seu");
    expect(html("pt")).toContain(">aguardando lançamento, seu<");
    expect(html("pt")).toContain(">adicionado<");
    expect(html("fr")).toContain('aria-label="Ajouter @team/git"');
    expect(html("fr")).toContain(">Ajouter<");
  });
});

describe("the version picker in three languages", () => {
  it("words the groups and what each range accepts", () => {
    const groups = (l: Locale) => grab(l, usePickerWords).versionChoices(option());
    expect(groups("en").map((g) => g.label)).toEqual(["Compatible", "Exactly"]);
    expect(groups("pt")[0]?.choices.map((c) => c.label)).toEqual([
      "^1.4.0 · a 1.4.0 ou uma 1.x posterior, a mais recente",
      "^0.2.3 · a 0.2.3 ou uma 0.2.x posterior",
      "^0.0.3 · somente a 0.0.3",
    ]);
    expect(groups("fr")[1]?.label).toBe("Exacte");
    expect(groups("fr")[1]?.choices[0]?.label).toBe("1.4.0 · exactement la 1.4.0");
    const first = (l: Locale) =>
      grab(l, usePickerWords).versionChoices(option({ versions: [], latest: null }));
    expect(first("pt").map((g) => g.choices[0]?.accepts)).toEqual([
      "o primeiro lançamento, ou uma 1.x posterior",
      "exatamente o primeiro lançamento",
    ]);
  });

  it("words each option's status, and whose it is", () => {
    const status = (l: Locale, o: DependencyOption) => grab(l, usePickerWords).statusText(o);
    expect(status("pt", option())).toBe("publicado na 1.4.0");
    expect(status("fr", option({ mine: true }))).toBe("1.4.0 publiée, à vous");
    expect(status("pt", option({ status: "draft", mine: true, latest: null }))).toBe(
      "rascunho, seu",
    );
    expect(status("fr", option({ status: "changes_requested", latest: null }))).toBe(
      "renvoyé à son auteur",
    );
    expect(status("en", option({ latest: null }))).toBe("published");
  });

  it("labels the field, its rows and the draft note", () => {
    const field = (l: Locale) =>
      view(
        l,
        <DependencyField
          value={{ "@team/git": "^1.2.3" }}
          type="agent"
          itemName="@t/a"
          onChange={() => {}}
        />,
      );
    expect(field("pt")).toContain('aria-label="Adicionar uma dependência"');
    expect(field("pt")).toContain('aria-label="Intervalo de @team/git"');
    expect(field("pt")).toContain("a 1.2.3 ou uma 1.x posterior");
    expect(field("fr")).toContain(
      'placeholder="Ajouter une dépendance : tapez une partie de son nom"',
    );
    expect(field("fr")).toContain('aria-label="Retirer @team/git"');
    const select = view(
      "fr",
      <RangeInput name="@team/git" range="^1.4.0" option={option()} onChange={() => {}} />,
    );
    expect(select).toContain('aria-label="Version de @team/git"');
    expect(select).toContain('label="Compatible"');
  });
});

for (const locale of ["pt", "fr"] as const) {
  it(`${locale}: no English left on the canvas, the list and the pickers`, async () => {
    const html = [
      withoutHowTo(canvas(locale)),
      // Read-only, as the item page's Overview shows it (130).
      withoutHowTo(canvas(locale, true)),
      panel(locale, false, true),
      view(
        locale,
        <CataloguePicker itemName="@t/a" type="agent" added={new Set()} onAdd={() => {}} />,
      ),
      view(
        locale,
        <PickerResults
          entries={[entry({ mine: true }), entry({ name: "@t/c" })]}
          added={new Set(["@t/c"])}
          onAdd={() => {}}
        />,
      ),
      view(
        locale,
        <DependencyField
          value={{ "@team/git": "^1.2.3" }}
          type="agent"
          itemName="@t/a"
          onChange={() => {}}
        />,
      ),
    ].join("\n");
    expect(await englishLeaks(["author", "help", "common"], locale, html)).toEqual([]);
    expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(10);
  });
}
