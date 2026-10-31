// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./Toaster";
import { dismissToasts, toast } from "./toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Toaster />));
};
/**
 * Moves the clock in steps, each one flushed by React: a timer's callback sets state, whose effect
 * (Sonner's removal after 200ms) starts the next timer only once React has run.
 */
const tick = async (ms: number) => {
  for (let left = ms; left > 0; left -= 250) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(250, left));
    });
  }
};
const hover = async (target: Element, on: boolean) => {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(on ? "mouseover" : "mouseout", { bubbles: true }));
  });
};
const setHidden = async (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-toast-kind]")];
const texts = () => cards().map((card) => card.textContent);

beforeEach(async () => {
  vi.useFakeTimers();
  await mount();
});
afterEach(async () => {
  // Sonner keeps its list outside React: empty it while the region is still there to take it.
  await act(async () => dismissToasts());
  await tick(1000);
  await setHidden(false);
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("the toast region (138)", () => {
  it("is in the page, named and empty, when nothing is shown", () => {
    const region = document.querySelector("section[aria-live]");
    expect(region?.getAttribute("aria-label")).toBe("Notifications");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(cards()).toHaveLength(0);
  });

  it("reads the bottom bar's height, so a toast sits above it", async () => {
    await act(async () => toast.ok("Saved"));
    await tick(50);
    const style = document.querySelector("[data-sonner-toaster]")?.getAttribute("style");
    expect(style).toContain("--offset-bottom: calc(var(--bottom-bar-height, 0px)");
    expect(style).toContain("--mobile-offset-bottom: calc(var(--bottom-bar-height, 0px)");
  });

  it("draws each toast unstyled by Sonner, so its shadow and colours never apply", async () => {
    await act(async () => toast.ok("Saved"));
    await tick(50);
    const li = document.querySelector<HTMLElement>("[data-sonner-toast]");
    expect(li?.getAttribute("data-styled")).toBe("false");
    // Sonner's stylesheet is in the page; none of its box-shadow or background rules reach the toast.
    expect(document.querySelector("style")?.textContent).toContain("box-shadow");
    const style = li ? getComputedStyle(li) : null;
    expect(style?.boxShadow ?? "").toMatch(/^(none)?$/);
    expect(style?.backgroundColor ?? "").toMatch(/^(transparent|rgba\(0, 0, 0, 0\))?$/);
  });

  it("shows ok and info as status, warning and error as alert, each with its prefix", async () => {
    await act(async () => {
      toast.ok("Saved");
      toast.info("Heads up");
      toast.warning("Careful");
    });
    await tick(50);
    const byKind = Object.fromEntries(cards().map((c) => [c.dataset.toastKind, c]));
    expect(byKind.ok?.getAttribute("role")).toBe("status");
    expect(byKind.info?.getAttribute("role")).toBe("status");
    expect(byKind.warning?.getAttribute("role")).toBe("alert");
    expect(byKind.ok?.textContent).toContain("OK:");
    expect(byKind.info?.textContent).toContain("INFO:");
    expect(byKind.warning?.textContent).toContain("WARN:");
    await act(async () => toast.error("Broken"));
    await tick(50);
    expect(cards().find((c) => c.dataset.toastKind === "error")?.textContent).toContain("ERR:");
  });

  it("closes ok and info after 5 seconds, not before", async () => {
    await act(async () => {
      toast.ok("Saved");
      toast.info("Heads up");
    });
    await tick(4800);
    expect(cards()).toHaveLength(2);
    await tick(1000);
    expect(cards()).toHaveLength(0);
  });

  it("keeps a warning and an error until they are closed", async () => {
    await act(async () => {
      toast.warning("Careful");
      toast.error("Broken");
    });
    await tick(60_000);
    expect(texts()).toHaveLength(2);
    const close = document.querySelector<HTMLButtonElement>("[data-toast-kind=error] button");
    expect(close?.getAttribute("aria-label")).toBe("Close notification");
    await act(async () => close?.click());
    await tick(1000);

    expect(cards().map((c) => c.dataset.toastKind)).toEqual(["warning"]);
  });

  it("waits while the pointer is over the region, and goes after it leaves", async () => {
    await act(async () => toast.ok("Saved"));
    await tick(50);
    const card = cards()[0] as HTMLElement;
    await tick(2000);
    await hover(card, true);
    await tick(10_000);
    expect(cards()).toHaveLength(1);
    await hover(card, false);
    await tick(6000);
    expect(cards()).toHaveLength(0);
  });

  it("waits while focus is inside the region", async () => {
    await act(async () => toast.ok("Saved"));
    await tick(50);
    const close = document.querySelector<HTMLButtonElement>("[data-toast-kind] button");
    await act(async () => close?.focus());
    await tick(10_000);
    expect(cards()).toHaveLength(1);
    await act(async () => close?.blur());
    await tick(6000);
    expect(cards()).toHaveLength(0);
  });

  it("waits while the tab is hidden", async () => {
    await act(async () => toast.ok("Saved"));
    await tick(50);
    await setHidden(true);
    await tick(10_000);
    expect(cards()).toHaveLength(1);
    await setHidden(false);
    await tick(6000);
    expect(cards()).toHaveLength(0);
  });

  it("shows at most three, the fourth pushing out the oldest that isn't an error", async () => {
    await act(async () => {
      toast.error("Broken");
      toast.ok("One");
      toast.ok("Two");
    });
    await tick(50);
    await act(async () => toast.ok("Three"));
    await tick(1000);
    expect(texts().map((t) => t?.replace(/^\w+:/, ""))).toEqual(["Three", "Two", "Broken"]);
  });

  it("is one toast for the same message twice, its timer started again", async () => {
    await act(async () => toast.ok("Saved"));
    await tick(3000);
    await act(async () => toast.ok("Saved"));
    await tick(50);
    expect(cards()).toHaveLength(1);
    await tick(3000);
    expect(cards()).toHaveLength(1);
    await tick(2500);
    expect(cards()).toHaveLength(0);
  });
});
