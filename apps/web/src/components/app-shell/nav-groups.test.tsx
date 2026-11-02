// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navFor, type ShellUser } from "./nav";
import {
  NAV_GROUPS_COOKIE,
  navGroupsCookie,
  navGroupsFrom,
  parseClosedGroups,
  withGroup,
} from "./nav-groups-cookie";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));
const { MenuList } = await import("./MenuList");
const { Sidebar } = await import("./Sidebar");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT: ShellUser = { name: "R", email: "r@example.com", role: "root" };

const clearCookie = () => {
  // biome-ignore lint/suspicious/noDocumentCookie: the test's own browser.
  document.cookie = `${NAV_GROUPS_COOKIE}=; path=/; max-age=0`;
};

const roots: Root[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  clearCookie();
});

describe("the groups' cookie (166)", () => {
  it("names the closed groups, in order, and ignores anything else", () => {
    expect(parseClosedGroups(undefined)).toEqual([]);
    expect(parseClosedGroups("")).toEqual([]);
    expect(parseClosedGroups("admin.discover")).toEqual(["discover", "admin"]);
    expect(parseClosedGroups("admin.nope.__proto__.tools.admin")).toEqual(["tools", "admin"]);
    expect(navGroupsCookie(["admin", "tools"])).toBe(
      "ronne-nav-groups=tools.admin; path=/; max-age=31536000; samesite=lax",
    );
    expect(navGroupsCookie([])).toMatch(/^ronne-nav-groups=; path=\//);
    expect(navGroupsFrom("a=1; ronne-nav-groups=tools; ronne-sidebar=open")).toBe("tools");
    expect(navGroupsFrom("a=1")).toBeUndefined();
    expect(withGroup(["tools"], "admin", false)).toEqual(["tools", "admin"]);
    expect(withGroup(["tools", "admin"], "tools", true)).toEqual(["admin"]);
    expect(withGroup([], "tools", true)).toEqual([]);
  });
});

const mount = async (node: React.ReactNode) => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
};

const detailsOf = (host: HTMLElement, name: string) => {
  const found = [...host.querySelectorAll("details")].find(
    (d) => d.querySelector("summary")?.textContent?.trim() === name,
  );
  if (!found) throw new Error(name);
  return found;
};

/** A click on the group's heading. */
const toggle = async (details: HTMLDetailsElement) => {
  await act(async () => details.querySelector("summary")?.click());
};

const sidebar = (closedGroups: ("discover" | "governance" | "tools" | "admin")[] = []) => (
  <Sidebar
    user={ROOT}
    items={navFor(ROOT, { "/reviews": 2 })}
    counts={{ "/reviews": 2 }}
    workspaces={[]}
    propose={false}
    closedGroups={closedGroups}
    appearance={<span />}
  />
);

describe("opening and closing a group (166)", () => {
  it("writes the cookie from the sidebar, and the dot follows", async () => {
    const host = await mount(sidebar());
    const governance = detailsOf(host, "Governance & reviews");
    expect(governance.querySelector("summary")?.getAttribute("aria-label")).toBeNull();
    await toggle(governance);
    expect(navGroupsFrom(document.cookie)).toBe("governance");
    expect(governance.open).toBe(false);
    // Closed with Reviews waiting: the dot, and its name says so.
    expect(governance.querySelector("summary")?.getAttribute("aria-label")).toBe(
      "Governance & reviews (something waiting)",
    );
    await toggle(detailsOf(host, "Admin"));
    expect(navGroupsFrom(document.cookie)).toBe("governance.admin");
    await toggle(governance);
    expect(navGroupsFrom(document.cookie)).toBe("admin");
    expect(governance.querySelector("summary")?.getAttribute("aria-label")).toBeNull();
  });

  it("shows one state in the sidebar and the Menu, both on the page from the start", async () => {
    // As in the app: the Menu's list is mounted with the page, inside its closed sheet.
    const side = await mount(sidebar());
    const menu = await mount(
      <MenuList user={ROOT} items={navFor(ROOT)} closedGroups={[]} appearance={<span />} />,
    );
    await toggle(detailsOf(side, "Tools"));
    expect(detailsOf(menu, "Tools").open).toBe(false);
    await toggle(detailsOf(menu, "Admin"));
    expect(detailsOf(side, "Admin").open).toBe(false);
    expect(navGroupsFrom(document.cookie)).toBe("tools.admin");
    await toggle(detailsOf(menu, "Tools"));
    expect(detailsOf(side, "Tools").open).toBe(true);
    expect(navGroupsFrom(document.cookie)).toBe("admin");
  });

  it("keeps a choice another tab made: it writes over what the cookie says now", async () => {
    const side = await mount(sidebar());
    // Another tab closed Discover after this page was drawn.
    // biome-ignore lint/suspicious/noDocumentCookie: the other tab, in the test's own browser.
    document.cookie = navGroupsCookie(["discover"]);
    await toggle(detailsOf(side, "Tools"));
    expect(navGroupsFrom(document.cookie)).toBe("discover.tools");
    expect(detailsOf(side, "Discover").open).toBe(false);
  });

  it("closes a group another tab closed already when its heading is clicked here", async () => {
    const side = await mount(sidebar());
    // biome-ignore lint/suspicious/noDocumentCookie: the other tab, in the test's own browser.
    document.cookie = navGroupsCookie(["tools"]);
    // This page still shows Tools open; the click asks to close it, which the cookie says already.
    expect(detailsOf(side, "Tools").open).toBe(true);
    await toggle(detailsOf(side, "Tools"));
    expect(detailsOf(side, "Tools").open).toBe(false);
    expect(navGroupsFrom(document.cookie)).toBe("tools");
    await toggle(detailsOf(side, "Tools"));
    expect(detailsOf(side, "Tools").open).toBe(true);
    expect(navGroupsFrom(document.cookie)).toBe("");
  });

  it("writes nothing while the sidebar is folded, when every group is open", async () => {
    const host = await mount(
      <Sidebar
        user={ROOT}
        items={navFor(ROOT)}
        workspaces={[]}
        propose={false}
        folded
        closedGroups={["admin"]}
        appearance={<span />}
      />,
    );
    const admin = detailsOf(host, "Admin");
    expect(admin.open).toBe(true);
    // A browser can't reach the heading then (no pointer, not in the tab order); were it clicked,
    // nothing is written. (happy-dom flips the element even when the click is cancelled.)
    await toggle(admin);
    expect(navGroupsFrom(document.cookie) ?? "").toBe("");
  });
});
