import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import type { MoveImpactResult } from "./types";

vi.mock("./actions", () => ({
  askMoveFromForm: vi.fn(),
  cancelMoveFromForm: vi.fn(),
  moveImpactFor: vi.fn(),
  moveTargetsFor: vi.fn(),
}));

const { MoveForm, MoveChanges, MoveState, targetLabel } = await import("./MoveScope");

// The Move dialog (115, task 5): where to, the name there, what changes, and the button that
// says what will happen.
const impact = (overrides: Partial<MoveImpact> = {}): MoveImpact => ({
  scope: { id: "s1", name: "infra", workspace: "beta" },
  target: { id: "w2", name: "acme", visibility: "public", global: false, personal: false },
  name: "infra",
  nameProblem: null,
  clash: false,
  items: [{ from: "@beta/infra/deploy", to: "@acme/infra/deploy" }],
  aliasTaken: [],
  aliasHidden: 0,
  outsideDependents: [],
  outsideHidden: 0,
  ownDependencies: [],
  ownHidden: 0,
  openDependents: [],
  openHidden: 0,
  notMembers: [],
  notMembersHidden: 0,
  notReviewed: [],
  fewerSee: false,
  refused: false,
  ...overrides,
});

const targets = {
  targets: [
    { name: "ana", visibility: "private" as const, global: false, personal: true },
    { name: "global", visibility: "public" as const, global: true, personal: false },
    { name: "acme", visibility: "public" as const, global: false, personal: false },
  ],
};

const form = (
  checked: MoveImpactResult | undefined,
  extra: {
    to?: string;
    step?: "form" | "confirm" | "type";
    state?: import("./types").MoveActionState;
    name?: string;
  } = {},
) =>
  renderToStaticMarkup(
    <MoveForm
      scope={{ id: "s1", name: "infra" }}
      workspace="beta"
      onDone={() => {}}
      loaded={{
        targets,
        impact: checked,
        to: extra.to ?? "acme",
        step: extra.step,
        state: extra.state,
        name: extra.name,
      }}
    />,
  );

