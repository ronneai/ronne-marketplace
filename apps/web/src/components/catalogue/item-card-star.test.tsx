import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";

vi.mock("@/features/favorites/actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
const { ItemCard } = await import("./ItemCard");

const entry: CatalogueEntry = {
  id: "ITEM1",
  workspace: "global",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "team",
  name: "base",
  type: "skill",
  version: "1.0.0",
  description: "The base.",
  keywords: [],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount: 1,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
};

describe("the star on an item card (125)", () => {
  it("is there when the page says whether it is a favorite, in both states", () => {
    const off = renderToStaticMarkup(<ItemCard entry={entry} favorited={false} />);
    expect(off).toContain('aria-label="Add @team/base to favorites"');
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('value="ITEM1"');
    const on = renderToStaticMarkup(<ItemCard entry={entry} favorited />);
    expect(on).toContain('aria-label="Remove @team/base from favorites"');
    expect(on).toContain('aria-pressed="true"');
  });

  it("is not on a card whose page does not know (a card in a list that shows no stars)", () => {
    expect(renderToStaticMarkup(<ItemCard entry={entry} />)).not.toContain("favorites");
  });
});
