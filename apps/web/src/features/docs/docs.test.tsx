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
  it("is a closed details element with its question, answer and Learn more", () => {
    const html = renderToStaticMarkup(
      <HelpTip question="What's a scope?" href="/docs/scopes#what">
        The first part of an item&apos;s name.
      </HelpTip>,
    );
    expect(html).toMatch(/^<details class="[^"]*">/);
    expect(html).not.toContain("<details open");
    expect(html).toContain("What&#x27;s a scope?");
    expect(html).toContain("The first part of an item&#x27;s name.");
    expect(html).toMatch(/href="\/docs\/scopes#what"[^>]*>Learn more</);
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
    for (const status of ["changes requested", "withdrawn", "published"])
      expect(review).toContain(`>${status}<`);
    const versions = await topic("versions");
    expect(versions).toContain("1.4.0 → 1.5.0");
    expect(versions).toContain("the lockfile keeps that version");
    expect(await topic("items")).toContain("How an install picks versions");
    expect(versions).toContain(">yanked<");
    const install = await topic("install");
    expect(install).toContain(">Installing Ronne</h1>");
    for (const id of ["docker", "node", "setup", "root", "upgrade"])
      expect(install).toContain(`id="${id}"`);
    expect(install).toContain("docker compose up -d");
    expect(install).toContain("Test connection");
    expect(install).not.toContain("pnpm run setup");
    expect(install).toContain("reset-root-password");
    expect(install).not.toContain("docker compose restart");
    expect(install).toContain("Nothing needs a restart");
    const rmk = await topic("rmk");
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
    expect(await topic("review")).toContain("the changes only say that they changed");
    expect(rmk).toContain('href="/account/tokens"');
    expect(rmk).toContain("Nothing about who downloaded it is stored.");
  });
});
