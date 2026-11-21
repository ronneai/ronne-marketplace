import { describe, expect, it } from "vitest";
import { createMemoryRateLimitStore } from "../rate-limit/memory-store";
import { createUsageLimiter, USAGE_REPORTS_PER_WINDOW, USAGE_WINDOW_MS } from "./usage-rate-limit";

describe("createUsageLimiter", async () => {
  it("allows 60 reports per user in 10 minutes", async () => {
    let now = 0;
    const limiter = createUsageLimiter(createMemoryRateLimitStore(), () => now);
    for (let i = 0; i < USAGE_REPORTS_PER_WINDOW; i += 1)
      expect(await limiter.consume("u1"), `report ${i + 1}`).toEqual({ allowed: true });
    expect(await (await limiter.consume("u1")).allowed).toBe(false);
    expect(await limiter.consume("u2")).toEqual({ allowed: true });
    now = USAGE_WINDOW_MS;
    expect(await limiter.consume("u1")).toEqual({ allowed: true });
  });
});
