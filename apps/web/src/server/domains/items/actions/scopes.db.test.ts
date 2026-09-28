import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import {
  InvalidScopeDescriptionError,
  InvalidScopeNameError,
  ScopeNameTakenError,
  ScopeNotFoundError,
} from "../exceptions/errors";
import { kyselyScopeRepository } from "../repositories/kysely-scope-repository";
import { createScope, findScope, listScopes, updateScopeDescription } from "./scopes";

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
    expect(scope).toMatchObject({ name: "platform", description: "Shared tools." });
    expect((await findScope("platform", app))?.createdBy).toEqual({
      id: rootId,
      email: "root@example.com",
    });
    const [event] = await events("scope.created");
    expect(event).toMatchObject({
      actorId: rootId,
      targetType: "scope",
      targetId: scope.id,
      metadata: { name: "platform", description: "Shared tools." },
    });
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
