// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { NotificationFilters } = await import("./NotificationFilters");
const { checkedNotificationsState, NOTIFICATIONS_LIST } = await import("./list");

let root: Root;
let host: HTMLElement;

const mount = async (params: Record<string, string> = {}) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const state = checkedNotificationsState(parseListQuery(NOTIFICATIONS_LIST, params));
  await act(async () => root.render(<NotificationFilters state={state} />));
};
const button = (name: string) =>
  host.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
const click = (el: Element) => act(async () => (el as HTMLElement).click());
const box = (label: string) =>
  [...document.querySelectorAll("label")]
    .find((l) => l.textContent === label)
    ?.querySelector("input") as HTMLInputElement;
const lastUrl = () => router.push.mock.calls.at(-1)?.[0] as string;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("the notification filters (139)", () => {
  it("name what is chosen as badges on the buttons, and 'All' when nothing is", async () => {
    await mount();
    expect(button("Status").textContent).toContain("All");
    expect(button("About").textContent).toContain("All");
    await act(async () => root.unmount());
    host.remove();
    await mount({ state: "unread", kind: "submission.rejected,submission.comment" });
    expect(button("Status").textContent).toContain("Unread");
    expect(button("About").textContent).toContain("Rejected");
    expect(button("About").textContent).toContain("Comment");
  });

  it("choose one value, then more, and write them into the address in the list's own order", async () => {
    await mount();
    await click(button("About"));
    expect(box("All").checked).toBe(true);
    await click(box("Rejected"));
    expect(lastUrl()).toBe("/notifications?kind=submission.rejected");
    expect(router.push).toHaveBeenLastCalledWith(expect.any(String), { scroll: false });
    await act(async () => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    await mount({ kind: "submission.rejected" });
    await click(button("About"));
    await click(box("Approved"));
    // Approved is listed before Rejected, whichever was chosen first.
    expect(lastUrl()).toBe("/notifications?kind=submission.approved%2Csubmission.rejected");
  });

  it("go back to 'All' when the last value is unticked, or when All is ticked", async () => {
    await mount({ kind: "submission.rejected", state: "read" });
    await click(button("About"));
    await click(box("Rejected"));
    expect(lastUrl()).toBe("/notifications?state=read");
    await click(box("All"));
    expect(lastUrl()).toBe("/notifications?state=read");
  });

  it("read both states as no filter: choosing the second leaves 'All'", async () => {
    await mount({ state: "unread" });
    await click(button("Status"));
    await click(box("Read"));
    expect(lastUrl()).toBe("/notifications");
  });

  it("list the kinds under their group, and keep the other filter and the page size", async () => {
    await mount({ state: "unread", size: "50" });
    await click(button("About"));
    const headings = [...document.querySelectorAll("fieldset span")].map((s) => s.textContent);
    expect(headings).toEqual([
      "Your submissions",
      "Requests to join",
      "Moving a scope",
      "Moving an item",
      "Your membership",
      "Requests waiting for you",
      "Feedback",
      "Updates",
    ]);
    await click(box("Comment"));
    expect(lastUrl()).toBe("/notifications?state=unread&kind=submission.comment&size=50");
  });
});
