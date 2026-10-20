import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ path: "/", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
// The theme switch posts to a server action; the render only needs a reference to it.
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));

const { AppShell } = await import("./AppShell");
const { Sidebar } = await import("./Sidebar");
const { WorkspaceSwitcher } = await import("./WorkspaceSwitcher");

import { canPropose, groupNav, isCurrent, NAV, navFor, type ShellUser } from "./nav";
import { parseFolded, sidebarCookie } from "./sidebar-cookie";

const GLOBAL = "00000000000000000000000000";

const ROOT: ShellUser = { name: "R", email: "r@example.com", role: "root" };
const member = (workspaces: Record<string, "admin" | "moderator" | "user">): ShellUser => ({
  name: "U",
  email: "u@example.com",
  role: "user",
  workspaces,
});
const labels = (user: ShellUser | null, counts?: Record<string, number>) =>
  navFor(user, counts).map((item) => item.label);

describe("navFor", () => {
  it("gives a member Discover's links, Submissions and the Tools; nothing signed out", () => {
    expect(navFor(null)).toEqual([]);
    expect(labels(member({ [GLOBAL]: "user" }))).toEqual([
      "Home",
      "Catalogue",
      "Workspaces",
      "Submissions",
      "Documentation",
      "CLI & tokens",
    ]);
    // In no workspace at all (not reachable while everyone is in global): nothing to submit to.
    expect(labels({ name: "N", email: "n@example.com", role: "user" })).toEqual([
      "Home",
      "Catalogue",
      "Workspaces",
      "Documentation",
      "CLI & tokens",
    ]);
  });

  it("adds Reviews for a moderator anywhere, and no Admin pages for a workspace's admin (091, 115)", () => {
    const reviewer = [
      "Home",
      "Catalogue",
      "Workspaces",
      "Reviews",
      "Submissions",
      "Documentation",
      "CLI & tokens",
    ];
    expect(labels(member({ [GLOBAL]: "moderator" }))).toEqual(reviewer);
    expect(labels(member({ [GLOBAL]: "user", acme: "moderator" }))).toEqual(reviewer);
    expect(labels(member({ [GLOBAL]: "user", acme: "admin" }))).toEqual(reviewer);
  });

  it("gives root Admin's three pages instead of one Admin link (119)", () => {
    expect(labels(ROOT)).toEqual([
      "Home",
      "Catalogue",
      "Workspaces",
      "Reviews",
      "Submissions",
      "Users",
      "Audit log",
      "Settings",
      "Documentation",
      "CLI & tokens",
    ]);
    expect(navFor(ROOT).map((item) => item.href)).toEqual(
      expect.arrayContaining(["/admin/users", "/admin/audit", "/admin/settings"]),
    );
  });

  it("puts nothing in it for owning a personal workspace (114)", () => {
    const owner = { ...member({ mine: "admin", g: "user" }), personal: "mine" };
    const counts = { "/reviews": 1, "/workspaces/requests": 1 };
    for (const label of ["Reviews", "Requests", "Users"])
      expect(labels(owner, counts)).not.toContain(label);
    expect(
      labels({ ...owner, workspaces: { ...owner.workspaces, team: "admin" } }, counts),
    ).toEqual(expect.arrayContaining(["Reviews", "Requests"]));
  });

  it("opens Documentation, the website (088), in a new tab", () => {
    const docs = NAV.find((item) => item.label === "Documentation");
    expect(docs?.href).toBe("https://www.ronne.ai/marketplace/docs");
    expect(docs?.external).toBe(true);
  });
});

