import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { loadMemberships } from "../../identity/repositories/memberships";
import { createTestUser, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { GLOBAL_WORKSPACE_ID } from "../models/workspace";
import { kyselyWorkspaceRepository } from "./kysely-workspace-repository";
import { loadViewer } from "./viewer";

// The viewer as a request builds it (093): every workspace's visibility, against the memberships.
let t: TestDb;
let app: AppAuth;
let acme: string;
let beta: string;
const password = "correct horse battery";

const insert = (name: string, visibility: "public" | "private") =>
  kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name,
    description: `${name}.`,
    visibility,
    createdBy: null,
    createdAt: new Date(),
  });

const viewerFor = async (id: string, role: "root" | "user" = "user") =>
  loadViewer(t.db, { id, role, workspaces: await loadMemberships(t.db, id) });

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  acme = await insert("acme", "private");
  beta = await insert("beta", "public");
});
afterEach(() => t.cleanup());

describe("loadViewer (093)", () => {
  it("sees global, the public workspaces and the private ones the user is in", async () => {
    const memberId = await createTestUser(app, { email: "m@example.com", password });
    await setWorkspaceRole(app, memberId, "user", acme);
    const outsiderId = await createTestUser(app, { email: "o@example.com", password });

    const member = await viewerFor(memberId);
    expect(member.workspaceIds).toEqual([acme, beta, GLOBAL_WORKSPACE_ID].sort());
    expect(member.privateWorkspaceIds).toEqual([acme]);

    const outsider = await viewerFor(outsiderId);
    expect(outsider.workspaceIds).toEqual([beta, GLOBAL_WORKSPACE_ID].sort());
    expect(outsider.privateWorkspaceIds).toEqual([]);
  });

  it("gives root every workspace", async () => {
    const rootId = await createTestUser(app, { email: "r@example.com", password, role: "root" });
    const root = await viewerFor(rootId, "root");
    expect(root.root).toBe(true);
    expect(root.workspaceIds).toEqual([acme, beta, GLOBAL_WORKSPACE_ID].sort());
    expect(root.privateWorkspaceIds).toEqual([acme]);
  });

  it("treats a visibility it doesn't know as private, close ones too, and nobody signed out sees nothing", async () => {
    const outsiderId = await createTestUser(app, { email: "o@example.com", password });
    for (const odd of ["secret", "Public", "public ", "PUBLIC"]) {
      await t.db
        .updateTable("workspaces")
        .set({ visibility: odd as "private" })
        .where("id", "=", beta)
        .execute();
      expect((await viewerFor(outsiderId)).workspaceIds, odd).toEqual([GLOBAL_WORKSPACE_ID]);
    }
    expect((await loadViewer(t.db, null)).workspaceIds).toEqual([]);
  });
});
