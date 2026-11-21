import { describe, expect, it } from "vitest";
import { createMemoryRateLimitStore } from "../rate-limit/memory-store";
import { createUploadLimiter, UPLOAD_WINDOW_MS, UPLOADS_PER_WINDOW } from "./upload-rate-limit";

describe("createUploadLimiter", async () => {
  it("allows 30 uploads per user in 10 minutes, then says how long to wait", async () => {
    let now = 1_000_000;
    const limiter = createUploadLimiter(createMemoryRateLimitStore(), () => now);
    for (let i = 0; i < UPLOADS_PER_WINDOW; i += 1) {
      expect(await limiter.consume("u1"), `upload ${i + 1}`).toEqual({ allowed: true });
      now += 1000;
    }
    expect(await limiter.consume("u1")).toEqual({
      allowed: false,
      retryAfterSeconds: (UPLOAD_WINDOW_MS - UPLOADS_PER_WINDOW * 1000) / 1000,
    });
    expect(await limiter.consume("u2")).toEqual({ allowed: true });

    now = 1_000_000 + UPLOAD_WINDOW_MS;
    expect(await limiter.consume("u1")).toEqual({ allowed: true });
  });

  it("doesn't count refused uploads, so waiting out the window always works", async () => {
    let now = 0;
    const limiter = createUploadLimiter(createMemoryRateLimitStore(), () => now);
    for (let i = 0; i < UPLOADS_PER_WINDOW; i += 1) await limiter.consume("u1");
    for (let i = 0; i < 100; i += 1)
      expect(await (await limiter.consume("u1")).allowed).toBe(false);
    now = UPLOAD_WINDOW_MS;
    expect(await limiter.consume("u1")).toEqual({ allowed: true });
  });
});
