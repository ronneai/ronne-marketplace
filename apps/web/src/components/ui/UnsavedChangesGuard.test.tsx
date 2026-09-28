import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const { leavingHref, UnsavedChangesGuard } = await import("./UnsavedChangesGuard");

const here = {
  href: "http://localhost:3000/submissions/01J0000000000000000000000A",
  origin: "http://localhost:3000",
  pathname: "/submissions/01J0000000000000000000000A",
  search: "",
};

/** A click on a link, as the guard sees it. */
const click = (
  href: string,
  options: Partial<{ button: number; metaKey: boolean; target: string; download: boolean }> = {},
) => {
  const link = {
    href: new URL(href, here.href).href,
    target: options.target ?? "",
    hasAttribute: (name: string) => name === "download" && Boolean(options.download),
  };
  return {
    defaultPrevented: false,
    button: options.button ?? 0,
    metaKey: options.metaKey ?? false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: {
      closest: (selector: string) => (selector === "a[href]" ? link : null),
    } as unknown as EventTarget,
  };
};

describe("leavingHref", () => {
  it("catches a plain click on a link to another page, in the app or outside it", () => {
    expect(leavingHref(click("/submissions"), here)).toBe("http://localhost:3000/submissions");
    expect(leavingHref(click("https://github.com/ronneai"), here)).toBe(
      "https://github.com/ronneai",
    );
  });

  it("lets new tabs, downloads, other buttons and links to this page through", () => {
    expect(leavingHref(click("/submissions", { metaKey: true }), here)).toBeNull();
    expect(leavingHref(click("/submissions", { button: 1 }), here)).toBeNull();
    expect(leavingHref(click("/submissions", { target: "_blank" }), here)).toBeNull();
    expect(leavingHref(click("/file.zip", { download: true }), here)).toBeNull();
    expect(leavingHref(click(`${here.pathname}#problems`), here)).toBeNull();
    const notALink = { ...click("/x"), target: { closest: () => null } as unknown as EventTarget };
    expect(leavingHref(notALink, here)).toBeNull();
  });
});

describe("UnsavedChangesGuard", () => {
  it("renders a closed dialog until someone tries to leave", () => {
    const html = renderToStaticMarkup(<UnsavedChangesGuard dirty />);
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]* open/);
    expect(html).toContain("Leave without saving");
  });
});
