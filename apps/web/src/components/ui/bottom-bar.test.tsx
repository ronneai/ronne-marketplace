// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomBar } from "./BottomBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const property = () => document.documentElement.style.getPropertyValue("--bottom-bar-height");

/** happy-dom has no layout: the bar's box is whatever the test says it is. */
const boxAt = (top: number, height: number) =>
  vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ top, height } as DOMRect);

beforeEach(() => {
  vi.stubGlobal("innerHeight", 800);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BottomBar's --bottom-bar-height (138)", () => {
  it("is the distance from the bar's top edge to the bottom of the screen", async () => {
    // 60px tall, 81px above the bottom edge (the app's own navigation is under it): 141px.
    boxAt(659, 60);
    await act(async () => root.render(<BottomBar label="Actions">Save</BottomBar>));
    expect(property()).toBe("141px");
  });

  it("is 0 while the bar is not shown, and gone when it is removed", async () => {
    boxAt(0, 0);
    await act(async () => root.render(<BottomBar label="Actions">Save</BottomBar>));
    expect(property()).toBe("0px");
    boxAt(700, 100);
    await act(async () => root.render(<BottomBar label="Actions">Save</BottomBar>));
    await act(async () => root.render(<div />));
    expect(property()).toBe("");
  });
});
