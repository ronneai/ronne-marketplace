import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFRESH_EVERY_MS, startRefreshing } from "./ScanRefresh";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("refreshing the review page while its scan waits (135)", () => {
  it("refreshes every five seconds, and stops when told", () => {
    const refresh = vi.fn();
    const stop = startRefreshing(refresh);
    vi.advanceTimersByTime(REFRESH_EVERY_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REFRESH_EVERY_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(REFRESH_EVERY_MS * 5);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(REFRESH_EVERY_MS).toBe(5_000);
  });
});
