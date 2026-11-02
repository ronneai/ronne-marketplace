// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ createTokenFromForm: vi.fn() }));
const { CreateTokenDialog, defaultLifetime, lifetimeChoices } = await import("./CreateTokenDialog");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Opens the dialog under a cap and reads the lifetimes it offers. */
const open = async (maxDays: number | null) => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<CreateTokenDialog maxDays={maxDays} />));
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Create token");
  await act(async () => button?.click());
  const select = document.querySelector<HTMLSelectElement>("#token-lifetime");
  const seen = {
    options: [...(select?.options ?? [])].map((o) => o.value),
    chosen: select?.value,
    hint: document.querySelector("#token-lifetime-cap")?.textContent ?? null,
  };
  await act(async () => root.unmount());
  host.remove();
  return seen;
};

describe("the Create token dialog under root's longest lifetime (162)", () => {
  it("offers only the lifetimes allowed, 90 days first when it is", async () => {
    expect(await open(30)).toEqual({
      options: ["30"],
      chosen: "30",
      hint: "Root allows tokens of 30 days at most.",
    });
    expect(await open(90)).toMatchObject({ options: ["30", "90"], chosen: "90" });
    expect(await open(365)).toMatchObject({ options: ["30", "90", "365"], chosen: "90" });
    expect(await open(null)).toEqual({
      options: ["30", "90", "365", "none"],
      chosen: "90",
      hint: null,
    });
  });

  it("works it out the same way without a browser", () => {
    expect(lifetimeChoices(30)).toEqual(["30"]);
    expect(lifetimeChoices(null)).toEqual(["30", "90", "365", "none"]);
    expect(defaultLifetime(30)).toBe("30");
    expect(defaultLifetime(365)).toBe("90");
    expect(defaultLifetime(null)).toBe("90");
  });
});
