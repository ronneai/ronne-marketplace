import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
// The theme switch posts to a server action; the render only needs a reference to it.
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));

const { AppShell } = await import("./AppShell");

import { MainNav } from "./MainNav";

const GLOBAL = "00000000000000000000000000";

import { isCurrent, navFor } from "./nav";

describe("navFor", () => {
  it("shows nothing signed out, Home, Catalogue, Submissions and Docs for everyone, Reviews to reviewers, and Admin only for root", () => {
    expect(navFor(null)).toEqual([]);
    expect(
      navFor({
        name: "U",
        email: "u@example.com",
        role: "user",
        workspaces: { [GLOBAL]: "user" },
      }).map((i) => i.label),
    ).toEqual(["Home", "Catalogue", "Workspaces", "Submissions", "Docs"]);
    // A moderator of another workspace only, a plain user in global (091).
    expect(
      navFor({
        name: "A",
        email: "a@example.com",
        role: "user",
        workspaces: { [GLOBAL]: "user", acme: "moderator" },
      }).map((i) => i.label),
    ).toEqual(["Home", "Catalogue", "Workspaces", "Submissions", "Reviews", "Docs"]);
    // In no workspace at all (not reachable while everyone is in global): nothing to submit to.
    expect(navFor({ name: "N", email: "n@example.com", role: "user" }).map((i) => i.label)).toEqual(
      ["Home", "Catalogue", "Workspaces", "Docs"],
    );
    expect(
      navFor({
        name: "M",
        email: "m@example.com",
        role: "user",
        workspaces: { [GLOBAL]: "moderator" },
      }).map((i) => i.label),
    ).toEqual(["Home", "Catalogue", "Workspaces", "Submissions", "Reviews", "Docs"]);
    expect(navFor({ name: "R", email: "r@example.com", role: "root" }).map((i) => i.label)).toEqual(
      ["Home", "Catalogue", "Workspaces", "Submissions", "Reviews", "Admin", "Docs"],
    );
    expect(navFor({ name: "R", email: "r@example.com", role: "root" })[5]?.href).toBe(
      "/admin/users",
    );
  });

  it("gives a workspace's admin Admin, opening their workspaces (092)", () => {
    const admin = navFor({
      name: "A",
      email: "a@example.com",
      role: "user",
      workspaces: { [GLOBAL]: "user", acme: "admin" },
    });
    expect(admin.map((i) => i.label)).toEqual([
      "Home",
      "Catalogue",
      "Workspaces",
      "Submissions",
      "Reviews",
      "Admin",
      "Docs",
    ]);
    expect(admin.find((i) => i.label === "Admin")?.href).toBe("/admin/workspaces");
  });
});

describe("Requests in the nav (094)", () => {
  const moderator = {
    name: "M",
    email: "m@example.com",
    role: "user" as const,
    workspaces: { [GLOBAL]: "user" as const, acme: "moderator" as const },
  };
  const user = { ...moderator, workspaces: { [GLOBAL]: "user" as const } };
  const labels = (items: ReturnType<typeof navFor>) => items.map((i) => i.label);

  it("shows Requests next to Reviews only while some wait for someone who can answer", () => {
    expect(labels(navFor(moderator))).not.toContain("Requests");
    expect(labels(navFor(moderator, { "/workspaces/requests": 0 }))).not.toContain("Requests");
    expect(labels(navFor(moderator, { "/workspaces/requests": 2 }))).toEqual([
      "Home",
      "Catalogue",
      "Workspaces",
      "Submissions",
      "Reviews",
      "Requests",
      "Docs",
    ]);
    expect(navFor(moderator, { "/workspaces/requests": 2 })[5]?.href).toBe("/workspaces/requests");
    expect(
      labels(
        navFor({ name: "R", email: "r@example.com", role: "root" }, { "/workspaces/requests": 1 }),
      ),
    ).toContain("Requests");
  });

  it("never shows it to someone who answers nowhere, whatever the count", () => {
    expect(labels(navFor(user, { "/workspaces/requests": 3 }))).not.toContain("Requests");
  });

  it("shows the count next to Requests", () => {
    const html = renderToStaticMarkup(
      <MainNav
        items={navFor(moderator, { "/workspaces/requests": 2 })}
        counts={{ "/workspaces/requests": 2 }}
      />,
    );
    expect(html).toMatch(
      /href="\/workspaces\/requests"[^>]*>Requests<span[^>]*>2<span class="sr-only"> waiting/,
    );
  });
});

