import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { InvalidGroupMappingError } from "../exceptions/errors";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import {
  createProvider,
  enableProvider,
  getProvider,
  type IdentityProviderDeps,
  listGroupMappings,
  markProviderTested,
  updateProvider,
} from "../services/identity-providers";
import { type FakeOidc, followAuthorize, startFakeOidc } from "../testing/fake-oidc-server";
import { createTestUser, testAppAuth } from "../testing/test-auth";
import { completeSsoSignIn, SSO_STATE_COOKIE, startSsoSignIn } from "./sso";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let fake: FakeOidc;
let root: CurrentUser;
let deps: IdentityProviderDeps;
let eng: string;
let ops: string;
const limiter = new LoginRateLimiter({ max: 10_000 });
const actor = () => ({ user: root, ip: null });

const insertWorkspace = async (name: string, ownerId: string | null = null) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name,
      description: `${name}.`,
      visibility: "private",
      is_global: toDbBoolean(false, t.dialect),
      owner_id: ownerId,
      created_by: null,
      created_at: now,
      updated_at: now,
    } as never)
    .execute();
  return id;
};

const providerInput = (mappings?: unknown) => ({
  preset: "okta",
  name: "Acme SSO",
  config: { issuer: fake.issuer, clientId: fake.clientId, scopes: "openid email profile groups" },
  domains: "acme.com",
  linkByEmail: true,
  groupsClaim: "groups",
  ...(mappings === undefined ? {} : { mappings }),
});

const setMappings = async (mappings: { group: string; workspaceId: string; role: string }[]) => {
  const p = await getProvider(deps, actor(), "acme");
  await updateProvider(deps, actor(), "acme", providerInput(mappings), p.updatedAt);
  // The mappings don't need a new test, but an edit of the scopes would: keep it on.
  const after = await getProvider(deps, actor(), "acme");
  if (!after.enabled) {
    await markProviderTested(deps, actor(), "acme", after.updatedAt);
    await enableProvider(deps, actor(), "acme");
  }
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  fake = await startFakeOidc();
  const rootId = await createTestUser(app, {
    email: "root@acme.com",
    password: "correct horse battery",
    role: "root",
  });
  root = { id: rootId, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  deps = {
    repo: kyselyIdentityProviderRepository(t.db, t.dialect),
    types: PROVIDER_TYPES,
    authSecret: "test-secret-test-secret-test-secret-00",
  };
  eng = await insertWorkspace("eng");
  ops = await insertWorkspace("ops");
  const created = await createProvider(deps, actor(), "acme", {
    type: "oidc",
    ...providerInput(),
    config: { ...providerInput().config, clientSecret: fake.clientSecret },
  });
  await markProviderTested(deps, actor(), "acme", created.updatedAt);
  await enableProvider(deps, actor(), "acme");
});
afterEach(async () => {
  await fake.close();
  await t.cleanup();
});

