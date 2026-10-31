// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const actions = vi.hoisted(() => ({ markRead: vi.fn(), markAllRead: vi.fn() }));
vi.mock("./actions", () => actions);
const toast = vi.hoisted(() => ({ ok: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));

const { BulkBar, OpenLink, SelectCell, SelectionProvider } = await import(
  "./NotificationsSelection"
);

let root: Root;
let host: HTMLElement;

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <SelectionProvider ids={["a", "b", "c"]}>
        <BulkBar />
        <SelectCell id="a" sentence="First" />
        <SelectCell id="b" sentence="Second" />
        <OpenLink id="a" href="/submissions/s-a" unread>
          First
        </OpenLink>
        <OpenLink id="b" href="/submissions/s-b" unread={false}>
          Second
        </OpenLink>
        <OpenLink id="c" href={null} unread>
          Gone
        </OpenLink>
      </SelectionProvider>,
    ),
  );
};
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLButtonElement;
const box = (label: string) =>
  host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const click = (el: Element) => act(async () => (el as HTMLElement).click());

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("selecting notifications (139)", () => {
  it("counts the selection, and Mark selected stays off until something is selected", async () => {
    await mount();
    expect(host.textContent).toContain("None selected");
    expect(button("Mark selected as read").disabled).toBe(true);
    await click(box("Select: First"));
    expect(host.textContent).toContain("1 selected");
    expect(button("Mark selected as read").disabled).toBe(false);
    await click(button("Select all on this page"));
    expect(host.textContent).toContain("3 selected");
    await click(button("Clear selection"));
    expect(host.textContent).toContain("None selected");
  });

  it("marks only the selected ones read, says how many, and reads the page again", async () => {
    await mount();
    actions.markRead.mockResolvedValue({ unread: 0, changed: 2 });
    await click(box("Select: First"));
    await click(box("Select: Second"));
    await click(button("Mark selected as read"));
    expect(actions.markRead).toHaveBeenCalledWith(["a", "b"]);
    expect(toast.ok).toHaveBeenCalledWith("Marked 2 notifications as read.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("None selected");
  });

  it("marks all of them read with no selection, even those off this page", async () => {
    await mount();
    actions.markAllRead.mockResolvedValue({ unread: 0, changed: 40 });
    await click(button("Mark all as read"));
    expect(actions.markAllRead).toHaveBeenCalledTimes(1);
    expect(actions.markRead).not.toHaveBeenCalled();
    expect(toast.ok).toHaveBeenCalledWith("Marked 40 notifications as read.");
  });

  it("says so, and keeps the selection, when it can't mark them", async () => {
    await mount();
    actions.markRead.mockResolvedValue(null);
    await click(box("Select: First"));
    await click(button("Mark selected as read"));
    expect(toast.error).toHaveBeenCalledWith("Couldn’t mark them as read. Try again.");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(host.textContent).toContain("1 selected");
  });
});

describe("opening a notification (139)", () => {
  it("marks an unread one read when its link is opened, and a read one not at all", async () => {
    await mount();
    const link = (href: string) => host.querySelector(`a[href="${href}"]`) as HTMLAnchorElement;
    for (const a of host.querySelectorAll("a"))
      a.addEventListener("click", (e) => e.preventDefault());
    await click(link("/submissions/s-a"));
    expect(actions.markRead).toHaveBeenCalledWith(["a"]);
    actions.markRead.mockClear();
    await click(link("/submissions/s-b"));
    expect(actions.markRead).not.toHaveBeenCalled();
  });

  it("is plain text, not a link, when what it is about is gone", async () => {
    await mount();
    expect(host.textContent).toContain("Gone");
    expect(host.querySelectorAll("a")).toHaveLength(2);
  });
});
