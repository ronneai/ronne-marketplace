import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";
import { LoginRateLimiter, loginRateLimitKeys } from "./login-rate-limiter";
import { hasSessionCookie } from "./session-cookie";

const headers = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("clientIp", () => {
  it("ignores X-Forwarded-For unless TRUST_PROXY is on", () => {
    expect(clientIp(headers("203.0.113.9"), false)).toBeNull();
  });

  it("with TRUST_PROXY, takes the rightmost entry: the one the proxy added", () => {
    expect(clientIp(headers("203.0.113.9"), true)).toBe("203.0.113.9");
    expect(clientIp(headers("6.6.6.6, 203.0.113.9"), true)).toBe("203.0.113.9");
    expect(clientIp(headers("2001:db8::1"), true)).toBe("2001:db8::1");
  });

  it("returns null for a missing or malformed header", () => {
    expect(clientIp(headers(), true)).toBeNull();
    expect(clientIp(headers("not-an-ip"), true)).toBeNull();
    expect(clientIp(headers("203.0.113.9, "), true)).toBeNull();
  });
});

describe("LoginRateLimiter", () => {
  const limiter = (now: { t: number }) => new LoginRateLimiter({ now: () => now.t });

  it("allows 5 attempts a minute per key and refuses the 6th", () => {
    const now = { t: 0 };
    const l = limiter(now);
    for (let i = 0; i < 5; i++)
      expect(l.consume(["email:a@example.com"])).toEqual({ allowed: true });
    now.t = 20_000;
    expect(l.consume(["email:a@example.com"])).toEqual({ allowed: false, retryAfterSeconds: 40 });
    expect(l.consume(["email:b@example.com"])).toEqual({ allowed: true });
  });

  it("opens again after the window, and refused attempts don't extend it", () => {
    const now = { t: 0 };
    const l = limiter(now);
    for (let i = 0; i < 5; i++) l.consume(["email:a@example.com"]);
    now.t = 59_999;
    expect(l.consume(["email:a@example.com"]).allowed).toBe(false);
    now.t = 60_000;
    expect(l.consume(["email:a@example.com"])).toEqual({ allowed: true });
  });

  it("refuses when any key is used up: one IP trying many emails", () => {
    const now = { t: 0 };
    const l = limiter(now);
    for (let i = 0; i < 5; i++) l.consume(loginRateLimitKeys(`u${i}@example.com`, "203.0.113.9"));
    expect(l.consume(loginRateLimitKeys("u9@example.com", "203.0.113.9")).allowed).toBe(false);
    expect(l.consume(loginRateLimitKeys("u9@example.com", null)).allowed).toBe(true);
  });
});

describe("hasSessionCookie", () => {
  it("finds the plain and the __Secure- session cookie, and nothing else", () => {
    const jar = (...names: string[]) => ({ has: (n: string) => names.includes(n) });
    expect(hasSessionCookie(jar("ronne.session_token"))).toBe(true);
    expect(hasSessionCookie(jar("__Secure-ronne.session_token"))).toBe(true);
    expect(hasSessionCookie(jar("better-auth.session_token", "ronne-theme"))).toBe(false);
  });
});