const signIn = async () => {
  const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
  if (!started.ok) throw new Error(`not started: ${started.error}`);
  const back = await followAuthorize(started.url);
  return completeSsoSignIn(
    new Request(back.href, { headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` } }),
    "acme",
    app,
    { limiter },
  );
};

const memberships = async (email: string) => {
  const rows = await t.db
    .selectFrom("workspace_members as m")
    .innerJoin("user as u", "u.id", "m.user_id")
    .innerJoin("workspaces as w", "w.id", "m.workspace_id")
    .select(["w.name", "m.role", "m.source", "w.owner_id"])
    .where("u.email", "=", email)
    .execute();
  return Object.fromEntries(
    rows
      .filter((r) => r.owner_id === null)
      .map((r) => [r.name, `${r.role}${r.source ? ` (${r.source})` : ""}`]),
  );
};

const memberEvents = async () =>
  (await listAuditEvents(t.db, t.dialect, { group: "workspace", dir: "asc" })).events.map(
    (e): Record<string, unknown> => ({ action: e.action, ...e.metadata }),
  );

describe("groups at sign-in", () => {
  it("adds the memberships of the groups the person is in, marked as the provider's, and audits each", async () => {
    await setMappings([
      { group: "engineering", workspaceId: eng, role: "user" },
      { group: "ops", workspaceId: ops, role: "admin" },
    ]);
    fake.user = { ...fake.user, groups: ["engineering"] };
    await signIn();
    expect(await memberships("ana@acme.com")).toEqual({ global: "user", eng: "user (acme)" });
    expect(await memberEvents()).toEqual([
      {
        action: "workspace.member_added",
        workspace: "eng",
        email: "ana@acme.com",
        role: "user",
        via: "sso",
        provider: "acme",
      },
    ]);
  });

  it("removes what a group gave when the person leaves it, and adds a new group's", async () => {
    await setMappings([
      { group: "engineering", workspaceId: eng, role: "user" },
      { group: "ops", workspaceId: ops, role: "admin" },
    ]);
    fake.user = { ...fake.user, groups: ["engineering"] };
    await signIn();
    fake.user = { ...fake.user, groups: ["ops"] };
    await signIn();
    expect(await memberships("ana@acme.com")).toEqual({ global: "user", ops: "admin (acme)" });
    expect((await memberEvents()).map((e) => `${e.action} ${e.workspace}`)).toEqual([
      "workspace.member_added eng",
      "workspace.member_added ops",
      "workspace.member_removed eng",
    ]);
  });

  it("gives the higher role when two mappings give one workspace, and lowers it when one group goes", async () => {
    await setMappings([
      { group: "engineering", workspaceId: eng, role: "user" },
      { group: "eng-leads", workspaceId: eng, role: "moderator" },
    ]);
    fake.user = { ...fake.user, groups: ["engineering", "eng-leads"] };
    await signIn();
    expect((await memberships("ana@acme.com")).eng).toBe("moderator (acme)");
    fake.user = { ...fake.user, groups: ["engineering"] };
    await signIn();
    expect((await memberships("ana@acme.com")).eng).toBe("user (acme)");
    expect((await memberEvents()).at(-1)).toMatchObject({
      action: "workspace.member_role_changed",
      from: "moderator",
      to: "user",
      via: "sso",
    });
  });

  it("never touches a membership root set by hand, even to raise or lower it", async () => {
    const id = await createTestUser(app, {
      email: "ana@acme.com",
      password: "correct horse battery",
    });
    const now = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("workspace_members")
      .values([
        {
          workspace_id: eng,
          user_id: id,
          role: "user",
          added_by: root.id,
          source: null,
          created_at: now,
          updated_at: now,
        },
        {
          workspace_id: ops,
          user_id: id,
          role: "admin",
          added_by: root.id,
          source: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await setMappings([
      { group: "engineering", workspaceId: eng, role: "admin" },
      { group: "ops", workspaceId: ops, role: "user" },
    ]);
    fake.user = { ...fake.user, groups: ["engineering", "ops"] };
    await signIn();
    fake.user = { ...fake.user, groups: [] };
    await signIn();
    expect(await memberships("ana@acme.com")).toEqual({
      global: "user",
      eng: "user",
      ops: "admin",
    });
    expect(await memberEvents()).toEqual([]);
  });

  it("leaves a group-given membership alone once root changes it by hand", async () => {
    await setMappings([{ group: "ops", workspaceId: ops, role: "admin" }]);
    fake.user = { ...fake.user, groups: ["ops"] };
    await signIn();
    const user = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    // What Members' change of role writes (092).
    await kyselyWorkspaceRepository(t.db, t.dialect).putMember({
      workspaceId: ops,
      userId: user.id,
      role: "user",
      addedBy: root.id,
      at: new Date(),
    });
    await signIn();
    expect((await memberships("ana@acme.com")).ops).toBe("user");
    fake.user = { ...fake.user, groups: [] };
    await signIn();
    expect((await memberships("ana@acme.com")).ops).toBe("user");
  });

  it("removes what a mapping gave once root deletes the last mapping", async () => {
    await setMappings([{ group: "ops", workspaceId: ops, role: "admin" }]);
    fake.user = { ...fake.user, groups: ["ops"] };
    await signIn();
    await setMappings([]);
    await signIn();
    expect(await memberships("ana@acme.com")).toEqual({ global: "user" });
  });

  it("takes over the plain global row, and gives it back as a hand-set user (nobody leaves global)", async () => {
    await setMappings([{ group: "mods", workspaceId: GLOBAL_WORKSPACE_ID, role: "moderator" }]);
    fake.user = { ...fake.user, groups: ["mods"] };
    await signIn();
    expect((await memberships("ana@acme.com")).global).toBe("moderator (acme)");
    fake.user = { ...fake.user, groups: [] };
    await signIn();
    expect((await memberships("ana@acme.com")).global).toBe("user");
  });

  it("skips a mapping whose workspace was deleted, and the form warns about it", async () => {
    await setMappings([{ group: "engineering", workspaceId: eng, role: "admin" }]);
    await t.db.deleteFrom("workspaces").where("id", "=", eng).execute();
    expect(await listGroupMappings(deps, actor(), "acme")).toEqual([
      {
        group: "engineering",
        workspaceId: null,
        workspaceName: null,
        role: "admin",
        warning: "workspace_deleted",
      },
    ]);
    fake.user = { ...fake.user, groups: ["engineering"] };
    await signIn();
    expect(await memberships("ana@acme.com")).toEqual({ global: "user" });
  });

  it("never changes root", async () => {
    await setMappings([
      { group: "engineering", workspaceId: eng, role: "admin" },
      { group: "mods", workspaceId: GLOBAL_WORKSPACE_ID, role: "moderator" },
    ]);
    fake.user = {
      sub: "sub-root",
      email: "root@acme.com",
      emailVerified: true,
      name: "Root",
      groups: ["engineering", "mods"],
    };
    await signIn();
    const rows = await t.db
      .selectFrom("workspace_members")
      .select("workspace_id")
      .where("user_id", "=", root.id)
      .execute();
    expect(
      rows.filter((r) => r.workspace_id === eng || r.workspace_id === GLOBAL_WORKSPACE_ID),
    ).toEqual([]);
    expect(await memberEvents()).toEqual([]);
  });

  it("changes nothing when the provider sends no groups claim (missing isn't 'in no group')", async () => {
    await setMappings([{ group: "engineering", workspaceId: eng, role: "user" }]);
    fake.user = { ...fake.user, groups: ["engineering"] };
    await signIn();
    fake.user = { ...fake.user, groups: undefined };
    await signIn();
    expect((await memberships("ana@acme.com")).eng).toBe("user (acme)");
  });
});

describe("root's mappings", () => {
  it("are saved with the provider, named in its update event, and listed with names", async () => {
    await setMappings([{ group: "Engineering", workspaceId: eng, role: "moderator" }]);
    expect(await listGroupMappings(deps, actor(), "acme")).toEqual([
      {
        group: "Engineering",
        workspaceId: eng,
        workspaceName: "eng",
        role: "moderator",
        warning: null,
      },
    ]);
    const updated = (
      await listAuditEvents(t.db, t.dialect, { group: "instance", dir: "asc" })
    ).events.filter((e) => e.action === "instance.auth_provider_updated");
    expect(updated.at(-1)?.metadata).toMatchObject({ changed: ["group mappings"] });
  });

  it("refuse a personal workspace, a missing workspace, an empty group and an unknown role", async () => {
    const personal = await insertWorkspace("ana-personal", root.id);
    for (const [mapping, reason] of [
      [{ group: "x", workspaceId: personal, role: "user" }, "personal"],
      [{ group: "x", workspaceId: "nope", role: "user" }, "workspace"],
      [{ group: " ", workspaceId: eng, role: "user" }, "group"],
      [{ group: "x".repeat(256), workspaceId: eng, role: "user" }, "group"],
      [{ group: "x", workspaceId: eng, role: "root" }, "role"],
    ] as const) {
      const p = await getProvider(deps, actor(), "acme");
      const error = await updateProvider(
        deps,
        actor(),
        "acme",
        providerInput([mapping]),
        p.updatedAt,
      ).catch((e) => e);
      expect(error).toBeInstanceOf(InvalidGroupMappingError);
      expect(error.reason).toBe(reason);
    }
    expect(await listGroupMappings(deps, actor(), "acme")).toEqual([]);
  });
});
