import { describe, expect, it, vi } from "vitest";
import { type DetailsLike, dismissDetails } from "./dismiss";

const inside = { name: "inside" } as unknown as Node;
const outside = { name: "outside" } as unknown as Node;

const setup = () => {
  const summary = { focus: vi.fn() };
  const details: DetailsLike = {
    open: true,
    contains: (node) => node === inside,
    querySelector: () => summary,
  };
  const doc = new EventTarget();
  const stop = dismissDetails(details, doc);
  const pointerDown = (target: Node) => {
    const event = new Event("pointerdown");
    Object.defineProperty(event, "target", { value: target });
    doc.dispatchEvent(event);
  };
  const key = (name: string) =>
    doc.dispatchEvent(Object.assign(new Event("keydown"), { key: name }));
  return { details, summary, stop, pointerDown, key };
};

describe("dismissDetails", () => {
  it("closes the menu on a pointer down outside it, not inside it", () => {
    const { details, pointerDown } = setup();
    pointerDown(inside);
    expect(details.open).toBe(true);
    pointerDown(outside);
    expect(details.open).toBe(false);
  });

  it("closes the menu on Esc and puts focus back on its summary; other keys do nothing", () => {
    const { details, summary, key } = setup();
    key("Enter");
    expect(details.open).toBe(true);
    key("Escape");
    expect(details.open).toBe(false);
    expect(summary.focus).toHaveBeenCalledOnce();
  });

  it("leaves a closed menu and its focus alone", () => {
    const { details, summary, key } = setup();
    details.open = false;
    key("Escape");
    expect(summary.focus).not.toHaveBeenCalled();
  });

  it("stops listening once cleaned up", () => {
    const { details, stop, pointerDown } = setup();
    stop();
    pointerDown(outside);
    expect(details.open).toBe(true);
  });
});
