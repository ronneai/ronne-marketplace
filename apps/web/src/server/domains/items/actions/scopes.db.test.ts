import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createWorkspace, deleteWorkspace } from "../../workspaces/actions/workspaces";
import { WorkspaceNotEmptyError } from "../../workspaces/exceptions/errors";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import {
  InvalidScopeDescriptionError,
  InvalidScopeNameError,
  ScopeNameTakenError,
  ScopeNotFoundError,
  ScopeWorkspaceNotFoundError,
} from "../exceptions/errors";
import { kyselyScopeRepository } from "../repositories/kysely-scope-repository";
import {
  createScope,
  findScope,
  listScopes,
  listScopesAs,
  pageScopes,
  updateScopeDescription,
} from "./scopes";

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
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
  asUser = await headersFor("u@example.com");
});
afterEach(() => t.cleanup());

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("createScope", () => {
  it("creates a scope from what root typed, and records it", async () => {
    const scope = await createScope(
      asRoot,
      { name: "  @Platform ", description: " Shared tools. " },
      app,
    );
    expect(scope).toMatchObject({
      name: "platform",
      description: "Shared tools.",
      workspace: { id: GLOBAL_WORKSPACE_ID, name: "global" },
    });
    expect((await findScope("platform", app))?.workspace).toEqual({
      id: GLOBAL_WORKSPACE_ID,
      name: "global",
    });
    expect((await findScope("platform", app))?.createdBy).toEqual({
      id: rootId,
      email: "root@example.com",
    });
    const [event] = await events("scope.created");
    expect(event).toMatchObject({
      actorId: rootId,
      targetType: "scope",
      targetId: scope.id,
      metadata: { name: "platform", description: "Shared tools.", workspace: "global" },
    });
  });

  it("creates a scope in the workspace root chose, and records which", async () => {
    const acme = await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    const scope = await createScope(
      asRoot,
      { name: "acme-infra", description: "Infrastructure.", workspaceId: acme.id },
      app,
    );
    expect(scope.workspace).toEqual({ id: acme.id, name: "acme" });
    expect((await findScope("acme-infra", app))?.workspace).toEqual({ id: acme.id, name: "acme" });
    const [event] = await events("scope.created");
    expect(event?.metadata).toEqual({
      name: "acme-infra",
      description: "Infrastructure.",
      workspace: "acme",
    });
    // The workspace now has a scope, so it can't be deleted.
    await expect(deleteWorkspace(asRoot, { name: "acme" }, app)).rejects.toThrow(
      WorkspaceNotEmptyError,
    );
  });

  it("refuses a workspace that doesn't exist, and creates nothing", async () => {
    await expect(
      createScope(
        asRoot,
        { name: "lost", description: "Nowhere.", workspaceId: "01HZZZZZZZZZZZZZZZZZZZZZZZ" },
        app,
      ),
    ).rejects.toThrow(ScopeWorkspaceNotFoundError);
    expect(await findScope("lost", app)).toBeNull();
    expect(await events("scope.created")).toEqual([]);
  });

  it("refuses a duplicate, whatever the case or @", async () => {
    await createScope(asRoot, { name: "team", description: "A team." }, app);
    await expect(
      createScope(asRoot, { name: "@TEAM", description: "Again." }, app),
    ).rejects.toThrow(ScopeNameTakenError);
    expect(await events("scope.created")).toHaveLength(1);
  });

  it("refuses invalid and reserved names, and bad descriptions", async () => {
    for (const [name, problem] of [
      ["", "empty"],
      ["my_team", "characters"],
      ["-team", "edges"],
      ["x".repeat(65), "too_long"],
      ["rmk", "reserved"],
      ["@admin", "reserved"],
    ] as const) {
      await expect(createScope(asRoot, { name, description: "x" }, app)).rejects.toMatchObject({
        constructor: InvalidScopeNameError,
        problem,
      });
    }
    await expect(createScope(asRoot, { name: "ok", description: "  " }, app)).rejects.toThrow(
      InvalidScopeDescriptionError,
    );
    await expect(
      createScope(asRoot, { name: "ok", description: "x".repeat(301) }, app),
    ).rejects.toThrow(InvalidScopeDescriptionError);
  });

  it("is root only", async () => {
    const asModerator = await headersFor("m@example.com");
    for (const headers of [asUser, asModerator, new Headers()]) {
      await expect(createScope(headers, { name: "x", description: "x" }, app)).rejects.toThrow(
        ForbiddenError,
      );
    }
  });
});

