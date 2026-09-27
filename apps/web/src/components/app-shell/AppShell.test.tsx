import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { navFor } from "./nav";

describe("navFor", () => {
  it("shows nothing signed out, Home for users, and Admin only for root", () => {
    expect(navFor(null)).toEqual([]);
    expect(navFor({ email: "u@example.com", role: "user" }).map((i) => i.label)).toEqual(["Home"]);
    expect(navFor({ email: "m@example.com", role: "moderator" }).map((i) => i.label)).toEqual([
      "Home",
    ]);
    expect(navFor({ email: "r@example.com", role: "root" }).map((i) => i.label)).toEqual([
      "Home",
      "Admin",
    ]);
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

  it("shows the email, a role badge for root, and the menu", () => {
    const html = render({ email: "root@example.com", role: "root" }, async () => {});
    expect(html).toContain("root@example.com");
    expect(html).toMatch(/font-mono[^>]*>root</);
    expect(html).toContain("Access tokens");
    expect(html).toContain("Sign out");
    expect(html).toContain('href="/admin/audit"');
  });

  it("gives plain users no role badge and no Admin link", () => {
    const html = render({ email: "u@example.com", role: "user" });
    expect(html).not.toContain('href="/admin/audit"');
    expect(html).not.toMatch(/>user</);
  });

  it("marks the current page", () => {
    expect(render({ email: "u@example.com", role: "user" })).toContain('aria-current="page"');
  });
});
