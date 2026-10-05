import { ITEM_TYPES } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { docsHref, TOPIC_GROUPS, TOPICS, topicOf } from "@/components/help/topics";
import { TYPE_INFO } from "@/components/submissions/item-types";
import { HelpTip } from "@/components/ui/HelpTip";

const navigation = vi.hoisted(() => ({ path: "/docs/scopes" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { DocsNav } = await import("./DocsNav");
const { CONTENT } = await import("./content");
const { default: Docs } = await import("@/app/(app)/docs/page");
const { default: DocsTopic } = await import("@/app/(app)/docs/[topic]/page");

const topic = async (slug: string) =>
  renderToStaticMarkup(await DocsTopic({ params: Promise.resolve({ topic: slug }) }));

describe("the Documentation", () => {
  it("groups every topic once, with the groups labelled in order", () => {
    expect(TOPIC_GROUPS.flatMap((g) => g.topics).sort()).toEqual(TOPICS.map((t) => t.slug).sort());
    const html = renderToStaticMarkup(<DocsNav />);
    const at = (text: string) => html.indexOf(`>${text}<`);
    expect(at("Getting started")).toBeLessThan(at("Overview"));
    expect(at("Roles")).toBeLessThan(at("Organising"));
    expect(at("Organising")).toBeLessThan(at("Scopes"));
    expect(at("Publishing")).toBeLessThan(at("Submitting and review"));
    expect(at("Installing")).toBeLessThan(at("Installing with rmk"));
    expect(html.match(/<ul aria-labelledby="docs-group-\d"/g)).toHaveLength(4);
  });

  it("lists every topic, and marks the current one", () => {
    const html = renderToStaticMarkup(<DocsNav />);
    for (const t of TOPICS) expect(html).toContain(`href="${docsHref(t.slug)}"`);
    expect(html).toMatch(/aria-current="page"[^>]*>Scopes</);
    expect(html).toContain('href="/docs"');
  });

  it("opens on the overview, and shows each topic with its sections as anchors", async () => {
    expect(renderToStaticMarkup(<Docs />)).toContain(">Overview</h1>");
    const html = await topic("scopes");
    expect(html).toContain(">Scopes</h1>");
    expect(html).toContain('id="what"');
    expect(html).toContain('id="organising"');
    expect(html).toMatch(/<h2 id="names-title"[^>]*>Naming rules<\/h2>/);
  });

  it("says where the pages are on a phone: the Menu (066)", () => {
    const html = renderToStaticMarkup(<Docs />);
    expect(html).toContain("On a phone or tablet they&#x27;re in the <strong>Menu</strong>");
  });

  it("is a 404 for an unknown topic, and for the overview's own slug", async () => {
    await expect(topic("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(topic("overview")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("builds links to topics and sections", () => {
    expect(docsHref("overview")).toBe("/docs");
    expect(docsHref("scopes", "what")).toBe("/docs/scopes#what");
    expect(topicOf("versions")?.sections.map((s) => s.id)).toContain("deprecate-yank");
  });
});

describe("HelpTip", () => {
  it("is a closed popover's button, with the answer inline only without JavaScript (050)", () => {
    const html = renderToStaticMarkup(
      <HelpTip question="What's a scope?" href="/docs/scopes#what">
        The first part of an item&apos;s name.
      </HelpTip>,
    );
    expect(html).toMatch(/<button type="button"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/aria-haspopup="dialog"/);
    expect(html).toContain("What&#x27;s a scope?");
    // Closed: no popover on the page, and the answer only in the noscript fallback.
    expect(html).not.toContain('role="dialog"');
    expect(html).toMatch(
      /<noscript>[\s\S]*The first part of an item&#x27;s name\.[\s\S]*<\/noscript>/,
    );
    expect(html).toMatch(/href="\/docs\/scopes#what"[^>]*>Learn more</);
    expect(html).not.toContain("<details");
    expect(renderToStaticMarkup(<HelpTip question="Q">A.</HelpTip>)).not.toContain("Learn more");
  });
});

describe("the topics", () => {
  it("fill every section of every topic", () => {
    for (const t of TOPICS)
      for (const section of t.sections)
        expect(CONTENT[t.slug][section.id], `${t.slug}#${section.id}`).toBeDefined();
  });

  it("show all 11 types with the New item form's descriptions, and which are flagged", async () => {
    const html = await topic("items");
    for (const type of ITEM_TYPES) {
      expect(html).toContain(`id="type-${type}"`);
      expect(html).toContain(TYPE_INFO[type].description.replaceAll("'", "&#x27;"));
    }
    expect(html.match(/⚠ risk/g)?.length).toBe(
      // The callout shows the flag twice; then one per risky type.
      2 + ITEM_TYPES.filter((type) => TYPE_INFO[type].highRisk).length,
    );
    expect(html).toContain("skill, mcp-server, hook, rule, command");
    expect(html).toContain("any type");
  });

  it("explain scopes with examples, statuses with their badges, and tags", async () => {
    const scopes = await topic("scopes");
    expect(scopes).toContain("@platform/code-reviewer");
    expect(scopes).toContain("up to 64");
    const review = await topic("review");
    for (const status of ["changes requested", "archived", "published"])
      expect(review).toContain(`>${status}<`);
    // Where the decisions are, and your own greyed out (058).
    expect(review).toContain("each row of");
    expect(review).toContain("greyed out");
    // Withdrawing asks to archive or delete (057).
    expect(review).toContain('id="withdraw"');
    expect(review).toContain("Delete for good");
    expect(review).toContain("brings it back as a draft");
    const versions = await topic("versions");
    expect(versions).toContain("1.4.0 → 1.5.0");
    expect(versions).toContain("the lockfile keeps that version");
    expect(await topic("items")).toContain("How an install picks versions");
    expect(versions).toContain(">yanked<");
    const install = await topic("install");
    expect(install).toContain(">Installing Ronne</h1>");
    for (const id of ["docker", "https", "packages", "node", "service", "setup", "root", "upgrade"])
      expect(install).toContain(`id="${id}"`);
    expect(install).toContain("docker compose up -d");
    // The npm package and rmk-server (082).
    expect(install).toContain("npx @ronneai/marketplace");
    expect(install).toContain("rmk-server setup");
    expect(install).toContain("~/Library/Application Support/RonneAI Marketplace");
    expect(install).toContain("--host 0.0.0.0");
    // As a Linux package (085).
    expect(install).toContain("sudo apt install ./rmk-server_X.Y.Z-1_amd64.deb");
    expect(install).toContain("sudo dnf install ./rmk-server-X.Y.Z-1.x86_64.rpm");
    expect(install).toContain("/opt/rmk-server");
    expect(install).toContain("glibc 2.34");
    // As a service (083).
    expect(install).toContain("sudo rmk-server service install");
    expect(install).toContain("rmk-server service status");
    expect(install).toContain("/var/lib/rmk-server");
    expect(install).toContain("/Library/Logs/rmk-server/server.log");
    expect(install).toContain("rmk-server-proxy");
    expect(install).toContain("Caddy 2.7 or later");
    expect(install).toContain("--delete-data");
    // On Windows (086).
    expect(install).toContain("WinSW on Windows");
    expect(install).toContain("terminal opened as administrator");
    // With <wbr/> where a phone may break the line.
    expect(install.replaceAll("<wbr/>", "")).toContain(
      "C:\\ProgramData\\RonneAI\\Marketplace\\data",
    );
    expect(install).toContain("NT SERVICE\\rmk-server");
    expect(install).toContain("rmk-server-X.Y.Z-win32-x64.zip");
    expect(install).toContain("winget install --id CaddyServer.Caddy --scope machine");
    // The install script (081).
    // Against the GitHub release, the scripts' own source: never the website, which only redirects.
    expect(install).toContain(
      "https://github.com/ronneai/ronne-marketplace/releases/latest/download/install.sh",
    );
    expect(install).toContain("install.sh | sh");
    expect(install).toContain("install.ps1 | iex");
    expect(install).toContain("Run it again to upgrade");
    // This computer answers on 127.0.0.1 only (security audit DEP-1).
    expect(install).toContain("RONNE_PORT=0.0.0.0:7650");
    // The proxy in compose.yaml (080).
    expect(install).toContain("# then open http://localhost:7650");
    expect(install).toContain(
      "RONNE_DOMAIN=ronne.example.com\nRONNE_PORT=80\nRONNE_HTTPS_PORT=443",
    );
    expect(install).toContain("RONNE_TRUSTED_PROXIES=private_ranges");
    expect(install).toContain("docker compose down -v");
    expect(install).toContain("Test connection");
    expect(install).not.toContain("pnpm run setup");
    expect(install).toContain("reset-root-password");
    // Several roots (059): added from Users, and the reset command picks one.
    expect(install).toContain("There can be several roots");
    expect(install).toContain("at least one active root");
    expect(install).toContain("--email");
    expect(install).not.toContain("docker compose restart");
    expect(install).toContain("Nothing needs a restart");
    // My submissions' table (063).
    expect(review).toContain("lists yours a page at a time (25, 50 or 100)");
    expect(review).toContain("Select all ready takes every ready draft");
    // The review queue's table (062).
    expect(review).toContain("Every tab pages, 25, 50 or 100 at a time");
    expect(review).toContain("Select all covers the page you&#x27;re viewing");
    // The audit log (060), for roots, linked from Roles.
    const admin = await topic("admin");
    expect(admin).toContain('id="audit"');
    expect(admin).toContain('id="users"');
    expect(admin).toContain("Sort by email, name or creation date");
    expect(admin).toContain("10,000+ events");
    expect(admin).toContain("user.*");
    expect(await topic("roles")).toContain(`href="${docsHref("admin", "audit")}"`);
    const rmk = await topic("rmk");
    // A locked version must come with the bytes rmk.lock recorded (security audit ITEM-3).
    expect(rmk).toContain("checksum_mismatch");
    expect(rmk).not.toContain("released yet");
    for (const id of ["getting", "login", "installing", "updating", "files", "edits"])
      expect(rmk).toContain(`id="${id}"`);
    expect(rmk).toContain("rmk.lock");
    expect(rmk).not.toContain("npm yet");
    expect(rmk).toContain("npm install --global @ronneai/rmk\nrmk --version");
    expect(rmk).toContain("npm unlink --global @ronneai/rmk");
    expect(rmk).toContain("code 3");
    expect(rmk).toContain('id="tokens"');
    expect(rmk).toContain('id="tools"');
    expect(rmk).toContain("<strong>Works in</strong>");
    expect(rmk).toContain('id="mcp"');
    expect(rmk).toContain('href="/docs/mcp"');
    const mcp = await topic("mcp");
    expect(mcp).toContain(">Registry MCP server</h1>");
    for (const id of ["what", "setup", "tools", "plans", "access"])
      expect(mcp).toContain(`id="${id}"`);
    for (const tool of ["search_items", "plan_install", "apply_plan"]) expect(mcp).toContain(tool);
    expect(mcp).not.toContain("npm yet");
    expect(mcp).toContain("npm install --global @ronneai/rmk @ronneai/mcp");
    expect(mcp).toContain("rmk mcp-setup --remove");
    expect(mcp).toContain("A plan lasts 10 minutes, and is applied once.");
    expect(rmk).toContain("rmk search &lt;query&gt; --target codex");
    for (const tool of ["claude-code", "codex", "cursor"])
      expect(rmk).toContain(`href="/docs/${tool}"`);
    const claude = await topic("claude-code");
    expect(claude).toContain(">Claude Code</h1>");
    // Plugins (077): from the Claude Code and rmk topics to their own.
    expect(claude).toContain('id="plugins"');
    expect(claude).toContain('href="/docs/plugins"');
    expect(rmk).toContain("rmk plugin-setup claude-code");
    expect(rmk).toContain("rmk auth headers");
    expect(rmk).toContain('href="/docs/plugins"');
    const plugins = await topic("plugins");
    expect(plugins).toContain(">Plugin marketplaces</h1>");
    for (const id of ["what", "claude-code", "tokens", "which"])
      expect(plugins).toContain(`id="${id}"`);
    expect(plugins).toContain("/api/v1/feeds/claude-code/marketplace.json");
    expect(plugins).toMatch(/\/plugin install team\.secure-coding@ronne-/);
    expect(plugins).toContain("rmk plugin-setup claude-code --scope project");
    expect(plugins).toContain("--static-headers");
    expect(plugins).toContain("The plugins you installed keep working.");
    expect(plugins).toContain("Install an item one way, not both");
    // The git mirror for Codex and Cursor (078).
    for (const id of ["mirror", "keeping"]) expect(plugins).toContain(`id="${id}"`);
    expect(plugins).toContain("rmk feed build --out .");
    expect(plugins).toContain("codex plugin marketplace add your-org/ronne-plugins");
    expect(plugins).toContain("Team Marketplaces › Import");
    expect(plugins).toContain("rmk feed build --print-workflow github &gt; .github/workflows/");
    expect(plugins).toContain("RMK_PUSH_TOKEN");
    expect(plugins).toContain("the build fails and the mirror stays as it was");
    // Large marketplaces, and the Plugin feeds panel in Admin › Settings (079).
    expect(plugins).toContain('id="large"');
    expect(plugins).toContain("near 10,000 items");
    expect(plugins).toContain("Admin › Settings › Plugin feeds");
    expect(admin).toContain('id="settings"');
    expect(admin).toContain('href="/docs/plugins#large"');
    expect(admin).toContain('href="/docs/usage#policy"');
    expect(rmk).toContain("rmk feed build --out &lt;folder&gt;");
    for (const tool of ["codex", "cursor"]) {
      const html = await topic(tool);
      expect(html, tool).toContain('id="plugins"');
      expect(html, tool).toContain('href="/docs/plugins#mirror"');
    }
    expect(claude).toContain(".claude/rules/");
    const codex = await topic("codex");
    expect(codex).toContain('id="trust"');
    expect(codex).toContain(".codex/agents/&lt;name&gt;.toml");
    expect(codex).toContain("/hooks");
    const cursor = await topic("cursor");
    expect(cursor).toContain('id="with-claude-code"');
    expect(cursor).toContain(".cursor/rules/&lt;name&gt;.mdc");
    expect(cursor).toContain("Third-Party Imports");
    const items = await topic("items");
    for (const tool of ["claude-code", "codex", "cursor"])
      expect(items).toContain(`href="/docs/${tool}#paths"`);
    expect(items).toContain(
      'aria-label="Codex: partly supported, .codex/rules/&lt;name&gt;.rules"',
    );
    expect(items).toContain('aria-label="Cursor: not supported"');
    expect(items).toContain("Core AI capabilities");
    expect(items).toContain("bundle → any type");
    // Composing on a canvas (031): what it edits, and what isn't released.
    expect(items).toMatch(/<h2 id="canvas-title"[^>]*>Composing on a canvas<\/h2>/);
    expect(items).toContain("<strong>Canvas</strong>");
    expect(items).toContain("search the catalogue under the canvas");
    expect(items).toContain("The canvas changes only");
    expect(items).toContain(".ronne/layout.json");
    expect(items).toContain("isn&#x27;t released");
    expect(items).toContain('href="/docs/items#canvas"');
    expect(await topic("review")).toContain("so they aren&#x27;t shown");
    expect(rmk).toContain('href="/account/tokens"');
    expect(rmk).toContain("Nothing about who installed it is stored.");
  });
});

describe("the Plugin marketplaces topic (077)", () => {
  it("shows this instance's marketplace address, from PUBLIC_URL when the page renders", async () => {
    vi.stubEnv("PUBLIC_URL", "https://registry.example.com");
    try {
      const html = await topic("plugins");
      expect(html).toContain(
        "https://registry.example.com/api/v1/feeds/claude-code/marketplace.json",
      );
      expect(html).toContain(">ronne-registry-example-com<");
      expect(html).toContain("/plugin install team.secure-coding@ronne-registry-example-com");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
