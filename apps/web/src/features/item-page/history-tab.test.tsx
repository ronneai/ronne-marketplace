import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { ItemHistoryEntry } from "@/server/domains/workspaces/services/item-moves";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { HistoryTab } from "./HistoryTab";

// The item page's History tab (134, task 8).
const entry = (extra: Partial<ItemHistoryEntry> = {}): ItemHistoryEntry => ({
  id: "h1",
  at: new Date("2026-10-27T10:00:00Z"),
  reason: "move_item",
  from: "@acme/infra/deploy",
  to: "@acme/devops/deploy",
  askedBy: "Ana",
  approvedBy: "Mo",
  direct: false,
  ...extra,
});

const ENTRIES = [
  entry({
    id: "h3",
    reason: "rename_workspace",
    from: "@acme/devops/deploy",
    to: "@acme2/devops/deploy",
    askedBy: "Root",
    approvedBy: "Root",
    direct: true,
  }),
  entry(),
  entry({
    id: "h2",
    reason: "move_scope",
    from: null,
    to: "@acme/infra/deploy",
    askedBy: "Root",
    approvedBy: "Root",
    direct: true,
  }),
  entry({ id: "h1", reason: "migration", from: null, to: null, askedBy: null, approvedBy: null }),
];

const view = (locale: Locale, entries: ItemHistoryEntry[] = ENTRIES) =>
  inLocale(locale, () =>
    renderToStaticMarkup(<HistoryTab history={{ current: "@acme2/devops/deploy", entries }} />),
  );

describe("the History tab (134)", () => {
  it("says the name now, then each change with why, the names, when and who", () => {
    const html = view("en");
    for (const text of [
      "Its name now: <span",
      "@acme2/devops/deploy",
      "Its workspace was renamed",
      "Moved to another scope",
      "Its scope moved to another workspace",
      "The workspace was added to item names",
      ">@acme/infra/deploy</span> → <span",
      "by Root",
      "asked by Ana, approved by Mo",
      "Why did the name change?",
      "/marketplace/docs/items#history",
    ])
      expect(html, text).toContain(text);
    // Newest first, as given.
    expect(html.indexOf("Its workspace was renamed")).toBeLessThan(
      html.indexOf("Moved to another scope"),
    );
  });

  it("says a name is in a workspace the reader can't see, never what it is", () => {
    const html = view("en", [ENTRIES[2] as ItemHistoryEntry]);
    expect(html).toContain("a name in a workspace you can’t see");
    expect(html).toContain("@acme/infra/deploy");
  });

  it("names nobody when nobody is known, and a former user when the person is gone", () => {
    expect(view("en", [ENTRIES[3] as ItemHistoryEntry])).not.toContain(" · ");
    expect(view("en", [entry({ direct: true, askedBy: null })])).toContain("by a former user");
    expect(view("en", [entry({ approvedBy: null })])).toContain("asked by Ana");
  });

  it("says when there's nothing", () => {
    expect(view("en", [])).toContain("It has had this name since it was first released.");
  });

  for (const locale of ["pt", "fr"] as const)
    it(`${locale}: every text is the language's own`, async () => {
      const html = [view(locale), view(locale, [])].join("\n");
      expect(await englishLeaks(["item", "help"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["item"], locale, html)).toBeGreaterThan(1);
    });
});