describe("Requests in the nav (094)", () => {
  const moderator = member({ [GLOBAL]: "user", acme: "moderator" });

  it("shows Requests under Discover only while some wait for someone who can answer", () => {
    expect(labels(moderator)).not.toContain("Requests");
    expect(labels(moderator, { "/workspaces/requests": 0 })).not.toContain("Requests");
    expect(labels(moderator, { "/workspaces/requests": 2 }).slice(0, 4)).toEqual([
      "Home",
      "Catalogue",
      "Workspaces",
      "Requests",
    ]);
    expect(labels(ROOT, { "/workspaces/requests": 1 })).toContain("Requests");
  });

  it("never shows it to someone who answers nowhere, whatever the count", () => {
    expect(labels(member({ [GLOBAL]: "user" }), { "/workspaces/requests": 3 })).not.toContain(
      "Requests",
    );
  });
});

describe("groupNav", () => {
  it("keeps the groups in order and leaves out an empty one", () => {
    const grouped = (user: ShellUser) =>
      groupNav(navFor(user)).map((group) => [group.label, group.items.map((item) => item.label)]);
    expect(grouped(ROOT)).toEqual([
      ["Discover", ["Home", "Catalogue", "Workspaces"]],
      ["Governance & reviews", ["Reviews", "Submissions", "Users", "Audit log", "Settings"]],
      ["Tools", ["Documentation", "CLI & tokens"]],
    ]);
    expect(grouped({ name: "N", email: "n@example.com", role: "user" })).toEqual([
      ["Discover", ["Home", "Catalogue", "Workspaces"]],
      ["Tools", ["Documentation", "CLI & tokens"]],
    ]);
  });
});

describe("canPropose", () => {
  it("is for those who can submit", () => {
    expect(canPropose(null)).toBe(false);
    expect(canPropose({ name: "N", email: "n@example.com", role: "user" })).toBe(false);
    expect(canPropose(member({ [GLOBAL]: "user" }))).toBe(true);
    expect(canPropose(ROOT)).toBe(true);
  });
});

describe("the fold cookie", () => {
  it("is folded only when it says so, and is set for the whole site for a year", () => {
    expect(parseFolded("folded")).toBe(true);
    for (const value of [undefined, "open", "FOLDED", ""]) expect(parseFolded(value)).toBe(false);
    expect(sidebarCookie(true)).toBe(
      "ronne-sidebar=folded; path=/; max-age=31536000; samesite=lax",
    );
    expect(sidebarCookie(false)).toMatch(/^ronne-sidebar=open;/);
  });
});

describe("isCurrent", () => {
  const find = (label: string) => {
    const item = navFor(ROOT).find((i) => i.label === label);
    if (!item) throw new Error(label);
    return item;
  };

  it("marks Catalogue on the catalogue and on item pages, and Home only on the home page", () => {
    const catalogue = find("Catalogue");
    expect(isCurrent(catalogue, "/catalogue")).toBe(true);
    expect(isCurrent(catalogue, "/items/team/fmt/versions")).toBe(true);
    expect(isCurrent(catalogue, "/itemsx")).toBe(false);
    // A workspace's item pages are the catalogue's too; its join page isn't (118).
    expect(isCurrent(catalogue, "/workspaces/acme/items/team/fmt")).toBe(true);
    expect(isCurrent(catalogue, "/workspaces/acme/join")).toBe(false);
    expect(isCurrent(find("Home"), "/")).toBe(true);
    expect(isCurrent(find("Home"), "/catalogue")).toBe(false);
  });

  it("marks Workspaces on the list and a workspace's pages (115), not on Requests or its items", () => {
    const workspaces = find("Workspaces");
    for (const [path, current] of [
      ["/workspaces", true],
      ["/workspaces/acme", true],
      ["/workspaces/acme/join", true],
      ["/workspaces/requests", false],
      ["/workspaces/acme/items/team/fmt", false],
      ["/workspacesx", false],
    ] as const)
      expect(isCurrent(workspaces, path), path).toBe(current);
  });

  it("marks each Admin page on its own pages only", () => {
    expect(isCurrent(find("Users"), "/admin/users")).toBe(true);
    // One user's page (123) is under Users.
    expect(isCurrent(find("Users"), "/admin/users/01K6BZ3W1D8J9Q2R4T6V8X0Y2Z")).toBe(true);
    expect(isCurrent(find("Audit log"), "/admin/users/01K6BZ3W1D8J9Q2R4T6V8X0Y2Z")).toBe(false);
    expect(isCurrent(find("Users"), "/admin/audit")).toBe(false);
    expect(isCurrent(find("Audit log"), "/admin/audit")).toBe(true);
    expect(isCurrent(find("Settings"), "/admin/settings")).toBe(true);
    expect(isCurrent(find("CLI & tokens"), "/account/tokens")).toBe(true);
  });

  it("marks Requests on its page, and nothing else there", () => {
    const items = navFor(ROOT, { "/workspaces/requests": 1 });
    expect(
      items.filter((item) => isCurrent(item, "/workspaces/requests")).map((i) => i.label),
    ).toEqual(["Requests"]);
  });
});

