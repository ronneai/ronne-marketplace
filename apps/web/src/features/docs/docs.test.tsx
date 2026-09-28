import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { docsHref, TOPICS, topicOf } from "@/components/help/topics";
import { HelpTip } from "@/components/ui/HelpTip";

const navigation = vi.hoisted(() => ({ path: "/docs/scopes" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { DocsNav } = await import("./DocsNav");
const { default: Docs } = await import("@/app/(app)/docs/page");
const { default: DocsTopic } = await import("@/app/(app)/docs/[topic]/page");

const topic = async (slug: string) =>
  renderToStaticMarkup(await DocsTopic({ params: Promise.resolve({ topic: slug }) }));

describe("the Documentation", () => {
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
