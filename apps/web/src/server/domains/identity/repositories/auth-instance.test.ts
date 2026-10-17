import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import { dropStale, getAppAuth } from "./auth-instance";
import { createAuth } from "./better-auth";

const shared = globalThis as typeof globalThis & {
  __ronneAuth?: Map<string, unknown>;
  __ronneAuthFactory?: unknown;
  __ronneLoginLimiter?: unknown;
};
const before = { ...shared };
afterEach(() => {
  shared.__ronneAuth = before.__ronneAuth;
  shared.__ronneAuthFactory = before.__ronneAuthFactory;
  shared.__ronneLoginLimiter = before.__ronneLoginLimiter;
});

describe("dropStale (what a hot reload left behind)", () => {
  it("replaces a limiter made by an older version of its class, and keeps a current one", () => {
    // What `pnpm dev` had after task 3: an object of the old class, without `check`.
    shared.__ronneLoginLimiter = { consume: () => ({ allowed: true }) };
    dropStale();
    expect(shared.__ronneLoginLimiter).toBeInstanceOf(LoginRateLimiter);
    const current = shared.__ronneLoginLimiter;
    dropStale();
    expect(shared.__ronneLoginLimiter).toBe(current);
  });

  it("forgets Better Auth instances made by another createAuth, and keeps those of this one", () => {
    shared.__ronneAuth = new Map([["key", "an instance from older code"]]);
    shared.__ronneAuthFactory = () => {};
    dropStale();
    expect(shared.__ronneAuth.size).toBe(0);
    expect(shared.__ronneAuthFactory).toBe(createAuth);
    shared.__ronneAuth.set("key", "current");
    dropStale();
    expect(shared.__ronneAuth.get("key")).toBe("current");
  });
});

describe("getAppAuth and BETTER_AUTH_SECRETS (105)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to sign anything with another secret than AUTH_SECRET", () => {
    vi.stubEnv("RONNE_ENV_FILE", "/nonexistent/ronne-test.env");
    vi.stubEnv("DATABASE_URL", "file::memory:");
    vi.stubEnv("AUTH_SECRET", "test-secret-test-secret-test-secret-00");
    vi.stubEnv("BETTER_AUTH_SECRETS", "1:another-secret-another-secret-0000");
    expect(() => getAppAuth()).toThrow(/BETTER_AUTH_SECRETS is set/);
  });
});
