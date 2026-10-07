import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import {
  GlobalWorkspaceError,
  InvalidWorkspaceDescriptionError,
  InvalidWorkspaceNameError,
  InvalidWorkspaceVisibilityError,
  WorkspaceNameTakenError,
  WorkspaceNotEmptyError,
  WorkspaceNotFoundError,
} from "../exceptions/errors";
import { GLOBAL_WORKSPACE_ID } from "../models/workspace";
import {
  createWorkspace,
  deleteWorkspace,
  findWorkspace,
  listWorkspaces,
  pageWorkspaces,
  updateWorkspace,
} from "./workspaces";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asModerator: Headers;
let asUser: Headers;
let rootId: string;
const password = "correct horse battery";

const headersFor = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, { email: "m@example.com", password, role: "moderator" });
  asRoot = await headersFor("root@example.com");
  asModerator = await headersFor("m@example.com");
  asUser = await headersFor("u@example.com");
});
afterEach(() => t.cleanup());

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

/** A scope in the workspace, written directly: creating scopes in a workspace comes in task 3. */
const addScope = async (workspaceId: string, name: string) => {
  await t.db
    .insertInto("scopes")
    .values({
      id: newId(),
      name,
      description: "A scope.",
      created_by: null,
      created_at: toDbDate(new Date(), t.dialect),
      workspace_id: workspaceId,
    })
    .execute();
};

describe("createWorkspace", () => {
  it("creates a public workspace from what root typed, and records it", async () => {
    const workspace = await createWorkspace(
      asRoot,
      { name: "  Acme ", description: " Acme's teams. " },
      app,
    );
    expect(workspace).toMatchObject({
      name: "acme",
      description: "Acme's teams.",
      visibility: "public",
      isGlobal: false,
      scopes: 0,
    });
    expect(await findWorkspace(asRoot, "acme", app)).toMatchObject({
      id: workspace.id,
      createdBy: { id: rootId, email: "root@example.com" },
    });
    const [event] = await events("workspace.created");
    expect(event).toMatchObject({
      actorId: rootId,
      targetType: "workspace",
      targetId: workspace.id,
      metadata: { name: "acme", description: "Acme's teams.", visibility: "public" },
    });
  });

  it("refuses a taken name, whatever the case, and global", async () => {
    await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    await expect(
      createWorkspace(asRoot, { name: "ACME", description: "Again." }, app),
    ).rejects.toThrow(WorkspaceNameTakenError);
    await expect(
      createWorkspace(asRoot, { name: "global", description: "Mine." }, app),
    ).rejects.toThrow(InvalidWorkspaceNameError);
  });

  it("gives the second of two roots creating the same name at once that the name is taken", async () => {
    const results = await Promise.allSettled([
      createWorkspace(asRoot, { name: "race", description: "One." }, app),
      createWorkspace(asRoot, { name: "race", description: "Two." }, app),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [failed] = results.filter((r) => r.status === "rejected");
    expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceNameTakenError);
    expect(await events("workspace.created")).toHaveLength(1);
  });

  it("refuses bad names, reserved names, empty or long descriptions, and private", async () => {
    for (const name of ["", "-acme", "a b", "@acme", "admin", "x".repeat(65)])
      await expect(
        createWorkspace(asRoot, { name, description: "Fine." }, app),
        name,
      ).rejects.toThrow(InvalidWorkspaceNameError);
    for (const description of ["  ", "d".repeat(301)])
      await expect(createWorkspace(asRoot, { name: "acme", description }, app)).rejects.toThrow(
        InvalidWorkspaceDescriptionError,
      );
    await expect(
      createWorkspace(asRoot, { name: "acme", description: "Fine.", visibility: "private" }, app),
    ).rejects.toThrow(InvalidWorkspaceVisibilityError);
    expect(await events("workspace.created")).toEqual([]);
  });

  it("allows a workspace and a scope to share a name", async () => {
    await addScope(GLOBAL_WORKSPACE_ID, "acme");
    await expect(
      createWorkspace(asRoot, { name: "acme", description: "Acme." }, app),
    ).resolves.toMatchObject({ name: "acme" });
  });
});

describe("updateWorkspace", () => {
  it("changes the description, records from and to, and skips an unchanged one", async () => {
    const workspace = await createWorkspace(asRoot, { name: "acme", description: "Old." }, app);
    await updateWorkspace(asRoot, { name: "acme", description: " New. " }, app);
    await updateWorkspace(asRoot, { name: "acme", description: "New." }, app);
    expect((await findWorkspace(asRoot, "acme", app))?.description).toBe("New.");
    const updated = await events("workspace.updated");
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      targetId: workspace.id,
      metadata: { name: "acme", from: "Old.", to: "New." },
    });
  });

  it("finds a workspace by its name as typed, the same way on every database", async () => {
    await createWorkspace(asRoot, { name: "acme", description: "Old." }, app);
    // Lookalikes MySQL's collation would match are refused before the lookup.
    for (const name of ["ａｃｍｅ", "acme\u200b", "@acme", "acmé"])
      await expect(
        updateWorkspace(asRoot, { name, description: "New." }, app),
        name,
      ).rejects.toThrow(WorkspaceNotFoundError);
    expect(await findWorkspace(asRoot, "ａｃｍｅ", app)).toBeNull();
    // Typed as on create (trimmed and lowercased), it's found everywhere.
    await updateWorkspace(asRoot, { name: " ACME ", description: "New." }, app);
    expect((await findWorkspace(asRoot, "Acme", app))?.description).toBe("New.");
    for (const name of ["GLOBAL", " global "])
      await expect(deleteWorkspace(asRoot, { name }, app), name).rejects.toThrow(
        GlobalWorkspaceError,
      );
    await expect(deleteWorkspace(asRoot, { name: "ＧＬＯＢＡＬ" }, app)).rejects.toThrow(
      WorkspaceNotFoundError,
    );
  });

  it("refuses global, an unknown workspace and a bad description", async () => {
    await expect(
      updateWorkspace(asRoot, { name: "global", description: "Mine now." }, app),
    ).rejects.toThrow(GlobalWorkspaceError);
    await expect(
      updateWorkspace(asRoot, { name: "nope", description: "Fine." }, app),
    ).rejects.toThrow(WorkspaceNotFoundError);
    await createWorkspace(asRoot, { name: "acme", description: "Old." }, app);
    await expect(updateWorkspace(asRoot, { name: "acme", description: "" }, app)).rejects.toThrow(
      InvalidWorkspaceDescriptionError,
    );
    expect((await findWorkspace(asRoot, "global", app))?.description).toBe(
      "Everyone on this instance",
    );
    expect(await events("workspace.updated")).toEqual([]);
  });
});

