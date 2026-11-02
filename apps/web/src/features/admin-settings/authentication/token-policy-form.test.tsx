// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ saveTokenPolicy: vi.fn(), shortenTokensFromForm: vi.fn() }));
vi.mock("../actions", () => actions);
const { TokenPolicyForm, reviewerChoices } = await import("./TokenPolicyForm");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

const show = async (
  policy: { maxDays: 30 | 90 | 365 | null; reviewersMaxDays: 30 | 90 | 365 | null },
  past = 0,
) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<TokenPolicyForm policy={policy} past={past} />));
  const everyone = host.querySelector<HTMLSelectElement>("#token-max-days");
  const reviewers = host.querySelector<HTMLSelectElement>("#token-max-days-reviewers");
  const save = [...host.querySelectorAll("button")].find((b) => b.textContent === "Save");
  return { host, everyone, reviewers, save };
};
const options = (select: HTMLSelectElement | null) =>
  [...(select?.options ?? [])].map((o) => o.value);
const choose = async (select: HTMLSelectElement | null, value: string) => {
  if (!select) throw new Error("no select");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("the Access tokens panel (162)", () => {
  it("shows the two caps, the reviewers' never longer than everyone's, and sends none for no limit", async () => {
    const { everyone, reviewers, save } = await show({ maxDays: 365, reviewersMaxDays: 90 });
    expect(everyone?.value).toBe("365");
    expect(options(everyone)).toEqual(["30", "90", "365", "none"]);
    expect(reviewers?.value).toBe("90");
    expect(options(reviewers)).toEqual(["30", "90", "365"]);
    expect(save?.disabled).toBe(true);

    await choose(everyone, "none");
    expect(options(reviewers)).toEqual(["30", "90", "365", "none"]);
    expect(save?.disabled).toBe(false);
    // Everyone's down to 30: the reviewers' follows.
    await choose(everyone, "30");
    expect(reviewers?.value).toBe("30");
    expect(options(reviewers)).toEqual(["30"]);
  });

  it("asks before Shorten, only when some tokens last longer", async () => {
    const none = await show({ maxDays: 90, reviewersMaxDays: 30 }, 0);
    expect(none.host.textContent).toContain("No active token lasts longer than this.");
    expect(none.host.textContent).not.toContain("Shorten them");
    await act(async () => root?.unmount());

    const some = await show({ maxDays: 90, reviewersMaxDays: 30 }, 14);
    expect(some.host.textContent).toContain("14 active tokens last longer than this.");
    const shorten = [...some.host.querySelectorAll("button")].find(
      (b) => b.textContent === "Shorten them",
    );
    // The question is in a closed dialog until the click opens it; nothing runs before Confirm.
    const dialog = some.host.querySelector("dialog");
    expect(dialog?.textContent).toContain(
      "14 tokens will expire at the earlier of their own date and the longest lifetime from today",
    );
    expect(dialog?.open).toBe(false);
    await act(async () => shorten?.click());
    expect(dialog?.open).toBe(true);
    expect(actions.shortenTokensFromForm).not.toHaveBeenCalled();
  });

  it("works out the reviewers' choices without a browser", () => {
    expect(reviewerChoices("90")).toEqual(["30", "90"]);
    expect(reviewerChoices("none")).toEqual(["30", "90", "365", "none"]);
  });
});