describe("the Move dialog (115)", () => {
  it("offers the workspaces, the asker's own personal one as Personal", () => {
    const html = form(undefined, { to: "" });
    expect(html).toContain(">Personal (ana)</option>");
    expect(html).toContain(">global</option>");
    expect(html).toContain("Pick a workspace");
    expect(targetLabel(targets.targets[2] as never)).toBe("acme");
  });

  it("says Move scope when it moves at once, and shows the new names and who sees them", () => {
    const html = form({ ...impact(), way: "once", answeredBy: null });
    expect(html).toContain(">Move scope<");
    expect(html).not.toContain("Ask to move");
    expect(html).toContain("@beta/infra/deploy → @acme/infra/deploy");
    expect(html).toContain("Everyone on this instance");
    expect(html).toContain("acme&#x27;s moderators and admins");
    // No message for a move made at once.
    expect(html).not.toContain("Message (optional)");
  });

  it("says Ask to move for a request, with a message and who answers", () => {
    const admins = form({ ...impact(), way: "request", answeredBy: "admins" });
    expect(admins).toContain(">Ask to move<");
    expect(admins).toContain("Message (optional)");
    expect(admins).toContain("acme&#x27;s admins or root will answer.");
    const root = form(
      {
        ...impact({ target: { ...impact().target, name: "global", global: true } }),
        way: "request",
        answeredBy: "root",
      },
      { to: "global" },
    );
    expect(root).toContain("Root will answer.");
  });

  it("asks for another name on a clash, and keeps the button off", () => {
    const html = form({ ...impact({ clash: true, refused: true }), way: "once", answeredBy: null });
    expect(html).toContain(
      "acme already has a scope called infra: pick another name for it there.",
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Move scope/);
  });

  it("lists what refuses it, counting what the asker can't see", () => {
    const html = form({
      ...impact({
        outsideDependents: ["@acme/team/app"],
        outsideHidden: 2,
        ownDependencies: [{ item: "@beta/infra/kit", dependency: "@vault/secret/lib" }],
        ownHidden: 1,
        aliasTaken: ["@acme/infra/deploy"],
        refused: true,
      }),
      way: "once",
      answeredBy: null,
    });
    for (const text of [
      "This move would break something",
      "@acme/team/app",
      "and 2 more you can&#x27;t see",
      "@beta/infra/kit → @vault/secret/lib",
      "and 1 more you can&#x27;t see",
      "other items&#x27; old names",
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Move scope/);
  });

  it("names stranded work, open dependents, not-reviewed versions and who loses sight", () => {
    const html = renderToStaticMarkup(
      <MoveChanges
        impact={impact({
          target: {
            id: "w3",
            name: "vault",
            visibility: "private",
            global: false,
            personal: false,
          },
          notMembers: [{ item: "@beta/infra/wip", author: "bob@example.com" }],
          notMembersHidden: 1,
          openDependents: ["@team/app"],
          notReviewed: ["@ana/tools/lint@1.0.0"],
          fewerSee: true,
        })}
      />,
    );
    for (const text of [
      "Only vault&#x27;s members and root",
      "Installs by people who can no longer see them stop updating.",
      "@beta/infra/wip (bob@example.com)",
      "@team/app",
      "@ana/tools/lint@1.0.0",
      "someone else has to approve the move",
    ])
      expect(html, text).toContain(text);
  });

  it("confirms a move made at once, and has root type the scope's name", () => {
    const once = form({ ...impact(), way: "once", answeredBy: null }, { step: "confirm" });
    expect(once).toContain("Move @infra and its 1 item to acme, as @acme/infra?");
    expect(once).toMatch(/<button[^>]*type="submit"[^>]*>[^<]*Move scope/);
    const twice = form({ ...impact(), way: "twice", answeredBy: null }, { step: "confirm" });
    expect(twice).toContain(">Continue<");
    const typed = form({ ...impact(), way: "twice", answeredBy: null }, { step: "type" });
    expect(typed).toContain("type the scope&#x27;s name");
    expect(typed).toContain('name="confirm"');
    expect(typed).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Move scope/);
    // Into global, it says everyone will see them.
    const intoGlobal = form(
      {
        ...impact({ target: { ...impact().target, name: "global", global: true } }),
        way: "twice",
        answeredBy: null,
      },
      { to: "global", step: "confirm" },
    );
    expect(intoGlobal).toContain("as @infra?");
    expect(intoGlobal).toContain("Everyone will see them");
  });

  it("shows a row's open move with Cancel, and a declined one with its reason", () => {
    const open = renderToStaticMarkup(
      <MoveState
        move={{ id: "m1", toWorkspace: "acme", status: "open", reason: null }}
        workspace="beta"
      />,
    );
    expect(open).toContain("Moving to acme");
    expect(open).toContain(">Cancel<");
    const declined = renderToStaticMarkup(
      <MoveState
        move={{ id: "m1", toWorkspace: "acme", status: "declined", reason: "Not ours." }}
        workspace="beta"
      />,
    );
    expect(declined).toContain("Move to acme declined");
    expect(declined).toContain("Not ours.");
    expect(declined).not.toContain(">Cancel<");
  });

  it("says it renamed the scope when it did, and shows a name problem as typed", () => {
    const renamed = form(
      { ...impact({ name: "infra-tools" }), way: "once", answeredBy: null },
      { step: "confirm", name: "Infra-Tools" },
    );
    expect(renamed).toContain("Move @infra and its 1 item to acme, renamed to @acme/infra-tools?");
    const problem = form({
      ...impact({ nameProblem: "characters", refused: true }),
      way: "once",
      answeredBy: null,
    });
    expect(problem).toContain("Use only lowercase letters, digits and hyphens.");
  });

  it("says what happened after submit: moved, asked, refused with the list, or the error", () => {
    expect(form(undefined, { state: { done: "moved" } })).toContain("Moved @infra to acme.");
    expect(form(undefined, { state: { done: "requested" } })).toContain(
      "Asked to move @infra to acme.",
    );
    const refused = form(undefined, {
      state: { refused: impact({ outsideDependents: ["@acme/team/app"], refused: true }) },
    });
    expect(refused).toContain("This move would break something");
    expect(refused).toContain("@acme/team/app");
    expect(form(undefined, { state: { error: "Already answered." } })).toContain(
      "Already answered.",
    );
  });

  it("says nobody reviews in a personal workspace", () => {
    const html = renderToStaticMarkup(
      <MoveChanges
        impact={impact({
          target: { id: "w9", name: "ana", visibility: "private", global: false, personal: true },
        })}
      />,
    );
    expect(html).toContain("nobody: personal workspaces aren&#x27;t reviewed.");
    expect(html).not.toContain("ana&#x27;s moderators");
    expect(html).toContain("Only you and root");
  });

  it("shows a cancelled move as Cancelled", () => {
    expect(
      renderToStaticMarkup(
        <MoveState
          move={{ id: "m1", toWorkspace: "acme", status: "open", reason: null }}
          workspace="beta"
          loaded={{ done: "Cancelled." }}
        />,
      ),
    ).toContain("Cancelled");
  });
});
