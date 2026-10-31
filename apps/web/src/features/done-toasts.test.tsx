// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { dismissToasts } from "@/components/ui/toast";
import { inLocaleAsync } from "@/test/intl";

// What an action that only confirms says now (138): a toast, and the dialog it was in closes.
vi.mock("./item-move/actions", () => ({
  askItemMoveFromForm: vi.fn(),
  cancelItemMoveFromForm: vi.fn(),
  itemMoveImpactFor: vi.fn(),
}));
vi.mock("./admin-workspaces/actions", () => ({
  askMoveFromForm: vi.fn(),
  cancelMoveFromForm: vi.fn(),
  moveImpactFor: vi.fn(),
  moveTargetsFor: vi.fn(),
  createWorkspaceFromForm: vi.fn(),
  updateWorkspaceFromForm: vi.fn(),
  deleteWorkspaceFromForm: vi.fn(),
}));
vi.mock("./admin-users/actions", () => ({
  eraseUserFromForm: vi.fn(),
  userWorkspacesFor: vi.fn(),
}));
vi.mock("./workspace-requests/actions", () => ({
  approveItemMoveFromForm: vi.fn(),
  declineItemMoveFromForm: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { MoveItemForm } = await import("./item-move/MoveItem");
const { MoveForm } = await import("./admin-workspaces/MoveScope");
const { EraseUserForm } = await import("./admin-users/EraseUserDialog");
const { ApproveItemMoveForm } = await import("./workspace-requests/ItemMovesTable");

let root: Root;
let host: HTMLElement;
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-toast-kind]")];

const show = async (element: React.ReactNode) => {
  await act(async () =>
    root.render(
      <>
        <Toaster />
        {element}
      </>,
    ),
  );
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
};

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => dismissToasts());
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("done, said as a toast (138)", () => {
  it("moving an item: says where it went and closes the dialog with the new name", async () => {
    const onDone = vi.fn();
    await show(
      <MoveItemForm
        item={{ id: "i1", fullName: "@acme/infra/deploy" }}
        view={{
          workspace: "acme",
          way: "now",
          targets: [{ id: "s2", name: "devops", description: "Devops." }],
        }}
        onDone={onDone}
        loaded={{ to: "s2", state: { done: "moved", newName: "@acme/devops/deploy" } }}
      />,
    );
    expect(cards().map((c) => c.textContent)).toEqual(["OK:Moved. It’s @acme/devops/deploy now."]);
    expect(onDone).toHaveBeenCalledWith("@acme/devops/deploy");
    expect(host.querySelector("form")).toBeNull();
  });

  it("asking to move an item: says it was asked, and closes without a new name", async () => {
    const onDone = vi.fn();
    await show(
      <MoveItemForm
        item={{ id: "i1", fullName: "@acme/infra/deploy" }}
        view={{
          workspace: "acme",
          way: "request",
          targets: [{ id: "s2", name: "devops", description: "Devops." }],
        }}
        onDone={onDone}
        loaded={{ to: "s2", state: { done: "requested", newName: "@acme/devops/deploy" } }}
      />,
    );
    expect(cards().map((c) => c.textContent)).toEqual(["OK:Asked to move it to @acme/devops."]);
    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it("moving a scope: says it, and closes", async () => {
    const onDone = vi.fn();
    await show(
      <MoveForm
        scope={{ id: "s1", name: "infra" }}
        workspace="beta"
        onDone={onDone}
        loaded={{ targets: { targets: [] }, to: "acme", state: { done: "moved" } }}
      />,
    );
    expect(cards().map((c) => c.textContent)).toEqual(["OK:Moved @infra to acme."]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("erasing a user: says what happened, and closes", async () => {
    const onDone = vi.fn();
    await show(
      <EraseUserForm
        user={{ id: "u", email: "ana@example.com", name: "Ana", role: "user" }}
        onDone={onDone}
        initialState={{ done: "Erased. The account is now deleted-user." }}
      />,
    );
    expect(cards().map((c) => c.textContent)).toEqual([
      "OK:Erased. The account is now deleted-user.",
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a row's button that was refused says why as an error toast, which stays", async () => {
    await show(
      <ApproveItemMoveForm
        move={
          {
            id: "m1",
            item: "@acme/infra/deploy",
            type: "skill",
            newName: "@acme/devops/deploy",
            from: "@acme/infra",
            to: "@acme/devops",
            workspace: "acme",
            askedBy: { email: "ana@example.com", name: "Ana" },
            createdAt: new Date("2026-10-27T10:00:00Z"),
            reason: null,
          } as never
        }
        loaded={{ error: "Already answered." }}
      />,
    );
    expect(cards().map((c) => [c.dataset.toastKind, c.textContent])).toEqual([
      ["error", "ERR:Already answered."],
    ]);
    for (let i = 0; i < 40; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    expect(cards()).toHaveLength(1);
  });

  it("says it in the person's language", async () => {
    await inLocaleAsync("pt", async () => {
      await show(
        <MoveForm
          scope={{ id: "s1", name: "infra" }}
          workspace="beta"
          onDone={() => {}}
          loaded={{ targets: { targets: [] }, to: "acme", state: { done: "moved" } }}
        />,
      );
    });
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.textContent).not.toContain("Moved");
  });
});
