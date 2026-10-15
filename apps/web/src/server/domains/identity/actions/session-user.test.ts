import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { logger, setLoggerForTests, withRequestContext } from "../../../log";
import type { AppAuth } from "../repositories/auth-instance";
import { getCurrentUser } from "./session";

vi.mock("../services/session", async (original) => ({
  ...(await original<typeof import("../services/session")>()),
  currentUser: async () => ({ id: "01SESSIONUSER" }),
}));

let lines: Record<string, unknown>[] = [];
beforeEach(() => {
  lines = [];
  setLoggerForTests({
    level: "info",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
});
afterEach(() => setLoggerForTests());

it("records the signed-in user on the request's later lines (feature 100)", async () => {
  const app = { auth: {}, db: {}, dialect: "sqlite" } as unknown as AppAuth;
  await withRequestContext({ requestId: "R1" }, async () => {
    logger.info("Before");
    await getCurrentUser(new Headers(), app);
    logger.info("After");
  });
  expect(lines.map((line) => [line.msg, line.userId])).toEqual([
    ["Before", undefined],
    ["After", "01SESSIONUSER"],
  ]);
});
