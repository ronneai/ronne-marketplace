import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
// The theme switch posts to a server action; the render only needs a reference to it.
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));

const { AppShell } = await import("./AppShell");

import { MainNav } from "./MainNav";
import { isCurrent, navFor } from "./nav";

describe("navFor", () => {
  it("shows nothing signed out, Home, Catalogue, Submissions and Docs for everyone, Reviews to reviewers, and Admin only for root", () => {
    expect(navFor(null)).toEqual([]);
    expect(navFor({ name: "U", email: "u@example.com", role: "user" }).map((i) => i.label)).toEqual(
      ["Home", "Catalogue", "Submissions", "Docs"],
    );
    expect(
      navFor({ name: "M", email: "m@example.com", role: "moderator" }).map((i) => i.label),
    ).toEqual(["Home", "Catalogue", "Submissions", "Reviews", "Docs"]);
    expect(navFor({ name: "R", email: "r@example.com", role: "root" }).map((i) => i.label)).toEqual(
      ["Home", "Catalogue", "Submissions", "Reviews", "Admin", "Docs"],
    );
  });
});

describe("MainNav", () => {
  it("puts Admin and Docs at the right, before the appearance switch", () => {
    const html = renderToStaticMarkup(
      <MainNav items={navFor({ name: "R", email: "r@example.com", role: "root" })} />,
    );
    const at = (label: string) => html.indexOf(`>${label}</a>`);
    const spacer = html.indexOf('<span class="ml-auto">');
    expect(at("Reviews")).toBeLessThan(spacer);
    expect(spacer).toBeLessThan(at("Admin"));
    expect(at("Admin")).toBeLessThan(at("Docs"));
  });
});

describe("isCurrent", () => {
  it("marks Catalogue on the catalogue and on item pages, and Home only on the home page", () => {
    const [home, catalogue] = navFor({ name: "U", email: "u@example.com", role: "user" });
    expect(catalogue && isCurrent(catalogue, "/catalogue")).toBe(true);
    expect(catalogue && isCurrent(catalogue, "/items/team/fmt/versions")).toBe(true);
    expect(catalogue && isCurrent(catalogue, "/itemsx")).toBe(false);
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
    expect(html).toMatch(/font-mono[^>]*>root</);
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
});
