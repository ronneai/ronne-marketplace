// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyableCommand } from "./CopyableCommand";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy = vi.hoisted(() => ({ result: "copied" as "copied" | "manual" }));
vi.mock("./copy", () => ({
  copyText: async () => copy.result,
  selectText: () => {},
}));

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const press = async () => {
  await act(async () => root.render(<CopyableCommand command="rmk login" />));
  const button = host.querySelector("button");
  if (!button) throw new Error("no copy button");
  await act(async () => {
    button.click();
  });
  return button;
};

describe("CopyableCommand's icon-only button (158)", () => {
  it("keeps its text out of sight when the copy worked, and says so for screen readers", async () => {
    copy.result = "copied";
    const button = await press();
    const status = button.querySelector("[aria-live]");
    expect(status?.className).toContain("sr-only");
    expect(status?.textContent).not.toBe("");
  });

  it("shows its text when copying was blocked, so the person copies it by hand", async () => {
    copy.result = "manual";
    const button = await press();
    const status = button.querySelector("[aria-live]");
    expect(status?.className ?? "").not.toContain("sr-only");
    expect(status?.textContent).not.toBe("");
  });
});
