import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";

const catalogue = vi.hoisted(() => ({ homeLists: vi.fn() }));
const drafts = vi.hoisted(() => ({ listMySubmissions: vi.fn() }));
const reviews = vi.hoisted(() => ({ countNeedsReview: vi.fn() }));
vi.mock("@/server/domains/items/actions/catalogue", () => catalogue);
vi.mock("@/server/domains/submissions/actions/drafts", () => drafts);
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
const shell = vi.hoisted(() => ({ loadShell: vi.fn() }));
vi.mock("./shell", () => shell);

const { default: HomePage } = await import("./page");

const entry = (name: string, downloadCount = 0): CatalogueEntry => ({
  id: name,
  workspace: "global",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "team",
  name,
  type: "skill",
  version: "1.0.0",
  description: `The ${name} skill.`,
  keywords: [],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
});

const render = async () => renderToStaticMarkup(await HomePage());

beforeEach(() => {
  vi.clearAllMocks();
  catalogue.homeLists.mockResolvedValue({
    recent: [entry("fmt"), entry("lint")],
    mostUsed: [],
    types: ["skill"],
  });
  drafts.listMySubmissions.mockResolvedValue([]);
  reviews.countNeedsReview.mockResolvedValue(0);
  shell.loadShell.mockResolvedValue({ user: { role: "user" } });
});

describe("the home page", () => {
  it("has a search box into the catalogue, and recently published items with See all", async () => {
    const html = await render();
    expect(html).toContain("Ronne AI Marketplace");
    expect(html).toMatch(/<form[^>]*action="\/catalogue"/);
    expect(html).toContain('name="q"');
    expect(html).toContain("Recently published");
    expect(html).toMatch(/<h3[^>]*><a [^>]*href="\/items\/team\/fmt"/);
    expect(html).toMatch(/href="\/catalogue"[^>]*>See all</);
  });

  it("hides Most used without installs, and shows the counts with them", async () => {
    expect(await render()).not.toContain("Most used");
    catalogue.homeLists.mockResolvedValue({
      recent: [entry("fmt")],
      mostUsed: [entry("lint", 12), entry("fmt", 1)],
      types: ["skill"],
    });
    const html = await render();
    expect(html).toContain("Most used");
    expect(html).toContain("12 installs");
    expect(html).toContain("1 install<");
  });

  it("shows a user their drafts and changes requested, and nothing when there are none", async () => {
    expect(await render()).not.toContain("Waiting for you");
    drafts.listMySubmissions.mockResolvedValue([
      { status: "draft" },
      { status: "draft" },
      { status: "changes_requested" },
      { status: "published" },
    ]);
    const html = await render();
    expect(html).toContain("Waiting for you");
    expect(html).toContain("You have 2 drafts in progress.");
    expect(html).toContain("1 submission of yours needs changes.");
    expect(html).not.toContain("for review");
  });

  it("shows moderators how many submissions wait for review", async () => {
    reviews.countNeedsReview.mockResolvedValue(3);
    const html = await render();
    expect(html).toMatch(/href="\/reviews"[^>]*>3 submissions wait for review\./);
  });

  it("tells everyone but root to submit an item or ask a moderator, in an empty registry", async () => {
    catalogue.homeLists.mockResolvedValue({ recent: [], mostUsed: [], types: [] });
    for (const role of ["user", "moderator"]) {
      shell.loadShell.mockResolvedValue({ user: { role } });
      const html = await render();
      expect(html, role).toContain("Nothing is published yet.");
      expect(html, role).toContain("Submit an item or ask a moderator.");
      expect(html, role).toContain('href="/submissions/new"');
      expect(html, role).not.toContain("Create a scope");
      expect(html, role).not.toContain("Recently published");
    }
  });

  it("points root at creating a scope and submitting the first item", async () => {
    catalogue.homeLists.mockResolvedValue({ recent: [], mostUsed: [], types: [] });
    shell.loadShell.mockResolvedValue({ user: { role: "root" } });
    const html = await render();
    expect(html).toContain("Nothing is published yet.");
    expect(html).toMatch(/href="\/workspaces\/global"[^>]*>Create a scope</);
    expect(html).toMatch(/href="\/submissions\/new"[^>]*>Submit the first item</);
    expect(html).not.toContain("ask a moderator");
  });

  it("shows root the lists, not the empty message, once something is released", async () => {
    shell.loadShell.mockResolvedValue({ user: { role: "root" } });
    const html = await render();
    expect(html).toContain("Recently published");
    expect(html).not.toContain("Nothing is published yet.");
  });
});
