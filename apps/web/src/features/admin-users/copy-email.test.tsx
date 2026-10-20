import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CopyEmailButton, copyOrSelect, firstShown } from "./CopyEmailButton";

const el = (name: string, shown: boolean) => ({
  name,
  getClientRects: () => ({ length: shown ? 1 : 0 }),
});

describe("CopyEmailButton (123)", () => {
  it("is an icon-only button named for the email, with a status line for screen readers", () => {
    const html = renderToStaticMarkup(<CopyEmailButton email="alex@example.com" />);
    expect(html).toMatch(
      /<button[^>]*aria-label="Copy alex@example\.com"[^>]*title="Copy alex@example\.com"/,
    );
    expect(html).toContain("<svg");
    expect(html).toContain('role="status"');
    expect(html).toContain("sr-only");
  });

  it("selects the email that is on the screen, not the hidden one of the pair", () => {
    // The list has a link for a phone and a span for wider screens: one is display: none.
    expect(firstShown([el("phone link", false), el("wide span", true)])?.name).toBe("wide span");
    expect(firstShown([el("phone link", true), el("wide span", false)])?.name).toBe("phone link");
    expect(firstShown([el("a", false), el("b", false)])).toBeUndefined();
    expect(firstShown([])).toBeUndefined();
  });

  it("selects the shown email when nothing can copy, and nothing when the copy worked", async () => {
    const phone = el("phone link", false);
    const wide = el("wide span", true);
    const select = vi.fn();
    expect(await copyOrSelect("a@b.c", [phone, wide], async () => "manual", select)).toBe("manual");
    expect(select).toHaveBeenCalledWith(wide);
    select.mockClear();
    expect(await copyOrSelect("a@b.c", [phone, wide], async () => "copied", select)).toBe("copied");
    expect(select).not.toHaveBeenCalled();
    // Nothing is shown: it still reports "manual", and selects nothing.
    expect(await copyOrSelect("a@b.c", [phone], async () => "manual", select)).toBe("manual");
    expect(select).toHaveBeenCalledWith(null);
  });

  it("is given its elements before it waits, since an event's target is gone after", async () => {
    const copy = vi.fn(async () => "manual" as const);
    const select = vi.fn();
    const sources = [el("wide span", true)];
    // The caller's list is what is used, not anything read from an event after the await.
    await copyOrSelect("a@b.c", sources, copy, select);
    expect(copy).toHaveBeenCalledWith("a@b.c");
    expect(select).toHaveBeenCalledWith(sources[0]);
  });
});
