import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ArtifactUnavailableError,
  ItemNotFoundError,
  VersionNotFoundError,
} from "@/server/domains/items/exceptions/errors";
import type { ContentFile } from "@/server/domains/items/models/contents";
import { itemPageData, versionRow } from "./fixtures";
import { itemTabHref, tabFrom } from "./tabs";

/** The page as a reader sees it: tags and React's text separators gone. */
const textOf = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");

const versions = vi.hoisted(() => ({ itemPage: vi.fn(), versionContents: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
const catalogue = vi.hoisted(() => ({ dependencyFacts: vi.fn() }));
const usage = vi.hoisted(() => ({ itemUsage: vi.fn() }));
vi.mock("@/server/domains/usage/actions/usage", () => usage);
vi.mock("@/server/domains/items/actions/catalogue", () => catalogue);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/items/team/github",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./actions", () => ({ proposeChangeAction: vi.fn() }));

const { default: Item } = await import("@/app/(app)/items/[scope]/[name]/page");

const render = async (query: { tab?: string; version?: string; file?: string } = {}) =>
  renderToStaticMarkup(
    await Item({
      params: Promise.resolve({ scope: "team", name: "github" }),
      searchParams: Promise.resolve(query),
    }),
  );

const text = (path: string, value: string, executable = false): ContentFile => ({
  path,
  size: value.length,
  executable,
  kind: "text",
  text: value,
});

/** @team/github 1.1.0's files, as its artifact holds them. */
const FILES: ContentFile[] = [
  text("bin/run.sh", "#!/bin/sh\nnpx github-mcp\n", true),
  text("ronne.yaml", 'name: "@team/github"\ntype: mcp-server\nversion: 1.1.0\n'),
];

beforeEach(() => {
  vi.clearAllMocks();
  versions.itemPage.mockResolvedValue(itemPageData());
  versions.versionContents.mockResolvedValue(FILES);
  catalogue.dependencyFacts.mockResolvedValue({});
  usage.itemUsage.mockResolvedValue({
    shown: false,
    collecting: false,
    hasData: false,
    underMinimum: null,
  });
});

/** An item's usage (047), as the usage domain summarises it. */
const usageShown = (extra: Record<string, unknown> = {}) => ({
  shown: true,
  collecting: true,
  runsCounted: true,
  installs: 34,
  removals: 3,
  runs: 412,
  runsPerDay: 13.7,
  successRate: 0.94,
  tools: [
    { key: "claude-code", count: 256, share: 0.62 },
    { key: "cursor", count: 115, share: 0.28 },
    { key: "codex", count: 41, share: 0.1 },
  ],
  days: [],
  peak: null,
  byTool: [],
  byTrigger: [],
  byOutcome: [],
  ...extra,
});

describe("the item page", () => {
  it("shows the header, both install commands, and the README rendered safely", async () => {
    const html = await render({ tab: "readme" });
    expect(versions.itemPage).toHaveBeenCalledWith(
      expect.any(Headers),
      { scope: "team", name: "github" },
      undefined,
    );
    expect(html).toContain(">@team/github</h1>");
    expect(html).toContain("v1.1.0");
    expect(html).toContain(">mcp-server<");
    // The time is a <time>, in UTC on the server (049).
    expect(textOf(html)).toContain(
      "license MIT · #git · #api · by Rae Releaser · published 2026-09-28 09:00 UTC",
    );
    // Install is on the Overview only (045): README goes straight to the README.
    expect(html).not.toContain("rmk install @team/github");
    expect(html).toContain("<h2>GitHub</h2>");
    expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62;");
    expect(html).not.toContain("<script>");
    expect(html).toMatch(/aria-current="page"[^>]*>README</);
    expect(html).toContain('href="/items/team/github"');
    expect(html).toContain('href="/items/team/github/versions"');
    expect(html).toContain('href="/items/team/github?tab=files"');
    expect(html).not.toContain("You&#x27;re looking at");
    // README never reads the artifact.
    expect(versions.versionContents).not.toHaveBeenCalled();
    // Anyone signed in may propose a change (017).
    expect(html).toContain("Propose a change");
    expect(html).toContain("What happens when I propose a change?");
    // Works in is a tab of its own, before What it can do (044), not a panel on every tab.
    expect(html).toContain('href="/items/team/github?tab=tools"');
    expect(html).not.toContain("What do these mean?");
    expect(html).toMatch(/>Works in<\/a><a[^>]*>What it can do</);
    // Works in: every tool, from the renderers and this version's manifest (026).
    const tools = await render({ tab: "tools" });
    expect(tools).toMatch(/aria-current="page"[^>]*>Works in</);
    expect(tools).toContain("What do these mean?");
    for (const tool of ["Claude Code", "Codex", "Cursor"]) expect(tools).toContain(`>${tool}</a>`);
    expect(tools).toContain("mcpServers in .mcp.json</code>.");
    expect(tools).toContain("mcp_servers in .codex/config.toml</code>.");
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
    const html = await render({ version: "1.1.0", tab: "tools" });
    expect(html).toContain(">turned off<");
    expect(html).toContain("This version&#x27;s ronne.yaml keeps it away from this tool.");
    versions.itemPage.mockResolvedValue(
      itemPageData({ item: { ...itemPageData().item, type: "output-style" } }),
    );
    const style = await render({ tab: "tools" });
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
    expect(none).not.toContain("rmk install @team/github");
  });

  it("shows the files, the dependencies with links, and what it can do", async () => {
    const files = await render({ tab: "files" });
    expect(versions.versionContents).toHaveBeenCalledWith(
      expect.any(Headers),
      { scope: "team", name: "github" },
      "1.1.0",
    );
    expect(files).toContain('aria-label="Files of this version"');
    expect(files).toContain("run.sh");
    // No body file for an MCP server: ronne.yaml opens first, as released.
    expect(files).toContain(">ronne.yaml</h3>");
    expect(files).toContain("version: 1.1.0");
    expect(files).toMatch(/aria-current="page"[^>]*>Files</);
    const script = await render({ tab: "files", file: "bin/run.sh" });
    expect(script).toContain(">bin/run.sh</h3>");
    expect(script).toContain(">executable<");
    expect(script).toContain("npx github-mcp");

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
    expect(await render({ tab: "readme" })).toContain("This version has no README.");
  });

  it("opens on Overview: the stat cards, Install with quick flags, and the side column", async () => {
    versions.itemPage.mockResolvedValue(
      itemPageData({
        item: { ...itemPageData().item, downloadCount: 1428 },
        usedBy: [
          { scope: "team", name: "starter-kit", type: "bundle", version: "1.0.0", range: "^1.0.0" },
        ],
        shown: {
          ...itemPageData().shown,
          manifest: {
            ...itemPageData().shown.manifest,
            "mcp-server": {
              transport: "stdio",
              command: "npx",
              env: [{ name: "GITHUB_TOKEN", required: true, secret: true }],
            },
          },
          riskFlags: [
            { kind: "mcp_server", message: "It starts `npx`." },
            { kind: "network", message: "It mentions `a.example`." },
            { kind: "network", message: "It mentions `b.example`." },
          ],
        },
      }),
    );
    const html = await render();
    expect(html).toMatch(/aria-current="page"[^>]*>Overview</);
    expect(html).toContain("What am I looking at?");
    expect(html).toContain('href="/docs/items#contents"');
    // Stat cards, from real data only.
    expect(html).toContain(">1,428<");
    expect(html).toContain("all versions, through rmk and the API");
    expect(textOf(html)).toContain("2newest 2026-09-28");
    expect(html).toContain(" of 3 tools");
    expect(html).toContain(">Claude Code · Codex · Cursor<");
    expect(html).toContain(">approved<");
    expect(html).toContain("3 flags");
    expect(html).toContain(">Starts an MCP server · Mentions web addresses<");
    expect(html).toContain('href="/items/team/github?tab=risks"');
    expect(html).toContain('href="/items/team/github?tab=tools"');
    // Install, with a quick --target for each tool it installs in.
    expect(html).toContain("rmk install @team/github<");
    expect(html).toContain("rmk install @team/github@1.1.0");
    expect(html).toContain("How do I install it?");
    for (const id of ["claude-code", "codex", "cursor"])
      expect(html).toContain(`aria-label="Copy rmk install @team/github --target ${id}"`);
    // Capabilities and guardrails.
    expect(html).toContain("It starts <code");
    expect(html).toContain("Its manifest sets no limits of its own.");
    // The side column.
    expect(html).toContain(`>${"ab".repeat(32)}</code>`);
    expect(html).toContain(">2 KB<");
    expect(html).toContain(">GITHUB_TOKEN (required, secret)<");
    expect(html).toContain('href="/items/team/starter-kit"');
    expect(html).toContain("bundle · asks ^1.0.0");
    expect(html).toContain(">Rae Releaser<");
    expect(html).toContain("Approved by Mo Moderator");
    expect(html).toContain('href="/items/team/github?tab=files&amp;file=ronne.yaml"');
    expect(html).toContain('href="/items/team/github?tab=files&amp;file=bin%2Frun.sh"');
    expect(html).not.toContain("Uses ");
    // Nothing the registry doesn't know: no usage, runtime requirements or signatures.
    for (const missing of ["Invocations", "Telemetry", "Runtime requirements", "signed"])
      expect(html).not.toContain(missing);
  });

  it("shows an agent's prompt with its role, its guardrails and its dependencies on the canvas", async () => {
    versions.itemPage.mockResolvedValue(
      itemPageData({
        item: { ...itemPageData().item, type: "agent" },
        shown: {
          ...itemPageData().shown,
          manifest: { agent: { prompt: "prompt.md", tools: ["read"] } },
          dependencies: { "@team/fmt": "^1.0.0" },
          approval: null,
        },
      }),
    );
    versions.versionContents.mockResolvedValue([
      ...FILES,
      text("prompt.md", "# Reviewer\n\nYou review diffs.\n"),
    ]);
    catalogue.dependencyFacts.mockResolvedValue({
      "@team/fmt": { type: "rule", version: "1.2.0", description: "Formats.", tools: [] },
    });
    const agent = await render();
    expect(catalogue.dependencyFacts).toHaveBeenCalledWith(expect.any(Headers), ["@team/fmt"]);
    expect(agent).toContain(">prompt.md</h2>");
    expect(agent).toContain(">system instruction<");
    expect(agent).toContain("<h2>Reviewer</h2>");
    expect(agent).toContain('href="/items/team/github?tab=files&amp;file=prompt.md"');
    expect(agent).toContain("Only these tools: <code");
    expect(agent).toContain(">Nothing flagged<");
    expect(agent).toContain(">not reviewed<");
    expect(agent).toContain("Released without review.");
    expect(agent).not.toContain(">Source<");
    expect(agent).toContain("Uses 1 item");
    expect(agent).toContain("Loading the canvas…");
    expect(agent).toContain('href="/items/team/fmt"');
    // Nothing depends on it: no Used by.
    expect(agent).not.toContain('aria-label="Used by"');

    // A body file the manifest names but the version lacks.
    versions.versionContents.mockResolvedValue(FILES);
    expect(await render()).toContain("prompt.md isn&#x27;t in this version.");
  });

  it("shows a permission policy's rules as a table", async () => {
    versions.itemPage.mockResolvedValue(
      itemPageData({
        item: { ...itemPageData().item, type: "permission-policy" },
        shown: {
          ...itemPageData().shown,
          manifest: {
            "permission-policy": {
              rules: [
                { tool: "shell", pattern: "git push*", decision: "ask" },
                { tool: "web-fetch", decision: "allow" },
              ],
            },
          },
        },
      }),
    );
    const html = await render({ version: "1.0.0" });
    expect(html).toContain(">Decision</th>");
    expect(html).toMatch(/>ask<\/span><\/td><td[^>]*>shell<\/td><td[^>]*>git push\*</);
    expect(html).toMatch(/>allow<\/span><\/td><td[^>]*>web-fetch<\/td><td[^>]*>any</);
  });

  it("says when the version's files can't be read, and the rest of the page works", async () => {
    versions.versionContents.mockRejectedValue(
      new ArtifactUnavailableError("@team/github", "1.1.0"),
    );
    for (const tab of ["overview", "files"]) {
      const html = await render({ tab });
      expect(html).toContain("This version&#x27;s files can&#x27;t be read.");
      expect(html).toContain(">@team/github</h1>");
    }
  });

  it("is a 404 for an unknown item or version", async () => {
    versions.itemPage.mockRejectedValue(new ItemNotFoundError("@team/github"));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    versions.itemPage.mockRejectedValue(new VersionNotFoundError("@team/github", "9.9.9"));
    await expect(render({ version: "9.9.9" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("item tabs", () => {
  it("reads the tab, Overview by default, and builds each tab's URL", () => {
    expect(tabFrom(undefined)).toBe("overview");
    expect(tabFrom("versions")).toBe("overview");
    expect(tabFrom("readme")).toBe("readme");
    expect(tabFrom("risks")).toBe("risks");
    const item = { scope: "team", name: "github" };
    expect(itemTabHref(item, "overview")).toBe("/items/team/github");
    expect(itemTabHref(item, "overview", "1.0.0")).toBe("/items/team/github?version=1.0.0");
    expect(itemTabHref(item, "readme")).toBe("/items/team/github?tab=readme");
    expect(itemTabHref(item, "versions", "1.0.0")).toBe("/items/team/github/versions");
  });
});

describe("usage on the Overview (047)", () => {
  it("shows Installs, Runs and each tool's share once the item has enough activity", async () => {
    versions.itemPage.mockResolvedValue(
      itemPageData({ item: { ...itemPageData().item, downloadCount: 1240 } }),
    );
    usage.itemUsage.mockResolvedValue(usageShown());
    const html = await render();
    expect(usage.itemUsage).toHaveBeenCalledWith(expect.any(Headers), {
      id: "i1",
      type: "mcp-server",
    });
    expect(html).toContain("Installs, 30 days");
    expect(html).toContain(">34<");
    expect(html).toContain("3 removed · 1,240 downloads");
    expect(html).toContain("Runs, 30 days");
    expect(html).toContain(">412<");
    expect(html).toContain("13.7 a day · 94% succeeded");
    expect(html).toContain(">Claude Code 62% · Cursor 28% · Codex 10%<");
    // The distribution bar, each tool in its colour (the mockup's harness distribution).
    expect(html).toMatch(/class="bg-chart-claude-code" style="width:62%"/);
    expect(html).toMatch(/class="bg-chart-cursor" style="width:28%"/);
    expect(html).toMatch(/class="bg-chart-codex" style="width:10%"/);
    expect(html).not.toContain(">Downloads<");
    expect(html).not.toContain("Usage appears once");
  });

  it("says when the success rate isn't known, no runs came, or the type doesn't run", async () => {
    usage.itemUsage.mockResolvedValue(usageShown({ successRate: null }));
    expect(await render()).toContain("13.7 a day · success rate not reported");
    usage.itemUsage.mockResolvedValue(usageShown({ runs: 0, tools: [] }));
    expect(await render()).toContain("No runs reported");
    usage.itemUsage.mockResolvedValue(usageShown({ runsCounted: false }));
    const html = await render();
    expect(html).toContain("Not counted");
    expect(html).toContain("Runs aren&#x27;t counted for mcp-servers");
  });

  it("keeps 045's cards without usage, with a line saying why: nothing, or under root's minimum", async () => {
    usage.itemUsage.mockResolvedValue({
      shown: false,
      collecting: true,
      hasData: false,
      underMinimum: null,
    });
    expect(await render()).toContain("No installs or runs reported in the last 30 days.");
    usage.itemUsage.mockResolvedValue({
      shown: false,
      collecting: true,
      hasData: true,
      underMinimum: 25,
    });
    const html = await render();
    expect(html).toContain(">Downloads<");
    expect(html).toContain(
      "Usage appears once this item has 25 reported installs or runs in 30 days.",
    );
    // The helper beside it is a <details>: inside a <p> it breaks hydration in the browser.
    expect(html).not.toMatch(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<details/);
    expect(html).not.toContain("Installs, 30 days");
  });

  it("says nothing about usage where the instance collects none and has none", async () => {
    const html = await render();
    expect(html).not.toContain("Usage appears once");
    expect(html).not.toContain("No installs or runs");
    expect(html).not.toContain("Installs, 30 days");
  });

  it("isn't read on the other tabs", async () => {
    await render({ tab: "readme" });
    expect(usage.itemUsage).not.toHaveBeenCalled();
  });
});