describe("deleteWorkspace", () => {
  it("deletes an empty workspace, and records it", async () => {
    const workspace = await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    await deleteWorkspace(asRoot, { name: "acme" }, app);
    expect(await findWorkspace(asRoot, "acme", app)).toBeNull();
    const [event] = await events("workspace.deleted");
    expect(event).toMatchObject({
      actorId: rootId,
      targetType: "workspace",
      targetId: workspace.id,
      metadata: { name: "acme" },
    });
  });

  it("refuses a workspace that has scopes", async () => {
    const workspace = await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    await addScope(workspace.id, "acme-infra");
    expect((await findWorkspace(asRoot, "acme", app))?.scopes).toBe(1);
    await expect(deleteWorkspace(asRoot, { name: "acme" }, app)).rejects.toThrow(
      WorkspaceNotEmptyError,
    );
    expect(await findWorkspace(asRoot, "acme", app)).not.toBeNull();
    expect(await events("workspace.deleted")).toEqual([]);
  });

  it("refuses global, even with no scopes, and an unknown workspace", async () => {
    await expect(deleteWorkspace(asRoot, { name: "global" }, app)).rejects.toThrow(
      GlobalWorkspaceError,
    );
    await expect(deleteWorkspace(asRoot, { name: "nope" }, app)).rejects.toThrow(
      WorkspaceNotFoundError,
    );
    expect(await findWorkspace(asRoot, "global", app)).toMatchObject({ isGlobal: true });
  });
});

