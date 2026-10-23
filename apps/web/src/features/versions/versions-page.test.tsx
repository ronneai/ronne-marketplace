import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itemPageData } from "@/features/item-page/fixtures";
import type { ItemPage } from "@/server/domains/items/actions/versions";
import { ItemNotFoundError } from "@/server/domains/items/exceptions/errors";
import { englishLeaks } from "@/test/english-leak";
import { inLocale, inLocaleAsync } from "@/test/intl";

const versions = vi.hoisted(() => ({ itemPage: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
const usage = vi.hoisted(() => ({ itemUsage: vi.fn(), itemUsageByVersion: vi.fn() }));
vi.mock("@/server/domains/usage/actions/usage", () => usage);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/domains/shelves/actions/pins", () => ({ pinTargets: async () => [] }));
vi.mock("@/server/domains/shelves/actions/favorites", () => ({
  favoritedAmong: async () => new Set<string>(),
}));
vi.mock("./actions", () => ({ changeVersions: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { default: Page } = await import("@/app/(app)/items/[scope]/[name]/versions/page");

const pageData = (overrides: Partial<ItemPage> = {}) => itemPageData(overrides);

const render = async (scope = "team", name = "github") =>
  renderToStaticMarkup(await Page({ params: Promise.resolve({ scope, name }) }));

beforeEach(() => {
  vi.clearAllMocks();
  versions.itemPage.mockResolvedValue(pageData());
  usage.itemUsageByVersion.mockResolvedValue(null);
});

describe("the Versions page", () => {
  it("lists tags and versions with their publisher, size, sha256, deprecation and yank", async () => {
    const html = await render("%40team");
    expect(versions.itemPage).toHaveBeenCalledWith(
      expect.any(Headers),
      { workspace: "global", scope: "team", name: "github" },
      undefined,
    );
    expect(html).toContain("@team/github");
    expect(html).toContain("latest → 1.1.0");
    expect(html).toContain("Rae Releaser");
    expect(html).toContain("2026-09-28 09:00 UTC");
    expect(html).toContain("2 KB");
    expect(html).toContain(`title="${"ab".repeat(32)}"`);
    expect(html).toContain(">deprecated<");
    expect(html).toContain("Use 1.1.0 or later.");
    expect(html).toContain(">yanked<");
    expect(html).toContain("Breaks on Windows.");
  });

  it("shows the actions to moderators and root only", async () => {
    expect(await render()).not.toContain(">Yank<");
    versions.itemPage.mockResolvedValue(pageData({ canManage: true }));
    const html = await render();
    expect(html).toContain(">Yank<");
    expect(html).toContain("Deprecate or yank?");
    expect(html).toContain("What&#x27;s a tag?");
    expect(html).toContain(">Unyank<");
    expect(html).toContain(">Deprecate<");
    expect(html).toContain(">Undeprecate<");
    expect(html).toContain(">Add a tag<");
    // latest can be moved but never removed.
    expect(html).toContain(">Move<");
    expect(html).not.toContain(">Remove<");
  });

  it("marks tags on a yanked version, and says when there's no latest", async () => {
    versions.itemPage.mockResolvedValue(pageData({ tags: [{ tag: "old", version: "1.0.0" }] }));
    const html = await render();
    expect(html).toMatch(/old → 1\.0\.0<\/span><span[^>]*>yanked</);
    expect(html).toContain("no installable stable version");
  });

  it("shows runs and installs per version from the usage minimum on, and nothing under it", async () => {
    expect(await render()).not.toContain("Runs, 30 days");
    usage.itemUsageByVersion.mockResolvedValue({ "1.1.0": { runs: 1240, installs: 9 } });
    const html = await render();
    expect(usage.itemUsageByVersion).toHaveBeenCalledWith(expect.any(Headers), "i1");
    expect(html).toContain("Runs, 30 days");
    expect(html).toContain("Installs, 30 days");
    expect(html).toContain(">1,240<");
    expect(html).toContain(">9<");
    // A version nothing reported: a dash, not a zero.
    expect(html).toMatch(/>–<\/td><td[^>]*>–</);
  });

  it("is a 404 for an unknown item", async () => {
    versions.itemPage.mockRejectedValue(new ItemNotFoundError("@team/github"));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("versionsPath", () => {
  it("builds the Versions page's URL, escaping each part", async () => {
    const { versionsPath } = await import("./links");
    expect(versionsPath({ scope: { name: "team" }, name: "github" })).toBe(
      "/items/team/github/versions",
    );
    expect(versionsPath({ scope: { name: "a b" }, name: "c/d" })).toBe(
      "/items/a%20b/c%2Fd/versions",
    );
    // Under its workspace outside global (118).
    expect(
      versionsPath({ workspace: { name: "acme" }, scope: { name: "team" }, name: "github" }),
    ).toBe("/workspaces/acme/items/team/github/versions");
    expect(
      versionsPath({ workspace: { name: "global" }, scope: { name: "team" }, name: "github" }),
    ).toBe("/items/team/github/versions");
  });
});

describe("reachLine", () => {
  it("says what still uses a version, for the deprecate and yank dialogs", async () => {
    const { Reach } = await import("./VersionControls");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const reachLine = (reach: { runs: number; installs: number }) =>
      renderToStaticMarkup(<Reach reach={reach} />).replace(/<[^>]+>/g, "");
    expect(reachLine({ runs: 1240, installs: 1 })).toBe(
      "Reported in the last 30 days: 1,240 runs, 1 install.",
    );
    expect(reachLine({ runs: 0, installs: 0 })).toBe(
      "Reported in the last 30 days: 0 runs, 0 installs.",
    );
  });
});

describe("the Versions tab in three languages (131)", () => {
  type L = "en" | "pt" | "fr";
  const html = (l: L, node: Parameters<typeof renderToStaticMarkup>[0]) =>
    inLocale(l, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");
  const tab = async (l: L) => {
    versions.itemPage.mockResolvedValue(pageData({ canManage: true }));
    return inLocaleAsync(l, async () =>
      renderToStaticMarkup(
        await Page({ params: Promise.resolve({ scope: "team", name: "github" }) }),
      ),
    );
  };
  const itemRef = { workspace: "global", scope: "team", name: "github" };

  it("words the tab's text, columns, badges and actions", async () => {
    const pt = await tab("pt");
    expect(pt).toContain("As versões nunca mudam depois de publicadas.");
    expect(pt).toContain(">Tamanho<");
    expect(pt).toContain(">obsoleta<");
    expect(pt).toContain(">retirada<");
    expect(pt).toContain("Retirada em <time");
    expect(pt).toContain("por Rae Releaser");
    expect(pt).toContain(">Marcar como obsoleta<");
    expect(pt).toContain(">Adicionar uma tag<");
    expect(pt).toContain("2 KB");
    const fr = await tab("fr");
    expect(fr).toContain(">Étiquettes<");
    expect(fr).toContain(">Annuler le retrait<");
    expect(fr).toContain("Les publications viennent des soumissions approuvées.");
    expect(fr).toContain("2 Ko");
  });

  it("writes the 30-day counts as the language does", async () => {
    versions.itemPage.mockResolvedValue(pageData());
    usage.itemUsageByVersion.mockResolvedValue({ "1.1.0": { runs: 1240, installs: 12345 } });
    const counts = async (l: L) =>
      inLocaleAsync(l, async () =>
        renderToStaticMarkup(
          await Page({ params: Promise.resolve({ scope: "team", name: "github" }) }),
        ),
      );
    expect(await counts("en")).toContain(">1,240<");
    expect(await counts("pt")).toContain(">1.240<");
    expect(await counts("pt")).toContain(">12.345<");
    expect(await counts("fr")).toContain(">1\u202f240<");
    usage.itemUsageByVersion.mockResolvedValue(null);
  });

  it("words each version dialog, with the reach in plurals", async () => {
    const { Reach, TagControls, VersionControls } = await import("./VersionControls");
    const reach = (l: L, runs: number, installs: number) =>
      html(l, <Reach reach={{ runs, installs }} />).replace(/<[^>]+>/g, "");
    expect(reach("en", 1240, 1)).toBe("Reported in the last 30 days: 1,240 runs, 1 install.");
    expect(reach("pt", 0, 1)).toBe("Relatado nos últimos 30 dias: 0 execução, 1 instalação.");
    expect(reach("pt", 2, 2)).toBe("Relatado nos últimos 30 dias: 2 execuções, 2 instalações.");
    // French groups digits with a narrow no-break space.
    expect(reach("fr", 1240, 0)).toBe(
      "Signalé ces 30 derniers jours : 1\u202f240 exécutions, 0 installation.",
    );
    const controls = (l: L, open: "deprecate" | "yank", deprecated = false, yanked = false) =>
      html(
        l,
        <VersionControls
          itemRef={itemRef}
          version="1.0.{x}"
          deprecated={deprecated}
          yanked={yanked}
          open={open}
        />,
      );
    expect(controls("pt", "deprecate")).toContain("Marcar a 1.0.{x} como obsoleta");
    expect(controls("pt", "deprecate")).toContain(
      "Exibida onde quer que esta versão seja instalada",
    );
    expect(controls("fr", "yank")).toContain("Retirer la 1.0.{x}");
    expect(controls("fr", "yank")).toContain(">Raison<");
    expect(controls("pt", "deprecate", true)).toContain("A mensagem de obsolescência some.");
    expect(controls("fr", "yank", false, true)).toContain("Annuler le retrait de la 1.0.{x}?");
    expect(controls("fr", "yank")).toContain(">Annuler<");
    const tags = (l: L, tag: string, open: "move" | "remove") =>
      html(
        l,
        <TagControls
          itemRef={itemRef}
          tag={tag}
          versions={[{ version: "1.0.0", yanked: false }]}
          current="1.0.0"
          open={open}
        />,
      );
    expect(tags("pt", "", "move")).toContain("Letras minúsculas, dígitos e hifens");
    expect(tags("pt", "beta", "move")).toContain("Mover beta");
    expect(tags("fr", "beta", "remove")).toContain("Supprimer beta?");
    expect(tags("fr", "beta", "remove")).toContain(
      "Installer @team/github@beta cesse de fonctionner.",
    );
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left on the Versions tab and its dialogs`, async () => {
      const { TagControls, VersionControls } = await import("./VersionControls");
      const all = [
        await tab(locale),
        html(
          locale,
          <VersionControls
            itemRef={itemRef}
            version="1.0.0"
            deprecated={false}
            yanked={false}
            open="deprecate"
          />,
        ),
        html(
          locale,
          <VersionControls
            itemRef={itemRef}
            version="1.0.0"
            deprecated={false}
            yanked={false}
            open="yank"
          />,
        ),
        html(
          locale,
          <VersionControls itemRef={itemRef} version="1.0.0" deprecated yanked open="yank" />,
        ),
        html(
          locale,
          <VersionControls itemRef={itemRef} version="1.0.0" deprecated yanked open="deprecate" />,
        ),
        html(
          locale,
          <TagControls
            itemRef={itemRef}
            tag=""
            versions={[{ version: "1.0.0", yanked: false }]}
            open="move"
          />,
        ),
        html(
          locale,
          <TagControls
            itemRef={itemRef}
            tag="beta"
            versions={[{ version: "1.0.0", yanked: false }]}
            open="remove"
          />,
        ),
      ].join("\n");
      expect(await englishLeaks(["author", "help", "common"], locale, all)).toEqual([]);
    });
  }
});
