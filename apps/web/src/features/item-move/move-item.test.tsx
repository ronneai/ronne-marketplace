import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { ItemMoveImpact } from "@/server/domains/workspaces/models/item-move";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import type { ItemMoveActionState } from "./types";

vi.mock("./actions", () => ({
  askItemMoveFromForm: vi.fn(),
  cancelItemMoveFromForm: vi.fn(),
  itemMoveImpactFor: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { MoveItemForm, MoveItemNotice, MoveItemButton } = await import("./MoveItem");

// The Move dialog on the item page (134, task 6): which scope, what changes, the button that says
// what will happen, the confirmation, and the request's notice.
const impact = (overrides: Partial<ItemMoveImpact> = {}): ItemMoveImpact => ({
  item: {
    id: "i1",
    name: "deploy",
    fullName: "@acme/infra/deploy",
    scopeId: "s1",
    workspaceId: "w1",
  },
  target: { id: "s2", name: "devops" },
  newName: "@acme/devops/deploy",
  clash: null,
  proposals: 0,
  dependents: [],
  dependentsHidden: 0,
  way: "now",
  refused: false,
  ...overrides,
});

const targets = [
  { id: "s2", name: "devops", description: "Devops." },
  { id: "s3", name: "kit", description: "Kit." },
];

const form = (
  way: "now" | "request",
  extra: {
    to?: string;
    checked?: ItemMoveImpact | { error: string };
    step?: "form" | "confirm";
    state?: ItemMoveActionState;
  } = {},
  locale: Locale = "en",
) =>
  inLocale(locale, () =>
    renderToStaticMarkup(
      <MoveItemForm
        item={{ id: "i1", fullName: "@acme/infra/deploy" }}
        view={{ workspace: "acme", way, targets }}
        onDone={() => {}}
        loaded={{
          to: extra.to ?? "s2",
          impact: extra.checked,
          step: extra.step,
          state: extra.state,
        }}
      />,
    ),
  );

const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

describe("the Move dialog (134)", () => {
  it("says what the chosen scope is for, under the select", () => {
    expect(form("now", { to: "s2" })).toContain(">Devops.</p>");
    expect(form("now", { to: "" })).not.toContain("Devops.");
  });

  it("offers the workspace's other scopes, with its helper", () => {
    const html = form("now", { to: "" });
    expect(html).toContain("Pick a scope");
    expect(html).toContain(">devops</option>");
    expect(html).toContain(">kit</option>");
    expect(html).toContain("Who has to agree?");
    expect(html).toContain("/marketplace/docs/scopes#moving-items");
  });

  it("moves at once for a moderator: the new name, what it keeps, Move item", () => {
    const html = form("now", {
      checked: impact({ proposals: 2, dependents: ["@acme/devops/app"], dependentsHidden: 1 }),
    });
    expect(html).toContain("What it changes");
    expect(html).toContain("@acme/infra/deploy</span> → <span");
    expect(html).toContain("@acme/devops/deploy");
    expect(html).toContain("The old name keeps working");
    expect(html).toContain("Its 2 open drafts and proposals take the new name.");
    expect(html).toContain("@acme/devops/app");
    expect(html).toContain("and 1 draft you can’t see");
    expect(html).toContain(">Move item<");
    // No message for a move made at once.
    expect(html).not.toContain("Message (optional)");
  });

  it("asks for anyone else: a message, who answers, Ask to move", () => {
    const html = form("request", { checked: impact({ way: "request" }) });
    expect(html).toContain("Message (optional)");
    expect(html).toContain("acme’s moderators, admins or root will answer.");
    expect(html).toContain(">Ask to move<");
    expect(html).not.toContain(">Move item<");
  });

  it("says why the name is taken, and keeps the button off", () => {
    for (const [clash, words] of [
      ["item", "@acme/devops already has an item called deploy."],
      ["submission", "An item called deploy is waiting for review in @acme/devops."],
      ["alias", "@acme/devops/deploy is another item’s old name."],
    ] as const) {
      const html = form("now", { checked: impact({ clash, refused: true }) });
      expect(html, clash).toContain("It can’t move there");
      expect(html, clash).toContain(words);
      expect(html, clash).toContain("Pick another scope.");
      expect(html, clash).toContain("The name is taken there.");
    }
  });

  it("waits for the checks, and for a scope, before its button", () => {
    expect(form("now", { to: "" })).toContain("Pick a scope first.");
    expect(form("now", { checked: undefined })).toContain("Checking what it changes…");
    // The checks of another scope don't count for this one.
    expect(form("now", { to: "s3", checked: impact() })).toContain("Checking what it changes…");
    expect(form("now", { checked: { error: "load_failed" } })).toContain(
      "What it changes couldn’t be read. Try again.",
    );
  });

  it("asks once more before a move made at once", () => {
    const html = form("now", { checked: impact(), step: "confirm" });
    expect(html).toContain("Move <span");
    expect(html).toContain(">@acme/devops</span>, as <span");
    expect(html).toContain(">Back<");
    expect(html).toContain('type="submit"');
  });

  it("says what happened", () => {
    expect(form("now", { state: { done: "moved", newName: "@acme/devops/deploy" } })).toContain(
      "Moved. It’s @acme/devops/deploy now.",
    );
    expect(
      form("request", { state: { done: "requested", newName: "@acme/devops/deploy" } }),
    ).toContain("Asked to move it to @acme/devops.");
    // A clash found when it was sent: the dialog shows why, from the answer.
    expect(
      form("now", {
        checked: impact(),
        state: { refused: impact({ clash: "item", refused: true }) },
      }),
    ).toContain("It can’t move there");
  });

  it("opens from Move to another scope…", () => {
    const html = view(
      "en",
      <MoveItemButton
        item={{ id: "i1", fullName: "@acme/infra/deploy" }}
        view={{ workspace: "acme", way: "now", targets }}
      />,
    );
    expect(html).toContain("Move to another scope…");
  });
});

describe("the request's notice on the item page (134)", () => {
  const latest = {
    id: "m1",
    status: "open" as const,
    to: "@acme/devops",
    reason: null,
    askedByName: "Ana",
    mine: false,
  };

  it("an open request: who asked, and Cancel", () => {
    const html = view("en", <MoveItemNotice latest={latest} />);
    expect(html).toContain("Moving to @acme/devops, asked by Ana");
    expect(html).toContain('aria-label="Cancel the move to @acme/devops"');
    expect(view("en", <MoveItemNotice latest={{ ...latest, mine: true }} />)).toContain(
      "Moving to @acme/devops: waiting for an answer",
    );
    expect(view("en", <MoveItemNotice latest={{ ...latest, askedByName: null }} />)).toContain(
      "asked by a former user",
    );
    expect(view("en", <MoveItemNotice latest={latest} loaded={{ done: true }} />)).toContain(
      "Move cancelled.",
    );
  });

  it("a declined one: the reason, no Cancel", () => {
    const html = view(
      "en",
      <MoveItemNotice
        latest={{ ...latest, status: "declined", reason: "Keep it in infra.", mine: true }}
      />,
    );
    expect(html).toContain("Move to @acme/devops declined");
    expect(html).toContain("“Keep it in infra.”");
    expect(html).not.toContain("Cancel");
  });
});

describe("the Move dialog in three languages (134)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every text is the language's own`, async () => {
      const html = [
        form("now", { to: "" }, locale),
        form(
          "now",
          {
            checked: impact({
              proposals: 1,
              dependents: ["@acme/devops/app"],
              dependentsHidden: 2,
            }),
          },
          locale,
        ),
        form(
          "request",
          { checked: impact({ clash: "item", refused: true, way: "request" }) },
          locale,
        ),
        form("now", { checked: impact(), step: "confirm" }, locale),
        form("now", { state: { done: "moved", newName: "@acme/devops/deploy" } }, locale),
        view(
          locale,
          <MoveItemNotice
            latest={{
              id: "m1",
              status: "open",
              to: "@acme/devops",
              reason: null,
              askedByName: "Ana",
              mine: false,
            }}
          />,
        ),
        view(
          locale,
          <MoveItemNotice
            latest={{
              id: "m1",
              status: "declined",
              to: "@acme/devops",
              reason: "No.",
              askedByName: "Ana",
              mine: true,
            }}
          />,
        ),
        view(
          locale,
          <MoveItemButton
            item={{ id: "i1", fullName: "@acme/infra/deploy" }}
            view={{ workspace: "acme", way: "now", targets }}
          />,
        ),
      ].join("\n");
      expect(await englishLeaks(["item", "help"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["item"], locale, html)).toBeGreaterThan(10);
    });
  }

  it("pt and fr read as they should", () => {
    expect(form("request", { checked: impact({ way: "request" }) }, "pt")).toContain(
      ">Pedir para mover<",
    );
    expect(form("now", { checked: impact() }, "fr")).toContain(">Déplacer l’élément<");
    expect(form("now", { checked: impact() }, "fr")).toContain("Son nom là-bas : ");
  });
});
