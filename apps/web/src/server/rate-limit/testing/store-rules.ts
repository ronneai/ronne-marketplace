import { expect, it } from "vitest";
import { consumeAll, createRateLimiter, type RateLimitStore, releaseAll } from "../rate-limiter";

/**
 * The rules every store keeps (006, 105, 107), run against memory in a unit test and against the
 * database on every dialect (109). `store` makes a store for one test.
 */
export const storeRules = (store: () => Promise<RateLimitStore>) => {
  const clock = () => {
    const now = { t: 1_000_000 };
    return { now, at: () => now.t };
  };

  it("allows 5 attempts a minute per key and refuses the 6th, then allows again", async () => {
    const { now, at } = clock();
    const limiter = createRateLimiter({ store: await store(), name: "rules", now: at });
    for (let i = 0; i < 5; i++)
      expect(await limiter.consume(["email:a@b.c"])).toEqual({ allowed: true });
    expect(await limiter.consume(["email:a@b.c"])).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    now.t += 30_500;
    expect(await limiter.consume(["email:a@b.c"])).toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });
    now.t += 29_500;
    expect(await limiter.consume(["email:a@b.c"])).toEqual({ allowed: true });
  });

  it("refuses when any key is used up, and then counts against none", async () => {
    const { at } = clock();
    const limiter = createRateLimiter({ store: await store(), name: "rules", max: 2, now: at });
    await limiter.consume(["ip:203.0.113.9"]);
    await limiter.consume(["ip:203.0.113.9"]);
    expect((await limiter.consume(["email:a@b.c", "ip:203.0.113.9"])).allowed).toBe(false);
    // The refused attempt didn't count against the email.
    expect(await limiter.consume(["email:a@b.c"])).toEqual({ allowed: true });
    expect(await limiter.consume(["email:a@b.c"])).toEqual({ allowed: true });
    expect((await limiter.consume(["email:a@b.c"])).allowed).toBe(false);
  });

  it("starts a window over once it ends", async () => {
    const { now, at } = clock();
    const limiter = createRateLimiter({ store: await store(), name: "rules", max: 1, now: at });
    expect((await limiter.consume(["k"])).allowed).toBe(true);
    now.t += 60_000;
    expect((await limiter.consume(["k"])).allowed).toBe(true);
    // The new window started at that attempt: a minute from it, not from the first.
    now.t += 59_000;
    expect(await limiter.consume(["k"])).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("checks without counting, and counts only what's recorded (105)", async () => {
    const { now, at } = clock();
    const limiter = createRateLimiter({ store: await store(), name: "rules", max: 2, now: at });
    for (let i = 0; i < 10; i++) expect(await limiter.check(["k"])).toEqual({ allowed: true });
    await limiter.record(["k"]);
    expect(await limiter.check(["k"])).toEqual({ allowed: true });
    await limiter.record(["k"]);
    expect(await limiter.check(["k"])).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect((await limiter.consume(["k"])).allowed).toBe(false);
    now.t += 60_000;
    expect(await limiter.check(["k"])).toEqual({ allowed: true });
  });

  it("takes back a counted attempt, never below none (107)", async () => {
    const { at } = clock();
    const limiter = createRateLimiter({ store: await store(), name: "rules", max: 1, now: at });
    await limiter.release(["k"]);
    expect((await limiter.consume(["k"])).allowed).toBe(true);
    await limiter.release(["k"]);
    expect((await limiter.consume(["k"])).allowed).toBe(true);
    expect((await limiter.consume(["k"])).allowed).toBe(false);
  });

  it("keeps two limits apart, even on the same key", async () => {
    const { at } = clock();
    const shared = await store();
    const a = createRateLimiter({ store: shared, name: "a", max: 1, now: at });
    const b = createRateLimiter({ store: shared, name: "b", max: 1, now: at });
    expect((await a.consume(["user:1"])).allowed).toBe(true);
    expect((await b.consume(["user:1"])).allowed).toBe(true);
    expect((await a.consume(["user:1"])).allowed).toBe(false);
  });

  it("counts several limits together or not at all (consumeAll)", async () => {
    const { now, at } = clock();
    const shared = await store();
    const ip = createRateLimiter({ store: shared, name: "ip", max: 5, windowMs: 60_000, now: at });
    const person = createRateLimiter({
      store: shared,
      name: "person",
      max: 2,
      windowMs: 3_600_000,
      now: at,
    });
    const pairs = [
      [person, ["user:1"]],
      [ip, ["ip:203.0.113.9"]],
    ] as const;
    expect(await consumeAll(pairs)).toEqual({ allowed: true });
    expect(await consumeAll(pairs)).toEqual({ allowed: true });
    // The person's hour is full: refused, and the address's minute isn't counted.
    expect(await consumeAll(pairs)).toEqual({ allowed: false, retryAfterSeconds: 3600 });
    for (let i = 0; i < 3; i++) expect((await ip.consume(["ip:203.0.113.9"])).allowed).toBe(true);
    expect((await ip.consume(["ip:203.0.113.9"])).allowed).toBe(false);
    // Taken back from both.
    now.t += 60_000;
    await releaseAll(pairs);
    expect(await consumeAll(pairs)).toEqual({ allowed: true });
  });

  it("refuses a consumeAll over two stores", async () => {
    const a = createRateLimiter({ store: await store(), name: "a" });
    const b = createRateLimiter({ store: await store(), name: "b" });
    expect(() =>
      consumeAll([
        [a, ["k"]],
        [b, ["k"]],
      ]),
    ).toThrow(/share one store/);
  });

  it("allows an attempt that names no keys", async () => {
    const limiter = createRateLimiter({ store: await store(), name: "rules" });
    expect(await limiter.consume([])).toEqual({ allowed: true });
    expect(await limiter.check([])).toEqual({ allowed: true });
  });

  it("refuses a name that could run into a key", async () => {
    const s = await store();
    for (const name of ["", "a\u0000b", "Sign In", "-x"])
      expect(() => createRateLimiter({ store: s, name })).toThrow(/Not a rate limit name/);
  });
};
