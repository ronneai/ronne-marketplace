import { describe, expect, it } from "vitest";
import { isDeadlock, isUniqueViolation, retryOnDeadlock } from "./locks";

describe("retryOnDeadlock (113)", () => {
  const deadlock = (kind: "pg" | "mysql") =>
    Object.assign(new Error("deadlock"), kind === "pg" ? { code: "40P01" } : { errno: 1213 });

  it("knows PostgreSQL's and MySQL's deadlocks, and nothing else", () => {
    expect(isDeadlock(deadlock("pg"))).toBe(true);
    expect(isDeadlock(deadlock("mysql"))).toBe(true);
    expect(isDeadlock(Object.assign(new Error("x"), { code: "ER_LOCK_DEADLOCK" }))).toBe(true);
    expect(isDeadlock(Object.assign(new Error("unique"), { code: "23505" }))).toBe(false);
    expect(isDeadlock(null)).toBe(false);
  });

  it("runs the work again after a deadlock, up to three times in all", async () => {
    let runs = 0;
    expect(
      await retryOnDeadlock(async () => {
        runs++;
        if (runs < 3) throw deadlock(runs === 1 ? "pg" : "mysql");
        return "done";
      }),
    ).toBe("done");
    expect(runs).toBe(3);
    runs = 0;
    await expect(
      retryOnDeadlock(async () => {
        runs++;
        throw deadlock("pg");
      }),
    ).rejects.toThrow("deadlock");
    expect(runs).toBe(3);
  });

  it("passes any other failure on at once", async () => {
    let runs = 0;
    await expect(
      retryOnDeadlock(async () => {
        runs++;
        throw new Error("disk full");
      }),
    ).rejects.toThrow("disk full");
    expect(runs).toBe(1);
  });
});

describe("isUniqueViolation", () => {
  it("knows each database's duplicate-key error, also wrapped as a cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ errno: 1062, code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isUniqueViolation({ code: "SQLITE_CONSTRAINT_UNIQUE" })).toBe(true);
    expect(isUniqueViolation(new Error("wrapped", { cause: { code: "23505" } }))).toBe(true);
  });

  it("isn't any other error", () => {
    expect(isUniqueViolation({ code: "40P01" })).toBe(false);
    expect(isUniqueViolation({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" })).toBe(false);
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
