import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The component's effect, as React would run it: captured here, run by the test, and its cleanup
// called as React does when the panel stops waiting (135).
const effects = vi.hoisted(() => ({ list: [] as (() => undefined | (() => void))[] }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => undefined | (() => void)) => {
      effects.list.push(effect);
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { REFRESH_EVERY_MS, ScanRefresh } = await import("./ScanRefresh");

beforeEach(() => {
  vi.useFakeTimers();
  effects.list = [];
  router.refresh.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("ScanRefresh (135)", () => {
  it("refreshes the page while mounted and stops when it goes", () => {
    expect(renderToStaticMarkup(<ScanRefresh />)).toBe("");
    const [effect] = effects.list;
    const cleanup = effect?.();
    vi.advanceTimersByTime(REFRESH_EVERY_MS * 2);
    expect(router.refresh).toHaveBeenCalledTimes(2);
    expect(typeof cleanup).toBe("function");
    cleanup?.();
    vi.advanceTimersByTime(REFRESH_EVERY_MS * 5);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});