describe("updateScopeDescription", () => {
  it("changes the description, records from and to, and does nothing when it's the same", async () => {
    await createScope(asRoot, { name: "team", description: "Old." }, app);
    await updateScopeDescription(asRoot, { name: "team", description: "New." }, app);
    await updateScopeDescription(asRoot, { name: "team", description: "New." }, app);
    expect((await findScope("team", app))?.description).toBe("New.");
    const updated = await events("scope.updated");
    expect(updated.map((e) => e.metadata)).toEqual([{ name: "team", from: "Old.", to: "New." }]);
  });

  it("refuses an unknown scope, and anyone but root", async () => {
    await expect(
      updateScopeDescription(asRoot, { name: "nope", description: "x" }, app),
    ).rejects.toThrow(ScopeNotFoundError);
    await createScope(asRoot, { name: "team", description: "Old." }, app);
    await expect(
      updateScopeDescription(asUser, { name: "team", description: "x" }, app),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("listScopes", () => {
  it("lets everyone signed in list and search scopes in name order, 50 a page", async () => {
    const repo = kyselyScopeRepository(t.db, t.dialect);
    for (let i = 0; i < 52; i++) {
      await repo.insert({
        name: `scope-${String(i).padStart(2, "0")}`,
        description: i === 7 ? "The Security team" : "Another scope",
        workspaceId: GLOBAL_WORKSPACE_ID,
        createdBy: null,
        createdAt: new Date(),
      });
    }
    const first = await listScopes(asUser, {}, app);
    expect(first.scopes).toHaveLength(50);
    expect(first.scopes[0]?.name).toBe("scope-00");
    const second = await listScopes(asUser, { cursor: first.nextCursor ?? "" }, app);
    expect(second.scopes.map((s) => s.name)).toEqual(["scope-50", "scope-51"]);
    expect(second.nextCursor).toBeNull();

    expect(
      (await listScopes(asUser, { search: "SECURITY" }, app)).scopes.map((s) => s.name),
    ).toEqual(["scope-07"]);
    expect((await listScopes(asUser, { search: "%" }, app)).scopes).toEqual([]);
    await expect(listScopes(new Headers(), {}, app)).rejects.toThrow(ForbiddenError);
  });
});

describe("pageScopes (061)", () => {
  it("sorts by name or created, both ways, pages both ways, and counts", async () => {
    const repo = kyselyScopeRepository(t.db, t.dialect);
    const names = ["delta", "alpha", "charlie", "bravo", "echo"];
    for (const [i, name] of names.entries())
      await repo.insert({
        name,
        description: i === 2 ? "Shared tools" : `Scope ${name}`,
        workspaceId: GLOBAL_WORKSPACE_ID,
        createdBy: null,
        createdAt: new Date(),
      });
    const walk = async (query: Parameters<typeof pageScopes>[1]) => {
      const seen: string[] = [];
      let page = await pageScopes(asUser, { ...query, size: 2 }, app);
      expect(page.previous).toBeNull();
      seen.push(...page.scopes.map((s) => s.name));
      while (page.next) {
        page = await pageScopes(asUser, { ...query, size: 2, cursor: page.next }, app);
        seen.push(...page.scopes.map((s) => s.name));
      }
      const back = await pageScopes(
        asUser,
        { ...query, size: 2, cursor: page.previous ?? "" },
        app,
      );
      expect(back.scopes).toHaveLength(2);
      return seen;
    };
    expect(await walk({})).toEqual(["alpha", "bravo", "charlie", "delta", "echo"]);
    expect(await walk({ dir: "desc" })).toEqual(["echo", "delta", "charlie", "bravo", "alpha"]);
    expect(await walk({ sort: "created" })).toEqual([...names].reverse());
    expect(await walk({ sort: "created", dir: "asc" })).toEqual(names);

    const searched = await pageScopes(asUser, { search: "SHARED" }, app);
    expect(searched.scopes.map((s) => s.name)).toEqual(["charlie"]);
    expect(searched.total).toEqual({ count: 1, capped: false });
    expect((await pageScopes(asUser, {}, app)).total).toEqual({ count: 5, capped: false });
  });
});

describe("pageScopes in a workspace (090)", () => {
  it("lists and counts only that workspace's scopes, searched as usual", async () => {
    const acme = await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app);
    for (const name of ["acme-infra", "acme-web"])
      await createScope(asRoot, { name, description: "Acme's.", workspaceId: acme.id }, app);
    await createScope(asRoot, { name: "team", description: "Everyone's." }, app);

    const inAcme = await pageScopes(asRoot, { workspaceId: acme.id }, app);
    expect(inAcme.scopes.map((s) => s.name)).toEqual(["acme-infra", "acme-web"]);
    expect(inAcme.total).toEqual({ count: 2, capped: false });
    const searched = await pageScopes(asRoot, { workspaceId: acme.id, search: "web" }, app);
    expect(searched.scopes.map((s) => s.name)).toEqual(["acme-web"]);
    expect(searched.total.count).toBe(1);
    const inGlobal = await pageScopes(asRoot, { workspaceId: GLOBAL_WORKSPACE_ID }, app);
    expect(inGlobal.scopes.map((s) => s.name)).toEqual(["team"]);
    expect((await pageScopes(asRoot, {}, app)).total.count).toBe(3);
  });
});

describe("listScopesAs", () => {
  it("lists scopes for a token's user of every role, with the API's page size", async () => {
    for (const name of ["alpha", "beta", "gamma"])
      await createScope(asRoot, { name, description: `The ${name} team` }, app);
    const asMod = await headersFor("m@example.com");
    for (const headers of [asUser, asMod, asRoot]) {
      const user = await getCurrentUser(headers, app);
      if (!user) throw new Error("not signed in");
      const first = await listScopesAs(user, { limit: 2 }, app);
      expect(first.scopes.map((s) => s.name)).toEqual(["alpha", "beta"]);
      expect(first.nextCursor).toBe("beta");
      const rest = await listScopesAs(user, { limit: 2, cursor: "beta" }, app);
      expect(rest).toEqual({
        scopes: [expect.objectContaining({ name: "gamma" })],
        nextCursor: null,
      });
      expect((await listScopesAs(user, { search: "gam" }, app)).scopes).toHaveLength(1);
    }
  });
});
