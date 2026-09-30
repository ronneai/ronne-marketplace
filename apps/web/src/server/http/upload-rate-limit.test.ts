import { describe, expect, it } from "vitest";
import { createUploadLimiter, UPLOAD_WINDOW_MS, UPLOADS_PER_WINDOW } from "./upload-rate-limit";

describe("createUploadLimiter", () => {
  it("allows 30 uploads per user in 10 minutes, then says how long to wait", () => {
    let now = 1_000_000;
    const limiter = createUploadLimiter(() => now);
    for (let i = 0; i < UPLOADS_PER_WINDOW; i += 1) {
      expect(limiter.consume("u1"), `upload ${i + 1}`).toEqual({ allowed: true });
      now += 1000;
    }
    expect(limiter.consume("u1")).toEqual({
      allowed: false,
      retryAfterSeconds: (UPLOAD_WINDOW_MS - UPLOADS_PER_WINDOW * 1000) / 1000,
    });
    expect(limiter.consume("u2")).toEqual({ allowed: true });

    now = 1_000_000 + UPLOAD_WINDOW_MS;
    expect(limiter.consume("u1")).toEqual({ allowed: true });
  });

  it("doesn't count refused uploads, so waiting out the window always works", () => {
    let now = 0;
    const limiter = createUploadLimiter(() => now);
    for (let i = 0; i < UPLOADS_PER_WINDOW; i += 1) limiter.consume("u1");
    for (let i = 0; i < 100; i += 1) expect(limiter.consume("u1").allowed).toBe(false);
    now = UPLOAD_WINDOW_MS;
    expect(limiter.consume("u1")).toEqual({ allowed: true });
  });
});
