import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itemPageData } from "@/features/item-page/fixtures";
import type { ItemPage } from "@/server/domains/items/actions/versions";
import { ItemNotFoundError } from "@/server/domains/items/exceptions/errors";

const versions = vi.hoisted(() => ({ itemPage: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("./actions", () => ({ changeVersions: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { default: Page } = await import("@/app/(app)/items/[scope]/[name]/versions/page");

const pageData = (overrides: Partial<ItemPage> = {}) => itemPageData(overrides);

const render = async (scope = "team", name = "github") =>
  renderToStaticMarkup(await Page({ params: Promise.resolve({ scope, name }) }));

beforeEach(() => {
  vi.clearAllMocks();
  versions.itemPage.mockResolvedValue(pageData());
});

describe("the Versions page", () => {
  it("lists tags and versions with their publisher, size, sha256, deprecation and yank", async () => {
    const html = await render("%40team");
    expect(versions.itemPage).toHaveBeenCalledWith(
      expect.any(Headers),
      { scope: "team", name: "github" },
      undefined,
    );
    expect(html).toContain("@team/github");
    expect(html).toContain("latest → 1.1.0");
    expect(html).toContain("Rae Releaser");
    expect(html).toContain("2026-09-28 09:00 UTC");
    expect(html).toContain("2 KB");
    expect(html).toContain(`title="${"ab".repeat(32)}"`);
    expect(html).toContain(">deprecated<");
    expect(html).toContain("Use 1.1.0 or later.");
    expect(html).toContain(">yanked<");
    expect(html).toContain("Breaks on Windows.");
  });

  it("shows the actions to moderators and root only", async () => {
    expect(await render()).not.toContain(">Yank<");
    versions.itemPage.mockResolvedValue(pageData({ canManage: true }));
    const html = await render();
    expect(html).toContain(">Yank<");
    expect(html).toContain(">Unyank<");
    expect(html).toContain(">Deprecate<");
    expect(html).toContain(">Undeprecate<");
    expect(html).toContain(">Add a tag<");
    // latest can be moved but never removed.
    expect(html).toContain(">Move<");
    expect(html).not.toContain(">Remove<");
  });

  it("marks tags on a yanked version, and says when there's no latest", async () => {
    versions.itemPage.mockResolvedValue(pageData({ tags: [{ tag: "old", version: "1.0.0" }] }));
    const html = await render();
    expect(html).toMatch(/old → 1\.0\.0<\/span><span[^>]*>yanked</);
    expect(html).toContain("no installable stable version");
  });

  it("is a 404 for an unknown item", async () => {
    versions.itemPage.mockRejectedValue(new ItemNotFoundError("@team/github"));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("versionsPath", () => {
  it("builds the Versions page's URL, escaping each part", async () => {
    const { versionsPath } = await import("./links");
    expect(versionsPath({ scope: { name: "team" }, name: "github" })).toBe(
      "/items/team/github/versions",
    );
    expect(versionsPath({ scope: { name: "a b" }, name: "c/d" })).toBe(
      "/items/a%20b/c%2Fd/versions",
    );
  });
});
