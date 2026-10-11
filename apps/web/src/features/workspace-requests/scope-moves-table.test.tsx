import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScopeMoveAnsweredError,
  ScopeMoveRefusedError,
} from "@/server/domains/workspaces/exceptions/errors";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import type { MoveRequestRow } from "@/server/domains/workspaces/services/scope-moves";

// Answering scope moves (115, task 6): the actions behind Approve and Decline, and the table.
const workspaces = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  declineAccessRequest: vi.fn(),
  approveScopeMove: vi.fn(),
  declineScopeMove: vi.fn(),
  askScopeMove: vi.fn(),
  cancelScopeMove: vi.fn(),
  moveImpact: vi.fn(),
  moveTargets: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { ScopeMovesTable, ApproveMoveForm } = await import("./ScopeMovesTable");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const impact = (overrides: Partial<MoveImpact> = {}): MoveImpact => ({
  scope: { id: "s1", name: "infra", workspace: "beta" },
  target: { id: "w2", name: "acme", visibility: "public", global: false, personal: false },
  name: "infra",
  nameProblem: null,
  clash: false,
  items: [],
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

const move = (extra: Partial<MoveRequestRow> = {}): MoveRequestRow => ({
  id: "m1",
  scope: "@beta/infra",
  newName: "@acme/infra",
  renamed: false,
  from: "beta",
  to: "acme",
  items: 12,
  askedBy: { email: "dave@example.com", name: "Dave" },
  createdAt: new Date("2026-10-10T10:00:00Z"),
  message: "Acme runs it now.",
  notReviewed: [],
  impact: impact(),
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("scope move answers (115)", () => {
  it("approves and refreshes everything; or lists what refuses it now; or says why not", async () => {
    workspaces.approveScopeMove.mockResolvedValueOnce({ outcome: "moved" });
    expect(
      await actions.approveMoveFromForm({}, form({ moveId: "m1", workspace: "acme" })),
    ).toEqual({
      done: "Moved to acme.",
    });
    expect(workspaces.approveScopeMove).toHaveBeenCalledWith(expect.any(Headers), { moveId: "m1" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    const refused = impact({ clash: true, refused: true });
    workspaces.approveScopeMove.mockRejectedValueOnce(new ScopeMoveRefusedError(refused));
    expect(await actions.approveMoveFromForm({}, form({ moveId: "m1" }))).toEqual({ refused });
    workspaces.approveScopeMove.mockRejectedValueOnce(new ScopeMoveAnsweredError());
    expect(await actions.approveMoveFromForm({}, form({ moveId: "m1" }))).toEqual({
      error: "Already answered.",
    });
  });

  it("declines with the reason", async () => {
    expect(
      await actions.declineMoveFromForm(
        {},
        form({ moveId: "m1", workspace: "acme", reason: "Not ours." }),
      ),
    ).toEqual({ done: "Declined." });
    expect(workspaces.declineScopeMove).toHaveBeenCalledWith(expect.any(Headers), {
      moveId: "m1",
      reason: "Not ours.",
    });
  });
});

describe("the Scope moves table (115)", () => {
  it("shows the scope and its items, from and to, its name there, who asked, the message, and the answers", () => {
    const html = renderToStaticMarkup(
      <ScopeMovesTable
        moves={[move({ renamed: true, newName: "@acme/infra-tools" })]}
        showTarget
      />,
    );
    for (const text of [
      "@beta/infra",
      "12 items",
      ">beta<",
      ">acme<",
      "@acme/infra-tools",
      "Renamed",
      "Dave",
      "dave@example.com",
      "Acme runs it now.",
      'aria-label="Approve moving @beta/infra to acme"',
      'aria-label="Decline moving @beta/infra to acme"',
    ])
      expect(html, text).toContain(text);
    expect(html).toContain("What does approving do?");
    expect(html).toContain("/marketplace/docs/workspaces#moving");
    // A workspace's own tab has no target column.
    expect(renderToStaticMarkup(<ScopeMovesTable moves={[move()]} />)).not.toContain(">To<");
  });

  it("marks not-reviewed versions and what would refuse it now", () => {
    const html = renderToStaticMarkup(
      <ScopeMovesTable
        moves={[
          move({
            notReviewed: ["@ana/tools/lint@1.0.0"],
            impact: impact({ outsideDependents: ["@x/y"], outsideHidden: 1, refused: true }),
          }),
        ]}
      />,
    );
    expect(html).toContain("Not reviewed: @ana/tools/lint@1.0.0. Approving reviews them.");
    expect(html).toContain("2 things refuse it now");
  });

  it("says when nothing waits, and shows a refusal from Approve with its list", () => {
    expect(renderToStaticMarkup(<ScopeMovesTable moves={[]} />)).toContain("No moves waiting.");
    const refused = renderToStaticMarkup(
      <ApproveMoveForm
        move={move()}
        loaded={{ refused: impact({ outsideDependents: ["@acme/team/app"], refused: true }) }}
      />,
    );
    expect(refused).toContain("This move would break something");
    expect(refused).toContain("@acme/team/app");
    expect(
      renderToStaticMarkup(
        <ApproveMoveForm move={move()} loaded={{ error: "Already answered." }} />,
      ),
    ).toContain("Already answered.");
  });
});