describe("MainNav", () => {
  it("is positioned, so its scrolling strip clips the counts' screen-reader text (065)", () => {
    const html = renderToStaticMarkup(<MainNav items={[]} />);
    expect(html).toMatch(/<nav aria-label="Main" class="relative /);
  });

  it("puts Admin and Docs at the right, before the appearance switch", () => {
    const html = renderToStaticMarkup(
      <MainNav items={navFor({ name: "R", email: "r@example.com", role: "root" })} />,
    );
    const at = (label: string) => html.indexOf(`>${label}<`);
    const spacer = html.indexOf('<span class="ml-auto">');
    expect(at("Reviews")).toBeLessThan(spacer);
    expect(spacer).toBeLessThan(at("Admin"));
    expect(at("Admin")).toBeLessThan(at("Docs"));
  });

  it("opens Docs, the Documentation on the website, in a new tab (088)", () => {
    navigation.path = "/docs";
    const html = renderToStaticMarkup(
      <MainNav items={navFor({ name: "U", email: "u@example.com", role: "user" })} />,
    );
    navigation.path = "/";
    const docs = /<a [^>]*>Docs<[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
    expect(docs).toMatch(/^<a href="https:\/\/www\.ronne\.ai\/marketplace\/docs" /);
    expect(docs).toContain('target="_blank" rel="noopener noreferrer"');
    expect(docs).toContain("(opens in a new tab)");
    expect(docs).not.toContain("aria-current");
  });
});

describe("isCurrent", () => {
  it("marks Catalogue on the catalogue and on item pages, and Home only on the home page", () => {
    const [home, catalogue] = navFor({ name: "U", email: "u@example.com", role: "user" });
    expect(catalogue && isCurrent(catalogue, "/catalogue")).toBe(true);
    expect(catalogue && isCurrent(catalogue, "/items/team/fmt/versions")).toBe(true);
    expect(catalogue && isCurrent(catalogue, "/itemsx")).toBe(false);
    // A workspace's item pages are the catalogue's too; its join page isn't (118).
    expect(catalogue && isCurrent(catalogue, "/workspaces/acme/items/team/fmt")).toBe(true);
    expect(catalogue && isCurrent(catalogue, "/workspaces/acme/join")).toBe(false);
    expect(home && isCurrent(home, "/")).toBe(true);
    expect(home && isCurrent(home, "/catalogue")).toBe(false);
  });
});

describe("AppShell", () => {
  const render = (user: Parameters<typeof AppShell>[0]["user"], signOut?: () => Promise<void>) =>
    renderToStaticMarkup(
      <AppShell user={user} signOutAction={signOut}>
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

  it("renders the brand, the content and the footer, with no user menu when signed out", () => {
    const html = render(null);
    expect(html).toContain('aria-label="Ronne AI"');
    expect(html).toContain(">ronne</text>");
    expect(html).toContain("<p>content</p>");
    expect(html).toContain("open source (MIT)");
    expect(html).not.toContain("<details");
  });

  it("shows the name in the header, the name and email in the menu, and a role badge", () => {
    const html = render(
      { name: "Grace Hopper", email: "root@example.com", role: "root" },
      async () => {},
    );
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Grace Hopper");
    expect(summary).not.toContain("root@example.com");
    const menu = html.slice(html.indexOf("</summary>"));
    expect(menu).toContain("Grace Hopper");
    expect(menu).toContain("root@example.com");
    expect(html).toMatch(/rounded-full[^>]*>root</);
    expect(html).toContain("Access tokens");
    expect(html).toContain("Sign out");
    expect(html).toContain('href="/admin/users"');
  });

  it("gives plain users no role badge and no Admin link", () => {
    const html = render({ name: "U", email: "u@example.com", role: "user" });
    expect(html).not.toContain('href="/admin/users"');
    expect(html).not.toMatch(/>user</);
  });

  it("marks the current item from the live path, including every admin page", () => {
    const root = { name: "R", email: "r@example.com", role: "root" } as const;
    navigation.path = "/";
    expect(render(root)).toMatch(/aria-current="page"[^>]*>Home</);
    for (const path of ["/admin/users", "/admin/audit", "/admin"]) {
      navigation.path = path;
      const html = render(root);
      expect(html, path).toMatch(/aria-current="page"[^>]*>Admin</);
      expect(html, path).not.toMatch(/aria-current="page"[^>]*>Home</);
    }
    navigation.path = "/account/tokens";
    expect(render(root)).not.toContain('aria-current="page"');
  });

  it("puts the theme switch in the header, not in the user menu", () => {
    const html = renderToStaticMarkup(
      <AppShell user={{ name: "U", email: "u@example.com", role: "user" }} theme="dark">
        <p>content</p>
      </AppShell>,
    );
    const header = html.slice(0, html.indexOf("<details"));
    expect(header).toContain("Switch to the light theme");
    expect(header).toContain('value="light"');
    expect(html.slice(html.indexOf("<details"))).not.toContain('name="theme"');
  });

  describe("below lg, the Menu (066)", () => {
    const sheet = (html: string) => html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));
    const links = (html: string) =>
      [...sheet(html).matchAll(/<a [^>]*>([^<]+)/g)].map((match) => match[1]);
    const shell = (role: "user" | "moderator" | "root", counts?: Record<string, number>) =>
      renderToStaticMarkup(
        <AppShell
          user={{
            name: "Ada",
            email: "ada@example.com",
            role: role === "root" ? "root" : "user",
            workspaces: { [GLOBAL]: role === "moderator" ? "moderator" : "user" },
          }}
          signOutAction={async () => {}}
          navCounts={counts}
        >
          <p>content</p>
        </AppShell>,
      );

    it("hides the strip, the theme switch and the account menu below lg, and links Menu to /menu until the script runs", () => {
      const html = shell("user");
      expect(html).toMatch(/<nav aria-label="Main" class="[^"]*\bhidden\b[^"]*\blg:flex\b/);
      expect(html).toMatch(/<div class="ml-auto lg:hidden"><a class="[^"]*" href="\/menu">/);
      expect(html).toMatch(/class="[^"]*\bhidden lg:flex"><form/);
      expect(html).toMatch(/<\/svg>Menu<\/a>/);
    });

    it("keeps the theme switch in view signed out, with no Menu", () => {
      const html = render(null);
      expect(html).not.toContain("<dialog");
      expect(html).toMatch(/class="ml-auto shrink-0 items-center gap-2 flex"><form/);
    });

    it("lists a member's links, then the account part, the appearance switch and Sign out", () => {
      const html = shell("user");
      expect(links(html)).toEqual([
        "Home",
        "Catalogue",
        "Workspaces",
        "Submissions",
        "Docs",
        "Account",
        "Access tokens",
      ]);
      expect(sheet(html)).toContain("ada@example.com");
      expect(sheet(html)).toContain("Appearance");
      expect(sheet(html)).toContain('name="theme"');
      expect(sheet(html)).toContain(">Sign out</button>");
      expect(sheet(html)).not.toMatch(/>user</);
    });

    it("gives a moderator Reviews with its count, on the Menu button too; the badge is root's only (091)", () => {
      const html = shell("moderator", { "/reviews": 3 });
      expect(links(html)).toContain("Reviews");
      expect(sheet(html)).toMatch(/>Reviews<span[^>]*>3<span class="sr-only"> waiting/);
      expect(html).toMatch(/Menu<span[^>]*>3<span class="sr-only"> waiting<\/span><\/span><\/a>/);
      expect(sheet(html)).not.toMatch(/>moderator</);
    });

    it("gives root Admin, and marks the current page", () => {
      navigation.path = "/admin/audit";
      const html = shell("root");
      expect(links(html)).toEqual([
        "Home",
        "Catalogue",
        "Workspaces",
        "Submissions",
        "Reviews",
        "Admin",
        "Docs",
        "Account",
        "Access tokens",
      ]);
      expect(sheet(html)).toMatch(/aria-current="page"[^>]*>Admin</);
      navigation.path = "/";
    });

    it("shows no count on the Menu button when nothing waits", () => {
      expect(shell("moderator", { "/reviews": 0 })).not.toContain("waiting");
    });
  });
});