describe("WorkspaceSwitcher", () => {
  const workspaces = [
    { name: "ana", role: "admin" as const, personal: true },
    { name: "global", role: "user" as const, personal: false },
    { name: "acme", role: "moderator" as const, personal: false },
  ];
  const render = (current: string | null, folded = false) =>
    renderToStaticMarkup(
      <WorkspaceSwitcher workspaces={workspaces} current={current} folded={folded} />,
    );
  const summary = (html: string) =>
    html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
  const hrefs = (html: string) =>
    [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) =>
      match[1]?.replaceAll("&amp;", "&"),
    );

  it("shows the current workspace, or All workspaces (120)", () => {
    expect(summary(render(null))).toContain(">All workspaces<");
    expect(summary(render("acme"))).toContain(">acme<");
    expect(summary(render("ana"))).toContain("Personal workspace");
    // A name it isn't offered (stale) shows as all.
    expect(summary(render("gone"))).toContain(">All workspaces<");
  });

  it("offers All workspaces, then each workspace as a choice and its page, then Manage workspaces", () => {
    navigation.path = "/catalogue";
    navigation.search = "q=lint&workspace=acme";
    const html = render("acme");
    navigation.path = "/";
    navigation.search = "";
    const here = encodeURIComponent("/catalogue?q=lint&workspace=acme");
    expect(hrefs(html)).toEqual([
      `/current-workspace?set=&next=${here}`,
      `/current-workspace?set=ana&next=${here}`,
      "/workspaces/ana",
      `/current-workspace?set=global&next=${here}`,
      "/workspaces/global",
      `/current-workspace?set=acme&next=${here}`,
      "/workspaces/acme",
      "/workspaces",
    ]);
    expect(html).toContain('aria-label="Open acme&#x27;s page"');
    expect(html).toContain(">Manage workspaces");
    expect(html).toMatch(/>acme<\/span><span[^>]*>moderator</);
    expect(html).toMatch(/>ana<\/span><span[^>]*>personal</);
  });

  it("marks the current choice, and only it", () => {
    const current = (html: string) =>
      [...html.matchAll(/<a [^>]*aria-current="true"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
    expect(current(render("acme"))).toHaveLength(1);
    expect(current(render("acme"))[0]).toContain("set=acme");
    expect(current(render(null))[0]).toContain("All workspaces");
  });

  it("is named by the current workspace when folded", () => {
    expect(render("ana", true)).toContain('aria-label="Workspace: ana (personal workspace)"');
    expect(render(null, true)).toContain('aria-label="Workspace: All workspaces"');
  });

  it("puts each full name in a title, since a long one is cut, and encodes names in links", () => {
    expect(render(null)).toContain('title="acme"');
    expect(render("ana")).toContain('title="ana (personal workspace)"');
    const html = renderToStaticMarkup(
      <WorkspaceSwitcher workspaces={[{ name: "a b", role: "user", personal: false }]} />,
    );
    expect(html).toContain('href="/workspaces/a%20b"');
    expect(html).toContain("set=a+b");
  });
});

describe("Sidebar", () => {
  const sidebar = (props: Partial<Parameters<typeof Sidebar>[0]> = {}) =>
    renderToStaticMarkup(
      <Sidebar
        user={ROOT}
        items={navFor(ROOT, { "/reviews": 3 })}
        counts={{ "/reviews": 3 }}
        workspaces={[{ name: "r", role: "admin", personal: true }]}
        propose
        appearance={<span>THEME</span>}
        signOutAction={async () => {}}
        version="1.2.3"
        {...props}
      />,
    );

  it("shows the groups' headings, the links, Propose item and the count", () => {
    const html = sidebar();
    const at = (text: string) => html.indexOf(text);
    expect(at(">Discover<")).toBeLessThan(at(">Home<"));
    expect(at(">Home<")).toBeLessThan(at(">Governance &amp; reviews<"));
    expect(at(">Governance &amp; reviews<")).toBeLessThan(at(">Users<"));
    expect(at(">Users<")).toBeLessThan(at(">Tools<"));
    expect(html).toMatch(/href="\/submissions\/new"[^>]*>.*Propose item<\/a>/);
    expect(html).toMatch(/Reviews<\/span><span[^>]*>3<span class="sr-only"> waiting/);
    expect(html).toContain('<nav aria-label="Main"');
  });

  it("leaves out Propose item for those who can't submit", () => {
    expect(sidebar({ propose: false })).not.toContain("Propose item");
  });

  it("marks the current link from the live path", () => {
    navigation.path = "/admin/audit";
    const html = sidebar();
    navigation.path = "/";
    expect(html).toMatch(/aria-current="page"[^>]*>.*?Audit log</);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("opens Documentation in a new tab", () => {
    const docs = /<a [^>]*href="https:\/\/www\.ronne\.ai[^"]*"[^>]*>[\s\S]*?<\/a>/.exec(sidebar());
    expect(docs?.[0]).toContain('target="_blank" rel="noopener noreferrer"');
    expect(docs?.[0]).toContain("(opens in a new tab)");
    expect(docs?.[0]).not.toContain("aria-current");
  });

  it("puts the person, their menu, the appearance switch and the version at the foot", () => {
    const html = sidebar();
    const summary = html.slice(html.lastIndexOf("<summary"), html.lastIndexOf("</summary>"));
    expect(summary).toContain(">R<");
    expect(summary).not.toContain("r@example.com");
    expect(html).toMatch(/<summary [^>]*title="R"/);
    expect(summary).toMatch(/rounded-full[^>]*>root</);
    const menu = html.slice(html.lastIndexOf("</summary>"));
    expect(menu).toContain("r@example.com");
    expect(menu).toContain('href="/account/password"');
    expect(menu).toContain(">Sign out</button>");
    expect(menu).toContain("THEME");
    expect(menu).toContain("ronne marketplace v1.2.3");
  });

  it("gives plain users no role badge", () => {
    const user = member({ [GLOBAL]: "user" });
    expect(sidebar({ user, items: navFor(user) })).not.toMatch(/>user</);
  });

  it("has a round chevron button on the sidebar's edge, half over the page, at the logo's height", () => {
    const button = (html: string) =>
      html.match(/<button[^>]*aria-controls="sidebar"[^>]*>.*?<\/button>/)?.[0] ?? "";
    const open = button(sidebar());
    // A circle on the right edge (the row of the logo is its box), half out: not flat in the row.
    for (const cls of [
      "rounded-full",
      "absolute",
      "-right-3",
      "translate-x-1/2",
      "top-1/2",
      "-translate-y-1/2",
      "z-40",
      "touch-hit",
    ])
      expect(open, cls).toContain(cls);
    // Fold points left, unfold points right; no panel icon.
    expect(open).toContain("lucide-chevron-left");
    expect(open).not.toContain("lucide-panel-left");
    const folded = button(sidebar({ folded: true }));
    expect(folded).toContain("lucide-chevron-right");
    expect(folded).toContain('aria-label="Unfold the sidebar"');
    // Flat, in the design's tokens: a hairline border on the surface, never a shadow.
    expect(open).toMatch(/border-hairline/);
    expect(open).toMatch(/bg-surface/);
    expect(open).not.toMatch(/shadow/);
    // The logo and the button share one row, so the button follows the logo or the monogram.
    const row = sidebar().match(/<div class="relative flex h-\[30px\] items-center[^"]*">/)?.[0];
    expect(row).toBeTruthy();
  });

  it("unfolded, offers to fold; folded, names every icon and puts a dot where a count waits", () => {
    expect(sidebar()).toContain('aria-label="Fold the sidebar"');
    expect(sidebar()).toMatch(/aria-expanded="true" aria-controls="sidebar"/);
    const html = sidebar({ folded: true });
    expect(html).toContain('aria-label="Unfold the sidebar"');
    expect(html).toContain("w-16");
    expect(html).not.toContain(">Discover<");
    for (const name of [
      "Home",
      "Catalogue",
      "Reviews (3 waiting)",
      "Users",
      "Documentation (opens in a new tab)",
      "CLI &amp; tokens",
      "Propose item",
      "R, your account",
    ])
      expect(html, name).toContain(`aria-label="${name}"`);
    expect(html).toContain('aria-label="Ronne"');
    expect(html).not.toContain("v1.2.3");
    // The dot: on Reviews, which has a count, and on no other link.
    const dot = /<span aria-hidden="true" class="[^"]*\brounded-full bg-accent\b/g;
    const reviews = /<a [^>]*aria-label="Reviews \(3 waiting\)"[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
    expect(reviews).toMatch(dot);
    expect(html.match(dot)).toHaveLength(1);
  });
});

describe("AppShell", () => {
  const render = (user: ShellUser | null, props: Partial<Parameters<typeof AppShell>[0]> = {}) =>
    renderToStaticMarkup(
      <AppShell user={user} signOutAction={async () => {}} {...props}>
        <p>content</p>
      </AppShell>,
    );

  it("keeps the header, content and footer clear of a phone's notch and home indicator (065)", () => {
    const html = render(null);
    expect(html).toMatch(/<header class="[^"]*\bpt-safe px-safe\b/);
    expect(html).toMatch(/<div class="flex flex-1 flex-col px-safe"><main /);
    expect(html).toMatch(/<footer class="[^"]*\bpb-safe px-safe\b/);
    expect(html).toContain("min-h-dvh");
  });

  it("signed out: the brand, the appearance switch, the content and the footer, and no sidebar", () => {
    const html = render(null);
    expect(html).toContain('aria-label="Ronne AI"');
    expect(html).toContain("<p>content</p>");
    expect(html).toContain("open source (MIT)");
    expect(html).toContain('name="theme"');
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<dialog");
    // The header stays from lg: there's no sidebar to take its place.
    expect(html).toMatch(/<header class="[^"]*"/);
    expect(/<header class="([^"]*)"/.exec(html)?.[1]).not.toContain("lg:hidden");
  });

  it("signed in: the sidebar from lg, the slim header below it, and content that fills the rest", () => {
    const html = render(ROOT, { theme: "dark", version: "1.2.3", folded: true });
    expect(html).toMatch(
      /<aside id="sidebar" aria-label="Sidebar" class="[^"]*\bhidden\b[^"]*\blg:flex\b/,
    );
    expect(html).toMatch(/<header class="[^"]*\blg:hidden\b/);
    expect(html).toMatch(/<main class="w-full flex-1 [^"]*\bsm:px-6\b/);
    expect(/<main class="([^"]*)"/.exec(html)?.[1]).not.toMatch(/max-w|mx-auto/);
    const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(aside).toContain("Switch to the light theme");
    expect(aside).toContain('aria-label="Unfold the sidebar"');
  });

  it("gives the switcher the current workspace in the sidebar, the folded rail and the Menu (120)", () => {
    const workspaces = [{ name: "ada", role: "admin" as const, personal: true }];
    const summaries = (html: string) =>
      [...html.matchAll(/<summary [^>]*>[\s\S]*?<\/summary>/g)].map((m) => m[0]);
    const open = render(ROOT, { workspaces, current: "ada" });
    const aside = open.slice(open.indexOf("<aside"), open.indexOf("</aside>"));
    expect(summaries(aside)[0]).toContain(">ada<");
    const sheet = open.slice(open.indexOf("<dialog"), open.indexOf("</dialog>"));
    expect(summaries(sheet)[0]).toContain(">ada<");
    expect(sheet).toMatch(/aria-current="true"[^>]*>[\s\S]*?>ada</);
    const folded = render(ROOT, { workspaces, current: "ada", folded: true });
    expect(folded).toContain('aria-label="Workspace: ada (personal workspace)"');
    expect(render(ROOT, { workspaces })).toContain(">All workspaces<");
  });

  describe("below lg, the Menu (066)", () => {
    const sheet = (html: string) => html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));
    // Each link's text, its icons and spans flattened; icon-only links (Open … page) are skipped.
    const links = (html: string) =>
      [...sheet(html).matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)]
        .map((match) =>
          (match[1] ?? "")
            .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .replace("&amp;", "&")
            .trim(),
        )
        .filter(Boolean);
    const shell = (role: "user" | "moderator" | "root", counts?: Record<string, number>) =>
      render(
        {
          name: "Ada",
          email: "ada@example.com",
          role: role === "root" ? "root" : "user",
          workspaces: { [GLOBAL]: role === "moderator" ? "moderator" : "user" },
        },
        {
          navCounts: counts,
          workspaces: [{ name: "ada", role: "admin", personal: true }],
        },
      );

    it("links Menu to /menu until the script runs", () => {
      expect(shell("user")).toMatch(/<\/svg>Menu<\/a>/);
      expect(shell("user")).toContain('href="/menu"');
    });

    it("lists the switcher, Propose item, the groups, then the account, the appearance switch and Sign out", () => {
      const html = shell("user");
      expect(sheet(html)).toContain('href="/workspaces/ada"');
      expect(sheet(html)).toContain("set=ada");
      expect(links(html)).toEqual([
        "All workspaces",
        "ada personal",
        "Manage workspaces",
        "Propose item",
        "Home",
        "Catalogue",
        "Workspaces",
        "Submissions",
        "Documentation",
        "CLI & tokens",
        "Account",
      ]);
      expect(sheet(html)).toContain(">Discover<");
      expect(sheet(html)).toContain("ada@example.com");
      expect(sheet(html)).toContain("Appearance");
      expect(sheet(html)).toContain('name="theme"');
      expect(sheet(html)).toContain(">Sign out</button>");
      expect(sheet(html)).not.toMatch(/>user</);
    });

    it("gives a moderator Reviews with its count, on the Menu button too; the badge is root's only (091)", () => {
      const html = shell("moderator", { "/reviews": 3 });
      expect(links(html)).toContain("Reviews 3");
      expect(sheet(html)).toMatch(/>Reviews<span[^>]*>3<span class="sr-only"> waiting/);
      expect(html).toMatch(/Menu<span[^>]*>3<span class="sr-only"> waiting<\/span><\/span><\/a>/);
      expect(sheet(html)).not.toMatch(/>moderator</);
    });

    it("gives root Admin's pages, and marks the current page", () => {
      navigation.path = "/admin/audit";
      const html = shell("root");
      navigation.path = "/";
      expect(links(html)).toEqual(expect.arrayContaining(["Users", "Audit log", "Settings"]));
      expect(sheet(html)).toMatch(/aria-current="page"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Audit log</);
    });

    it("shows no count on the Menu button when nothing waits", () => {
      expect(shell("moderator", { "/reviews": 0 })).not.toContain("waiting");
    });
  });
});
