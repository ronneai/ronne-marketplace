import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { ArtifactUnavailableError } from "@/server/domains/items/exceptions/errors";
import type { ContentFile } from "@/server/domains/items/models/contents";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { itemPageData } from "../fixtures";
import { guardrailsOf, riskLabelsOf, settingsOf } from "./model";

const versions = vi.hoisted(() => ({ itemPage: vi.fn(), versionContents: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
const usage = vi.hoisted(() => ({ itemUsage: vi.fn() }));
vi.mock("@/server/domains/usage/actions/usage", () => usage);
vi.mock("@/server/domains/items/actions/catalogue", () => ({
  dependencyFacts: vi.fn(async () => ({})),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/domains/shelves/actions/pins", () => ({ pinTargets: async () => [] }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => ({
  itemMoveView: async () => null,
}));
vi.mock("@/features/item-move/actions", () => ({}));
vi.mock("@/server/domains/shelves/actions/favorites", () => ({
  favoritedAmong: async () => new Set<string>(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/items/team/github",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../actions", () => ({ proposeChangeAction: vi.fn() }));

const { default: Item } = await import("@/app/(app)/items/[scope]/[name]/page");

/** The Overview tab in three languages (feature 130). */
const render = async (locale: Locale) => {
  const tree = await Item({
    params: Promise.resolve({ scope: "team", name: "github" }),
    searchParams: Promise.resolve({}),
  });
  return inLocale(locale, () => renderToStaticMarkup(tree));
};

const text = (path: string, value: string): ContentFile => ({
  path,
  size: value.length,
  executable: false,
  kind: "text",
  text: value,
});

const days = Array.from({ length: 14 }, (_, i) => ({
  day: `2026-10-${String(i + 6).padStart(2, "0")}`,
  runs: i === 4 ? 412 : 20,
  installs: i === 2 ? 7 : 1,
  removals: 0,
}));

const shownUsage = (extra: Record<string, unknown> = {}) => ({
  shown: true,
  collecting: true,
  runsCounted: true,
  installs: 34,
  removals: 3,
  runs: 1412,
  runsPerDay: 13.7,
  successRate: 0.94,
  tools: [
    { key: "claude-code", count: 256, share: 0.62 },
    { key: "codex", count: 41, share: 0.38 },
  ],
  days,
  peak: { day: "2026-10-10", count: 412 },
  byTool: [
    { key: "claude-code", count: 256, share: 0.62 },
    { key: "codex", count: 41, share: 0.38 },
  ],
  byTrigger: [
    { key: "user", count: 100, share: 0.5 },
    { key: "model", count: 100, share: 0.5 },
  ],
  byOutcome: [
    { key: "success", count: 90, share: 0.9 },
    { key: "error", count: 10, share: 0.1 },
  ],
  ...extra,
});

/** A skill, so that Codex and Cursor are the tools that can't report its runs. */
const skill = (extra: Record<string, unknown> = {}) => {
  const data = itemPageData();
  return itemPageData({
    item: { ...data.item, type: "skill", downloadCount: 12345 },
    shown: {
      ...data.shown,
      manifest: { description: "A skill.", skill: {} },
      riskFlags: [{ kind: "hook", message: "It runs `npx`." }],
      dependencies: { "@team/fmt": "^1.0.0" },
      deprecatedMessage: "Use @team/gh2.",
      ...extra,
    },
    usedBy: [
      {
        workspace: "global",
        scope: "team",
        name: "starter-kit",
        type: "bundle",
        version: "1.0.0",
        range: "^1.0.0",
      },
    ],
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  versions.itemPage.mockResolvedValue(itemPageData());
  versions.versionContents.mockResolvedValue([
    text("SKILL.md", "# Skill\n\nDoes things."),
    text("ronne.yaml", "name: x\n"),
  ]);
  usage.itemUsage.mockResolvedValue({
    shown: false,
    collecting: false,
    hasData: false,
    underMinimum: null,
  });
});

describe("the Overview in three languages", () => {
  it("the stat cards, with numbers and plurals by language", async () => {
    versions.itemPage.mockResolvedValue(skill());
    usage.itemUsage.mockResolvedValue(shownUsage());
    const en = await render("en");
    expect(en).toContain("3 removed · 12,345 downloads");
    expect(en).toContain("13.7 a day · 94% succeeded");
    expect(en).toContain("1 flag");
    const pt = await render("pt");
    expect(pt).toContain("Instalações, 30 dias");
    expect(pt).toContain("3 removidas · 12.345 downloads");
    expect(pt).toContain("13,7 por dia · 94% com sucesso");
    expect(pt).toContain("1 sinalização");
    expect(pt).toContain("Claude Code 62% · Codex 38%");
    const fr = await render("fr");
    expect(fr).toContain("Installations, 30 jours");
    expect(fr).toMatch(/3 désinstallations · 12\s345 téléchargements/);
    expect(fr).toContain("1 signalement");
    expect(fr).toMatch(/13,7 par jour · 94\s?% réussies/);
  });

  it("the cards without usage, and the two lines that say why", async () => {
    const pt = await render("pt");
    expect(pt).toContain("Downloads");
    expect(pt).toContain("aprovado");
    expect(pt).toContain("Verificação do pacote");
    expect(pt).toContain("o rmk confere este checksum em toda instalação");
    usage.itemUsage.mockResolvedValue({
      shown: false,
      collecting: true,
      hasData: true,
      underMinimum: 25,
    });
    expect(await render("pt")).toContain("O uso aparece quando este item tiver 25 instalações");
    expect(await render("fr")).toContain(
      "L’utilisation s’affiche dès que cet élément compte 25 installations",
    );
    usage.itemUsage.mockResolvedValue({
      shown: false,
      collecting: true,
      hasData: false,
      underMinimum: null,
    });
    expect(await render("fr")).toContain(
      "Aucune installation ni exécution signalée au cours des 30 derniers jours.",
    );
  });

  it("the usage card: the tools that can't report runs, the chart and the table", async () => {
    versions.itemPage.mockResolvedValue(skill());
    usage.itemUsage.mockResolvedValue(shownUsage());
    const pt = await render("pt");
    expect(pt).toContain("Execuções por dia");
    expect(pt).toContain("Pico: 412 em ");
    expect(pt).toContain(
      "Codex e Cursor não informam execuções de skill; nelas, só as instalações são contadas.",
    );
    expect(pt).toContain("Digitado por uma pessoa");
    expect(pt).toContain("Terminou com erro");
    const fr = await render("fr");
    expect(fr).toContain("Exécutions par jour");
    expect(fr).toContain("Ce qui les a lancées");
    expect(fr).toContain("Comment elles se sont terminées");
    expect(fr).toMatch(
      /Codex et Cursor ne signalent pas les exécutions de skill; pour ces outils, seules les installations sont comptées\./,
    );
    usage.itemUsage.mockResolvedValue(shownUsage({ runsCounted: false, runs: 0 }));
    const notCounted = await render("pt");
    expect(notCounted).toContain("Não contadas");
    expect(notCounted).toContain("Execuções não são contadas para itens do tipo skill");
    expect(notCounted).toContain("Instalações por dia");
  });

  it("the side column: deprecated note, used by, maintainers, files, and the model's rows", async () => {
    versions.itemPage.mockResolvedValue(skill());
    const fr = await render("fr");
    expect(fr).toContain("Cette version est obsolète : Use @team/gh2.");
    expect(fr).toContain("Utilisé par");
    expect(fr).toContain("bundle · demande ^1.0.0");
    expect(fr).toContain("Approuvé par Mo Moderator");
    expect(fr).toContain("Fichiers inclus");
    expect(fr).toContain("Utilise 1 élément");
    const pt = await render("pt");
    expect(pt).toContain("Usado por");
    expect(pt).toContain("Usa 1 item");
    expect(pt).toContain("Aprovado por Mo Moderator");
  });

  it("the model's rows, guardrails and risk labels follow the language", () => {
    const say = (locale: Locale) => inLocale(locale, () => useTranslations("item.overview.model"));
    const hook = {
      hook: {
        event: "tool.after",
        matcher: { tool: "shell" },
        run: { command: "fmt" },
        timeout: 30,
      },
    };
    expect(settingsOf(hook, "hook", say("pt")).map((row) => row.label)).toEqual([
      "Evento",
      "Filtro",
      "Comando",
      "Tempo limite",
    ]);
    expect(
      settingsOf(hook, "hook", say("fr")).find((row) => row.label === "Délai d’expiration")?.values,
    ).toEqual(["30 s"]);
    expect(guardrailsOf(hook, "hook", say("pt"))).toEqual(["Roda só para a ferramenta `shell`."]);
    expect(guardrailsOf({ rule: { activation: "manual" } }, "rule", say("fr"))).toEqual([
      "S’applique seulement sur demande.",
    ]);
    const command = {
      command: {
        args: [
          { name: "target", description: "Where" },
          { name: "x", required: true },
        ],
      },
    };
    expect(settingsOf(command, "command", say("pt"))[0]?.values).toEqual([
      "target (opcional): Where",
      "x",
    ]);
    expect(settingsOf(command, "command", say("fr"))[0]?.values).toEqual([
      "target (facultatif) : Where",
      "x",
    ]);
    const mcp = { "mcp-server": { env: [{ name: "TOKEN", required: true, secret: true }] } };
    expect(settingsOf(mcp, "mcp-server", say("pt"))[0]?.values).toEqual([
      "TOKEN (obrigatória, secreta)",
    ]);
    expect(riskLabelsOf([{ kind: "network" }, { kind: "hook" }], say("fr"))).toEqual([
      "Mentionne des adresses web",
      "S’exécute lors d’un événement",
    ]);
  });

  it("a name or description that looks like a placeholder is shown as typed", async () => {
    versions.itemPage.mockResolvedValue(skill({ deprecatedMessage: "Use {count} <b>now</b>." }));
    const html = await render("pt");
    expect(html).toContain("Esta versão está obsoleta: Use {count} &lt;b&gt;now&lt;/b&gt;.");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English text is left on the Overview`, async () => {
      const pages: string[] = [];
      const variants: [Record<string, unknown> | null, unknown][] = [
        [null, undefined],
        [skill({ approval: null }), shownUsage()],
        [skill(), { shown: false, collecting: true, hasData: true, underMinimum: 25 }],
        [skill(), { shown: false, collecting: false, hasData: false, underMinimum: null }],
        [skill(), shownUsage({ runsCounted: false, runs: 0, collecting: false })],
        [itemPageData({ installable: false }), undefined],
      ];
      for (const [data, use] of variants) {
        versions.itemPage.mockResolvedValue(data ?? itemPageData());
        if (use) usage.itemUsage.mockResolvedValue(use);
        pages.push(await render(locale));
      }
      versions.versionContents.mockRejectedValue(
        new ArtifactUnavailableError("@team/github", "1.1.0"),
      );
      pages.push(await render(locale));
      const html = pages.join("\n");
      expect(await englishLeaks(["item", "catalogue"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["item"], locale, html)).toBeGreaterThan(30);
    });
  }
});
