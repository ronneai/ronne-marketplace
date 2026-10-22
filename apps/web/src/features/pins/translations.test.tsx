import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({
  loadShelfAction: vi.fn(),
  moveInShelfAction: vi.fn(),
  pinToShelfAction: vi.fn(),
  unpinFromShelfAction: vi.fn(),
}));
vi.mock("@/features/favorites/actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { PinMenu } = await import("./PinMenu");
const { ShelfList } = await import("./ManageShelf");
const { FavoritesShelf, PinnedShelf } = await import("./ShelfSections");
const { FavoriteButton } = await import("@/features/favorites/FavoriteButton");

/** The pins and favorites screens in Portuguese and French: no English message left standing. */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const entry: CatalogueEntry = {
  id: "I1",
  workspace: "acme",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "team",
  name: "fmt",
  type: "skill",
  version: "1.0.0",
  description: "Formats files.",
  keywords: [],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount: 1,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
};

/** What the Home page passes as the shelf's title: Start here, in the person's language. */
const START = { pt: "Comece por aqui", fr: "Commencez ici" } as const;

describe("no English left behind (125)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts of the shelves appears`, async () => {
      const html = [
        view(
          locale,
          <PinMenu
            itemId="I1"
            name="@acme/team/fmt"
            targets={[
              { key: "instance", workspace: null, pinned: true, blocked: null },
              { key: "W1", workspace: "acme", pinned: false, blocked: null },
              { key: "instance2", workspace: null, pinned: false, blocked: "private" },
            ]}
          />,
        ),
        view(
          locale,
          <ShelfList
            state={{
              ok: true,
              max: 12,
              entries: [
                { itemId: "A", name: "@a/one", position: 1, availability: "available" },
                { itemId: "B", name: "@a/two", position: 2, availability: "unavailable" },
              ],
            }}
            pending={false}
            onMove={() => {}}
            onRemove={() => {}}
          />,
        ),
        view(
          locale,
          <ShelfList
            state={{ ok: true, max: 12, entries: [] }}
            pending={false}
            onMove={() => {}}
            onRemove={() => {}}
          />,
        ),
        view(locale, <FavoritesShelf entries={[entry]} starred={["I1"]} />),
        view(
          locale,
          <PinnedShelf
            id="s"
            title={START[locale]}
            entries={[entry]}
            starred={[]}
            manage={{ key: "instance", label: START[locale] }}
          />,
        ),
        view(locale, <FavoriteButton itemId="I1" name="@acme/team/fmt" favorited={false} />),
        view(locale, <FavoriteButton itemId="I1" name="@acme/team/fmt" favorited />),
      ].join("\\n");
      expect(await englishLeaks(["shelves", "catalogue"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["shelves"], locale, html)).toBeGreaterThan(8);
    });
  }
});
