import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
// The theme switch posts to a server action; the render only needs a reference to it.
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));

const { AppShell } = await import("./AppShell");

import { navFor } from "./nav";

describe("navFor", () => {
  it("shows nothing signed out, Home, Submissions and Scopes for everyone, Reviews to reviewers, and Admin only for root", () => {
    expect(navFor(null)).toEqual([]);
    expect(navFor({ name: "U", email: "u@example.com", role: "user" }).map((i) => i.label)).toEqual(
      ["Home", "Submissions", "Scopes"],
    );
    expect(
      navFor({ name: "M", email: "m@example.com", role: "moderator" }).map((i) => i.label),
    ).toEqual(["Home", "Submissions", "Reviews", "Scopes"]);
    expect(navFor({ name: "R", email: "r@example.com", role: "root" }).map((i) => i.label)).toEqual(
      ["Home", "Submissions", "Reviews", "Scopes", "Admin"],
    );
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
