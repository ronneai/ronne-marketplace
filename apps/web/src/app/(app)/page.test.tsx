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
const shelves = vi.hoisted(() => ({ favoritedAmong: vi.fn() }));
vi.mock("@/server/domains/shelves/actions/favorites", () => shelves);
vi.mock("@/features/favorites/actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
const loaded = vi.hoisted(() => ({
  loadFavoritesShelf: vi.fn(),
  loadPinnedShelf: vi.fn(),
}));
vi.mock("@/features/pins/load-shelves", () => loaded);
const pins = vi.hoisted(() => ({ workspaceNamed: vi.fn() }));
vi.mock("@/server/domains/shelves/actions/pins", () => pins);
vi.mock("@/features/pins/actions", () => ({
  loadShelfAction: vi.fn(),
  moveInShelfAction: vi.fn(),
  pinToShelfAction: vi.fn(),
  unpinFromShelfAction: vi.fn(),
}));
const started = vi.hoisted(() => ({ gettingStarted: vi.fn(), markSetUpSeen: vi.fn() }));
vi.mock("@/server/domains/onboarding/actions/getting-started", () => started);
vi.mock("@/features/getting-started/actions", () => ({
  confirmInstallFromForm: vi.fn(),
  hideGettingStartedFromForm: vi.fn(),
  showGettingStartedFromForm: vi.fn(),
}));
const scopes = vi.hoisted(() => ({ pageScopes: vi.fn() }));
vi.mock("@/server/domains/items/actions/scopes", () => scopes);
vi.mock("@/server/config", () => ({ loadConfig: () => ({ publicUrl: "https://market.example" }) }));
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

const panel = (shown: "steps" | "setUp" | null, extra: Record<string, boolean> = {}) => ({
  done: { token: false, connect: false, install: false, draft: false, ...extra },
  count: Object.values(extra).filter(Boolean).length,
  current: "token",
  complete: false,
  hidden: false,
  panel: shown,
});

const render = async () => renderToStaticMarkup(await HomePage());

beforeEach(() => {
  vi.clearAllMocks();
  shelves.favoritedAmong.mockResolvedValue(new Set());
  loaded.loadFavoritesShelf.mockResolvedValue({ entries: [], starred: [] });
  loaded.loadPinnedShelf.mockResolvedValue({ entries: [], starred: [] });
  pins.workspaceNamed.mockResolvedValue(null);
  catalogue.homeLists.mockResolvedValue({
    recent: [entry("fmt"), entry("lint")],
    mostUsed: [],
    types: ["skill"],
  });
  drafts.listMySubmissions.mockResolvedValue([]);
  reviews.countNeedsReview.mockResolvedValue(0);
  shell.loadShell.mockResolvedValue({ user: { role: "user" } });
  started.gettingStarted.mockResolvedValue(panel(null));
  started.markSetUpSeen.mockResolvedValue(true);
  scopes.pageScopes.mockResolvedValue({ total: { count: 1, capped: false } });
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

describe("favorites on Home (125)", () => {
  it("fills the stars of the listed items the person has favorited", async () => {
    shelves.favoritedAmong.mockResolvedValue(new Set(["lint"]));
    const html = await render();
    expect(shelves.favoritedAmong).toHaveBeenCalledWith(expect.any(Headers), ["fmt", "lint"]);
    expect(html).toContain('aria-label="Add @team/fmt to favorites"');
    expect(html).toContain('aria-label="Remove @team/lint from favorites"');
  });
});

describe("the shelves on Home (125)", () => {
  it("shows nothing for favorites and pins that are not there", async () => {
    const html = await render();
    expect(html).not.toContain("Your favorites");
    expect(html).not.toContain("Start here");
    expect(html).not.toContain("Pinned in");
  });

  it("shows the favorites with See all into the catalogue's Favorites filter", async () => {
    loaded.loadFavoritesShelf.mockResolvedValue({ entries: [entry("fav")], starred: ["fav"] });
    const html = await render();
    expect(html).toContain(">Your favorites<");
    expect(html).toContain('href="/catalogue?favorites=1"');
    expect(html).toContain('aria-label="Remove @team/fav from favorites"');
  });

  it("shows Start here to everyone, and Manage only to root", async () => {
    loaded.loadPinnedShelf.mockResolvedValue({ entries: [entry("first")], starred: [] });
    const user = await render();
    expect(user).toContain(">Start here<");
    expect(user).toContain("@team/first");
    expect(user).not.toContain('aria-label="Manage Start here"');
    shell.loadShell.mockResolvedValue({ user: { role: "root" } });
    expect(await render()).toContain('aria-label="Manage Start here"');
  });

  it("shows the current workspace's pins under its name, with Manage for its admin", async () => {
    pins.workspaceNamed.mockResolvedValue({ id: "W1", name: "acme" });
    loaded.loadPinnedShelf.mockImplementation(async (_headers: Headers, shelf: { kind: string }) =>
      shelf.kind === "workspace"
        ? { entries: [entry("ours")], starred: [] }
        : { entries: [], starred: [] },
    );
    shell.loadShell.mockResolvedValue({
      user: { role: "user", workspaces: { W1: "admin" } },
      current: "acme",
    });
    const admin = await render();
    expect(admin).toContain(">Pinned in acme<");
    expect(admin).toContain("@team/ours");
    expect(admin).toContain('aria-label="Manage acme"');
    expect(pins.workspaceNamed).toHaveBeenCalledWith(expect.any(Headers), "acme");
    expect(loaded.loadPinnedShelf).toHaveBeenCalledWith(expect.any(Headers), {
      kind: "workspace",
      workspaceId: "W1",
    });
    shell.loadShell.mockResolvedValue({
      user: { role: "user", workspaces: { W1: "user" } },
      current: "acme",
    });
    expect(await render()).not.toContain('aria-label="Manage acme"');
  });

  it("asks for no workspace's pins while there is no current workspace", async () => {
    await render();
    expect(pins.workspaceNamed).not.toHaveBeenCalled();
  });
});

describe("Getting started on Home (126)", () => {
  it("shows nothing when the person has hidden it or is done", async () => {
    const html = await render();
    expect(html).not.toContain("Getting started");
    expect(html).not.toContain("You’re set up");
    expect(started.markSetUpSeen).not.toHaveBeenCalled();
  });

  it("shows the steps with the instance's address and the progress, and marks nothing seen", async () => {
    started.gettingStarted.mockResolvedValue(panel("steps", { token: true }));
    const html = await render();
    expect(html).toContain(">Getting started<");
    expect(html).toContain("1 of 4 done");
    expect(html).toContain("rmk login --registry https://market.example --web");
    expect(started.markSetUpSeen).not.toHaveBeenCalled();
  });

  it("shows 'You’re set up' and marks it seen, so the next visit is without it", async () => {
    started.gettingStarted.mockResolvedValue(panel("setUp", { token: true, connect: true }));
    const html = await render();
    expect(html).toContain(">You’re set up<");
    expect(started.markSetUpSeen).toHaveBeenCalledTimes(1);
    expect(started.markSetUpSeen).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("tells root when the instance has no scope yet, and only root", async () => {
    started.gettingStarted.mockResolvedValue(panel("steps"));
    scopes.pageScopes.mockResolvedValue({ total: { count: 0, capped: false } });
    shell.loadShell.mockResolvedValue({ user: { role: "root" } });
    expect(await render()).toContain("This registry has no scope yet.");
    scopes.pageScopes.mockClear();
    shell.loadShell.mockResolvedValue({ user: { role: "user" } });
    expect(await render()).not.toContain("no scope yet");
    expect(scopes.pageScopes).not.toHaveBeenCalled();
  });

  it("doesn't tell root once there is a scope", async () => {
    started.gettingStarted.mockResolvedValue(panel("steps"));
    shell.loadShell.mockResolvedValue({ user: { role: "root" } });
    expect(await render()).not.toContain("no scope yet");
  });
});
