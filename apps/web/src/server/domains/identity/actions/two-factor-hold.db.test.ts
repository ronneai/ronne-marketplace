import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createPersonalWorkspace } from "../../../db/personal-workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { ForbiddenError } from "../exceptions/errors";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, setWorkspaceRole, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import { signIn } from "./session";
import { confirmTwoFactor, mustEnrol, startTwoFactor, twoFactorCoverage } from "./two-factor";

// Feature 105, task 6: who root's requirement holds, and the counts root sees.
let t: TestDb;
let app: AppAuth;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 1000 }) });
});
afterEach(() => t.cleanup());

const session = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok || result.twoFactor) throw new Error("not signed in");
  return cookieHeaders(result.headers.get("set-cookie"));
};

/** A workspace that isn't anyone's personal one. */
const sharedWorkspace = async (name: string) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name,
      description: "",
      visibility: "public",
      is_global: 0,
      owner_id: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
};

/** The people the requirements tell apart, each signed in. */
const people = async () => {
  const user = await createTestUser(app, { email: "user@example.com", password });
  const moderator = await createTestUser(app, { email: "moderator@example.com", password });
  await setWorkspaceRole(app, moderator, "moderator", await sharedWorkspace("team"));
  const admin = await createTestUser(app, { email: "admin@example.com", password });
  await setWorkspaceRole(app, admin, "admin", await sharedWorkspace("ops"));
  const personal = await createTestUser(app, { email: "personal@example.com", password });
  await createPersonalWorkspace(
    t.db,
    t.dialect,
    { id: personal, email: "personal@example.com" },
    new Date(),
  );
  await createTestUser(app, { email: "root@example.com", password, role: "root" });
  return {
    user: await session("user@example.com"),
    moderator: await session("moderator@example.com"),
    admin: await session("admin@example.com"),
    personal: await session("personal@example.com"),
    root: await session("root@example.com"),
  };
};

describe("mustEnrol", () => {
  it("holds whom each requirement covers, and nobody under optional", async () => {
    const who = await people();
    const held = async (requirement: "optional" | "reviewers" | "everyone") =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(who).map(async ([name, headers]) => [
            name,
            await mustEnrol(headers, requirement, app),
          ]),
        ),
      );
    expect(await held("optional")).toEqual({
      user: false,
      moderator: false,
      admin: false,
      personal: false,
      root: false,
    });
    // Reviewers: root and shared workspaces' moderators and admins; a personal workspace's admin isn't.
    expect(await held("reviewers")).toEqual({
      user: false,
      moderator: true,
      admin: true,
      personal: false,
      root: true,
    });
    expect(await held("everyone")).toEqual({
      user: true,
      moderator: true,
      admin: true,
      personal: true,
      root: true,
    });
  });

  it("lets go once two-factor is on", async () => {
    await createTestUser(app, { email: "someone@example.com", password });
    const headers = await session("someone@example.com");
    expect(await mustEnrol(headers, "everyone", app)).toBe(true);
    const started = await startTwoFactor(headers, { password }, app);
    if (!started.ok) throw new Error(started.error);
    const on = await confirmTwoFactor(
      headers,
      { code: totpCode(started.uri), uri: started.uri },
      app,
    );
    if (!on.ok) throw new Error(on.error);
    expect(await mustEnrol(cookieHeaders(on.headers.get("set-cookie")), "everyone", app)).toBe(
      false,
    );
  });

  it("never holds an account with no password (company sign-in), or someone signed out", async () => {
    const id = await createTestUser(app, { email: "sso@example.com", password });
    const headers = await session("sso@example.com");
    await t.db.updateTable("account").set({ password: null }).where("user_id", "=", id).execute();
    expect(await mustEnrol(headers, "everyone", app)).toBe(false);
    expect(await mustEnrol(new Headers(), "everyone", app)).toBe(false);
  });

  it("holds an enrolment started but not confirmed", async () => {
    await createTestUser(app, { email: "half@example.com", password });
    const headers = await session("half@example.com");
    const started = await startTwoFactor(headers, { password }, app);
    expect(started.ok).toBe(true);
    expect(await mustEnrol(headers, "everyone", app)).toBe(true);
  });
});

describe("twoFactorCoverage", () => {
  it("counts who each requirement covers and who hasn't enrolled, for root only", async () => {
    const who = await people();
    // One reviewer with two-factor on.
    const started = await startTwoFactor(who.moderator, { password }, app);
    if (!started.ok) throw new Error(started.error);
    await confirmTwoFactor(who.moderator, { code: totpCode(started.uri), uri: started.uri }, app);
    // A disabled account isn't counted.
    const gone = await createTestUser(app, { email: "gone@example.com", password });
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", gone)
      .execute();
    expect(await twoFactorCoverage(who.root, app)).toEqual({
      reviewers: { covered: 3, unenrolled: 2 },
      everyone: { covered: 5, unenrolled: 4 },
    });
    await expect(twoFactorCoverage(who.admin, app)).rejects.toThrow(ForbiddenError);
    await expect(twoFactorCoverage(new Headers(), app)).rejects.toThrow(ForbiddenError);
  });

  it("counts enrolled as the hold reads it: the flag and a confirmed record", async () => {
    const who = await people();
    // The flag on with the record still unconfirmed (out of step): not enrolled for either.
    const started = await startTwoFactor(who.admin, { password }, app);
    if (!started.ok) throw new Error(started.error);
    await t.db
      .updateTable("user")
      .set({ two_factor_enabled: toDbBoolean(true, t.dialect) })
      .where("email", "=", "admin@example.com")
      .execute();
    expect(await mustEnrol(who.admin, "reviewers", app)).toBe(true);
    expect(await twoFactorCoverage(who.root, app)).toEqual({
      reviewers: { covered: 3, unenrolled: 3 },
      everyone: { covered: 5, unenrolled: 5 },
    });
  });
});
