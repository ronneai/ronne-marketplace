import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { can } from "../models/permissions";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, setWorkspaceRole, testAppAuth } from "../testing/test-auth";
import { authenticateToken, createMyToken } from "./access-tokens";
import { getCurrentUser } from "./session";

// The memberships come with the user on every request (091): by session and by access token, and a
// change applies on the next request, with no new sign-in or token.
let t: TestDb;
let app: AppAuth;
let userId: string;
let acme: string;
let asUser: Headers;
const credentials = { email: "someone@example.com", password: "correct horse battery" };

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, credentials);
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme's team.",
    visibility: "public",
    createdBy: null,
    createdAt: new Date(),
  });
  const { headers } = await app.auth.api.signInEmail({ body: credentials, returnHeaders: true });
  asUser = cookieHeaders(headers.get("set-cookie"));
});
afterEach(() => t.cleanup());

describe("memberships with the current user (091)", () => {
  it("come with the session's user, and a change applies on the next request", async () => {
    expect((await getCurrentUser(asUser, app))?.workspaces).toEqual({
      [GLOBAL_WORKSPACE_ID]: "user",
    });
    await setWorkspaceRole(app, userId, "moderator", acme);
    const user = await getCurrentUser(asUser, app);
    expect(user?.workspaces).toEqual({ [GLOBAL_WORKSPACE_ID]: "user", [acme]: "moderator" });
    expect(can(user, "submissions.review", acme)).toBe(true);
    expect(can(user, "submissions.review", GLOBAL_WORKSPACE_ID)).toBe(false);
  });

  it("come with a token's user, and a token in flight sees the change", async () => {
    const { token } = await createMyToken(asUser, { name: "cli" }, app);
    const before = await authenticateToken(token, app);
    expect(before.ok && before.value.user.workspaces).toEqual({ [GLOBAL_WORKSPACE_ID]: "user" });
    await setWorkspaceRole(app, userId, "moderator", acme);
    const after = await authenticateToken(token, app);
    if (!after.ok) throw new Error("token refused");
    expect(can(after.value.user, "versions.manage", acme)).toBe(true);
    expect(can(after.value.user, "versions.manage", GLOBAL_WORKSPACE_ID)).toBe(false);
  });

  it("leave out a role that isn't moderator or user, by session and by token", async () => {
    const { token } = await createMyToken(asUser, { name: "cli" }, app);
    // MODERATOR also checks MySQL's case-insensitive comparison doesn't let it through.
    for (const role of ["admin", "MODERATOR", "root"]) {
      await t.db
        .updateTable("workspace_members")
        .set({ role: role as never })
        .where("user_id", "=", userId)
        .execute();
      expect((await getCurrentUser(asUser, app))?.workspaces, role).toEqual({});
      const viaToken = await authenticateToken(token, app);
      expect(viaToken.ok && viaToken.value.user.workspaces, role).toEqual({});
    }
  });

  it("are gone with the workspace's row", async () => {
    await setWorkspaceRole(app, userId, "moderator", acme);
    await t.db.deleteFrom("workspace_members").where("workspace_id", "=", acme).execute();
    expect((await getCurrentUser(asUser, app))?.workspaces).toEqual({
      [GLOBAL_WORKSPACE_ID]: "user",
    });
  });
});
