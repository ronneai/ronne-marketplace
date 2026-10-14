import { afterEach, beforeEach, expect, it } from "vitest";
import { setLoggerForTests } from "../../../log";
import { betterAuthLogger } from "./better-auth-logger";

let lines: Record<string, unknown>[] = [];
beforeEach(() => {
  lines = [];
  setLoggerForTests({
    level: "debug",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
});
afterEach(() => setLoggerForTests());

it("writes Better Auth's lines through ours, at their level, in the identity domain", () => {
  betterAuthLogger.log("warn", "Something odd");
  betterAuthLogger.log("error", "Failed", new Error("db down"));
  expect(lines).toEqual([
    expect.objectContaining({
      level: "warn",
      msg: "Something odd",
      domain: "identity",
      source: "better-auth",
    }),
    expect.objectContaining({
      level: "error",
      msg: "Failed",
      err: expect.objectContaining({ message: "db down" }),
    }),
  ]);
});

it("keeps a user's record and other arguments out of the line", () => {
  betterAuthLogger.log(
    "info",
    "User",
    { email: "alice@example.com", name: "Alice" },
    "alice@example.com",
  );
  expect(JSON.stringify(lines)).not.toContain("alice");
});
