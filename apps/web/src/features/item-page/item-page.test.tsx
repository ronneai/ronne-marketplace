import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemNotFoundError, VersionNotFoundError } from "@/server/domains/items/exceptions/errors";
import { itemPageData, versionRow } from "./fixtures";
import { itemTabHref, tabFrom } from "./tabs";

const versions = vi.hoisted(() => ({ itemPage: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({ proposeChangeAction: vi.fn() }));

const { default: Item } = await import("@/app/(app)/items/[scope]/[name]/page");

const render = async (query: { tab?: string; version?: string } = {}) =>
  renderToStaticMarkup(
    await Item({
      params: Promise.resolve({ scope: "team", name: "github" }),
      searchParams: Promise.resolve(query),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  versions.itemPage.mockResolvedValue(itemPageData());
});

describe("the item page", () => {
  it("shows the header, both install commands, and the README rendered safely", async () => {
    const html = await render();
    expect(versions.itemPage).toHaveBeenCalledWith(
      expect.any(Headers),
      { scope: "team", name: "github" },
      undefined,
    );
    expect(html).toContain(">@team/github</h1>");
    expect(html).toContain("v1.1.0");
    expect(html).toContain(">mcp-server<");
    expect(html).toContain(
      "license MIT · #git · #api · by Rae Releaser · published 2026-09-28 09:00 UTC",
    );
    expect(html).toContain("rmk install @team/github<");
    expect(html).toContain("rmk install @team/github@1.1.0");
    expect(html).toContain("<h2>GitHub</h2>");
    expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62;");
    expect(html).not.toContain("<script>");
    expect(html).toMatch(/aria-current="page"[^>]*>README</);
    expect(html).toContain('href="/items/team/github/versions"');
    expect(html).toContain('href="/items/team/github?tab=files"');
    expect(html).not.toContain("You&#x27;re looking at");
    // Anyone signed in may propose a change (017).
    expect(html).toContain("Propose a change");
    expect(html).toContain("What happens when I propose a change?");
    // Works in: every tool, from the renderers and this version's manifest (026).
    expect(html).toContain(">Works in<");
    expect(html).toContain("What do these mean?");
    for (const tool of ["Claude Code", "Codex", "Cursor"]) expect(html).toContain(`>${tool}</a>`);
    expect(html).toContain("mcpServers in .mcp.json</code>.");
    expect(html).toContain("mcp_servers in .codex/config.toml</code>.");
    expect(html).toContain("How do I install it?");
  });

  it("shows another version by URL, with a banner saying whether it's yanked", async () => {
    const old = itemPageData().versions[1] ?? versionRow();
    versions.itemPage.mockResolvedValue(
      itemPageData({ shown: { ...itemPageData().shown, ...old } }),
    );
    const html = await render({ version: "1.0.0", tab: "files" });
    expect(versions.itemPage).toHaveBeenCalledWith(expect.any(Headers), expect.anything(), "1.0.0");
    expect(html).toContain("You&#x27;re looking at 1.0.0, not latest (1.1.0).");
    expect(html).toContain("It was yanked: Breaks on Windows.");
    expect(html).toContain('href="/items/team/github?tab=files"');
    expect(html).toContain('href="/items/team/github?tab=dependencies&amp;version=1.0.0"');
    expect(html).toContain(">yanked<");
  });

  it("works out the tools for the version shown, from its own manifest", async () => {
    const shown = itemPageData().shown;
    versions.itemPage.mockResolvedValue(
      itemPageData({
        shown: {
          ...shown,
          manifest: { ...shown.manifest, targets: { cursor: { enabled: false } } },
        },
      }),
    );
    const html = await render({ version: "1.1.0" });
    expect(html).toContain(">turned off<");
    expect(html).toContain("This version&#x27;s ronne.yaml keeps it away from this tool.");
    versions.itemPage.mockResolvedValue(
      itemPageData({ item: { ...itemPageData().item, type: "output-style" } }),
    );
    const style = await render({});
    expect(style).toContain("Codex has no place for output-style items");
    expect(style.match(/>skipped</g)).toHaveLength(2);
  });

  it("notes a deprecated latest, and has nothing to install when every version is yanked", async () => {
    const data = itemPageData();
    versions.itemPage.mockResolvedValue(
      itemPageData({ shown: { ...data.shown, deprecatedMessage: "Use @team/gh2." } }),
    );
    expect(await render()).toContain("This version is deprecated: Use @team/gh2.");
    versions.itemPage.mockResolvedValue(itemPageData({ installable: false }));
    const none = await render();
    expect(none).toContain("Every version is yanked");
    expect(none).not.toContain("rmk install");
  });

  it("shows the files, the dependencies with links, and what it can do", async () => {
    const files = await render({ tab: "files" });
    expect(files).toContain("bin/run.sh");
    expect(files).toContain(">yes<");
    expect(files).toMatch(/aria-current="page"[^>]*>Files</);

    expect(await render({ tab: "dependencies" })).toContain("This version has no dependencies.");
    const data = itemPageData();
    versions.itemPage.mockResolvedValue(
      itemPageData({
        shown: {
          ...data.shown,
          dependencies: { "@team/fmt": "^1.0.0" },
          riskFlags: [{ kind: "mcp_server", message: "It starts `npx`." }],
        },
      }),
    );
    const deps = await render({ tab: "dependencies" });
    expect(deps).toContain('href="/items/team/fmt"');
    expect(deps).toContain("^1.0.0");
    const risks = await render({ tab: "risks" });
    expect(risks).toContain("What it can do (1)");
    expect(risks).toContain("<code");
  });

  it("says when nothing is flagged, and shows a README-less version's description", async () => {
    expect(await render({ tab: "risks" })).toContain("Nothing flagged");
    const data = itemPageData();
    versions.itemPage.mockResolvedValue(itemPageData({ shown: { ...data.shown, readme: null } }));
    expect(await render()).toContain("This version has no README.");
  });

  it("is a 404 for an unknown item or version", async () => {
    versions.itemPage.mockRejectedValue(new ItemNotFoundError("@team/github"));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    versions.itemPage.mockRejectedValue(new VersionNotFoundError("@team/github", "9.9.9"));
    await expect(render({ version: "9.9.9" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("item tabs", () => {
  it("reads the tab, README by default, and builds each tab's URL", () => {
    expect(tabFrom(undefined)).toBe("readme");
    expect(tabFrom("versions")).toBe("readme");
    expect(tabFrom("risks")).toBe("risks");
    const item = { scope: "team", name: "github" };
    expect(itemTabHref(item, "readme")).toBe("/items/team/github");
    expect(itemTabHref(item, "readme", "1.0.0")).toBe("/items/team/github?version=1.0.0");
    expect(itemTabHref(item, "versions", "1.0.0")).toBe("/items/team/github/versions");
  });
});