describe("who may", () => {
  it("lets only root create, edit, delete, page and open workspaces", async () => {
    await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    for (const headers of [asModerator, asUser, new Headers()]) {
      await expect(
        createWorkspace(headers, { name: "other", description: "Other." }, app),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        updateWorkspace(headers, { name: "acme", description: "Mine." }, app),
      ).rejects.toThrow(ForbiddenError);
      await expect(deleteWorkspace(headers, { name: "acme" }, app)).rejects.toThrow(ForbiddenError);
      await expect(pageWorkspaces(headers, {}, app)).rejects.toThrow(ForbiddenError);
      await expect(findWorkspace(headers, "acme", app)).rejects.toThrow(ForbiddenError);
    }
    expect((await findWorkspace(asRoot, "acme", app))?.description).toBe("Acme.");
    expect(await events("workspace.updated")).toEqual([]);
    expect(await events("workspace.deleted")).toEqual([]);
  });

  it("lets everyone signed in list them, global first, but nobody signed out", async () => {
    await createWorkspace(asRoot, { name: "zeta", description: "Z." }, app);
    await createWorkspace(asRoot, { name: "acme", description: "A." }, app);
    for (const headers of [asUser, asModerator, asRoot])
      expect((await listWorkspaces(headers, app)).map((w) => w.name)).toEqual([
        "global",
        "acme",
        "zeta",
      ]);
    await expect(listWorkspaces(new Headers(), app)).rejects.toThrow(ForbiddenError);
  });
});

describe("pageWorkspaces", () => {
  it("puts global first on the first page, then sorts and pages the rest", async () => {
    for (const name of ["delta", "alpha", "charlie", "bravo"])
      await createWorkspace(asRoot, { name, description: `The ${name} team.` }, app);
    await addScope(GLOBAL_WORKSPACE_ID, "team");

    const first = await pageWorkspaces(asRoot, { size: 2 }, app);
    expect(first.workspaces.map((w) => w.name)).toEqual(["global", "alpha", "bravo"]);
    expect(first.workspaces[0]?.scopes).toBe(1);
    expect(first.total).toEqual({ count: 5, capped: false });
    expect(first.previous).toBeNull();

    const second = await pageWorkspaces(asRoot, { size: 2, cursor: first.next ?? "" }, app);
    expect(second.workspaces.map((w) => w.name)).toEqual(["charlie", "delta"]);
    expect(second.next).toBeNull();
    // The total is the same on every page.
    expect(second.total).toEqual(first.total);

    // Back to the first page by its cursor: global is there again.
    const back = await pageWorkspaces(asRoot, { size: 2, cursor: second.previous ?? "" }, app);
    expect(back.workspaces.map((w) => w.name)).toEqual(["global", "alpha", "bravo"]);

    const newest = await pageWorkspaces(asRoot, { sort: "created", size: 10 }, app);
    expect(newest.workspaces.map((w) => w.name)).toEqual([
      "global",
      "bravo",
      "charlie",
      "alpha",
      "delta",
    ]);
  });

  it("searches the name and description, global only when it matches", async () => {
    await createWorkspace(asRoot, { name: "acme", description: "Acme's teams." }, app);
    await createWorkspace(asRoot, { name: "zeta", description: "Everyone at Zeta." }, app);
    const byName = await pageWorkspaces(asRoot, { search: "ACME" }, app);
    expect(byName.workspaces.map((w) => w.name)).toEqual(["acme"]);
    expect(byName.total.count).toBe(1);
    const byDescription = await pageWorkspaces(asRoot, { search: "everyone" }, app);
    expect(byDescription.workspaces.map((w) => w.name)).toEqual(["global", "zeta"]);
    expect(byDescription.total.count).toBe(2);
  });
});

describe("moderators (091)", () => {
  it("counts a workspace's active moderators, not root or the disabled", async () => {
    const acme = await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    const moderators = async () => (await findWorkspace(asRoot, "acme", app))?.moderators;
    expect(await moderators()).toBe(0);
    const ids = [] as string[];
    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      const id = await createTestUser(app, { email, password });
      await setWorkspaceRole(app, id, "moderator", acme.id);
      ids.push(id);
    }
    expect(await moderators()).toBe(3);
    await t.db
      .updateTable("user")
      .set({ role: "root" })
      .where("id", "=", ids[0] ?? "")
      .execute();
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", ids[1] ?? "")
      .execute();
    expect(await moderators()).toBe(1);
    expect((await findWorkspace(asRoot, "global", app))?.moderators).toBe(1);
  });
});
