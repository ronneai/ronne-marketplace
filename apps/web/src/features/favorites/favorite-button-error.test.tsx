// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { dismissToasts } from "@/components/ui/toast";

vi.mock("./actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
// The render shows the state before any click, so the action's answer is set by hand.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [{ error: "You have 200 favorites, the most allowed." }, () => {}, false],
}));
const { FavoriteButton } = await import("./FavoriteButton");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("why the star was refused (125, 138)", () => {
  it("says the action's answer as an error toast that stays, not under the star", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <>
          <Toaster />
          <FavoriteButton itemId="I1" name="@team/base" favorited={false} />
        </>,
      ),
    );
    for (let i = 0; i < 4; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    const cards = [...document.querySelectorAll<HTMLElement>("[data-toast-kind]")];
    expect(cards.map((c) => [c.dataset.toastKind, c.textContent])).toEqual([
      ["error", "ERR:You have 200 favorites, the most allowed."],
    ]);
    expect(host.querySelector("p[role=alert]")).toBeNull();
    await act(async () => dismissToasts());
    for (let i = 0; i < 4; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });
});
