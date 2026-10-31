import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { ItemMoveImpact } from "@/server/domains/workspaces/models/item-move";
import type { ItemMoveRequestRow } from "@/server/domains/workspaces/services/item-moves";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({
  approveItemMoveFromForm: vi.fn(),
  declineItemMoveFromForm: vi.fn(),
}));
vi.mock("@/features/item-move/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { ItemMovesTable, ApproveItemMoveForm, DeclineItemMoveForm } = await import(
  "./ItemMovesTable"
);

// The Item moves table on the Requests pages (134, task 7).
const row = (extra: Partial<ItemMoveRequestRow> = {}): ItemMoveRequestRow => ({
  id: "m1",
  item: "@acme/infra/deploy",
  type: "skill",
  newName: "@acme/devops/deploy",
  from: "@acme/infra",
  to: "@acme/devops",
  workspace: "acme",
  askedBy: { email: "ana@example.com", name: "Ana" },
  createdAt: new Date("2026-10-27T10:00:00Z"),
  message: "It belongs with devops.",
  refusal: null,
  ...extra,
});

const impact: ItemMoveImpact = {
  item: {
    id: "i1",
    name: "deploy",
    fullName: "@acme/infra/deploy",
    scopeId: "s1",
    workspaceId: "w1",
  },
  target: { id: "s2", name: "devops" },
  newName: "@acme/devops/deploy",
  clash: "item",
  proposals: 0,
  dependents: [],
  dependentsHidden: 0,
  way: "request",
  refused: true,
};

const view = (locale: Locale, node: React.ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

describe("the Item moves table (134)", () => {
  it("lists the item, from and to, its name there, who asked, the message, and the answers", () => {
    const html = view("en", <ItemMovesTable moves={[row()]} />);
    for (const text of [
      ">Item<",
      ">From<",
      ">To<",
      ">Its name there<",
      "@acme/infra/deploy",
      "@acme/infra",
      "@acme/devops",
      "@acme/devops/deploy",
      ">Ana<",
      "ana@example.com",
      "It belongs with devops.",
      'aria-label="Approve moving @acme/infra/deploy to @acme/devops"',
      'aria-label="Decline moving @acme/infra/deploy to @acme/devops"',
      "What does approving do?",
      "/marketplace/docs/scopes#moving-items",
    ])
      expect(html, text).toContain(text);
  });

  it("says on the row what would refuse it now", () => {
    expect(view("en", <ItemMovesTable moves={[row({ refusal: "item" })]} />)).toContain(
      "The scope has an item with that name now: Approve can’t move it.",
    );
    expect(view("en", <ItemMovesTable moves={[row({ refusal: "moved" })]} />)).toContain(
      "The scope is in another workspace now: Approve cancels the request.",
    );
  });

  it("says when nothing waits, and what Approve answered", () => {
    expect(view("en", <ItemMovesTable moves={[]} />)).toContain("No item moves waiting.");
    expect(
      view(
        "en",
        <ApproveItemMoveForm
          move={row()}
          loaded={{ done: "Moved: it’s @acme/devops/deploy now." }}
        />,
      ),
    ).toContain("Moved: it’s @acme/devops/deploy now.");
    expect(view("en", <ApproveItemMoveForm move={row()} loaded={{ refused: impact }} />)).toContain(
      "@acme/devops already has an item called deploy.",
    );
  });

  it("says why Approve did nothing: answered already, or another refusal", () => {
    const html = view(
      "en",
      <ApproveItemMoveForm move={row()} loaded={{ error: "Already answered." }} />,
    );
    // A button in a row has no form to put the error next to: it is a toast (138, done-toasts.test).
    expect(html).not.toContain("Already answered.");
    expect(html).toContain(">Approve<");
  });

  it("declines with an optional reason its asker sees", () => {
    const html = view("en", <DeclineItemMoveForm move={row()} onDone={() => {}} />);
    expect(html).toContain("Decline moving <span");
    expect(html).toContain(">@acme/infra/deploy</span> to <span");
    expect(html).toContain("Reason (optional)");
    expect(html).toContain('maxLength="500"');
    expect(html).toContain("Ana sees it on the item’s page. 0/500");
    expect(html).toContain(">Decline<");
    expect(html).toContain('name="workspace" value="acme"');
  });

  for (const locale of ["pt", "fr"] as const)
    it(`${locale}: every text is the language's own`, async () => {
      const html = [
        view(
          locale,
          <ItemMovesTable moves={[row(), row({ id: "m2", refusal: "moved", message: null })]} />,
        ),
        view(locale, <ItemMovesTable moves={[]} />),
        view(locale, <ApproveItemMoveForm move={row()} loaded={{ refused: impact }} />),
        view(locale, <DeclineItemMoveForm move={row()} onDone={() => {}} />),
      ].join("\n");
      expect(await englishLeaks(["workspaces", "help"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["workspaces"], locale, html)).toBeGreaterThan(8);
    });

  it("pt and fr read as they should", () => {
    expect(view("pt", <ItemMovesTable moves={[row()]} />)).toContain(">Aprovar<");
    expect(view("fr", <ItemMovesTable moves={[row()]} />)).toContain(">Élément<");
  });
});
