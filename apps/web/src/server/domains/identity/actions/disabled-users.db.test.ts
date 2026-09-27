import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { getCurrentUser } from "./session";

let t: TestDb;
let app: AppAuth;
let userId: string;
const credentials = { email: "someone@example.com", password: "correct horse battery" };

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, { ...credentials, name: "Someone", role: "moderator" });
});
afterEach(() => t.cleanup());

const disable = () =>
  t.db
    .updateTable("user")
    .set({ disabled_at: toDbDate(new Date(), t.dialect) })
    .where("id", "=", userId)
    .execute();

const signIn = async () => {
  const { headers } = await app.auth.api.signInEmail({ body: credentials, returnHeaders: true });
  return cookieHeaders(headers.get("set-cookie"));
};

const sessionCount = async () => {
  const row = await t.db
    .selectFrom("session")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("user_id", "=", userId)
    .executeTakeFirstOrThrow();
  return Number(row.n);
};

describe("getCurrentUser", () => {
  it("returns the signed-in user with their role, and null without a session", async () => {
    const headers = await signIn();
    expect(await getCurrentUser(headers, app)).toEqual({
      id: userId,
      email: credentials.email,
      name: "Someone",
      role: "moderator",
    });
    expect(await getCurrentUser(new Headers(), app)).toBeNull();
    expect(
      await getCurrentUser(new Headers({ cookie: "ronne.session_token=forged.x" }), app),
    ).toBeNull();
  });
});

describe("disabled users", () => {
  it("can't sign in, and no session is created", async () => {
    await disable();
    await expect(app.auth.api.signInEmail({ body: credentials })).rejects.toThrow();
    expect(await sessionCount()).toBe(0);
  });

  it("lose access at once, even with a valid session cookie", async () => {
    const headers = await signIn();
    expect(await getCurrentUser(headers, app)).not.toBeNull();
    await disable();
    expect(await getCurrentUser(headers, app)).toBeNull();
  });
});
