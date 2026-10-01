import { describe, expect, it } from "vitest";
import { createUsageLimiter, USAGE_REPORTS_PER_WINDOW, USAGE_WINDOW_MS } from "./usage-rate-limit";

describe("createUsageLimiter", () => {
  it("allows 60 reports per user in 10 minutes", () => {
    let now = 0;
    const limiter = createUsageLimiter(() => now);
    for (let i = 0; i < USAGE_REPORTS_PER_WINDOW; i += 1)
      expect(limiter.consume("u1"), `report ${i + 1}`).toEqual({ allowed: true });
    expect(limiter.consume("u1").allowed).toBe(false);
    expect(limiter.consume("u2")).toEqual({ allowed: true });
    now = USAGE_WINDOW_MS;
    expect(limiter.consume("u1")).toEqual({ allowed: true });
  });
});
