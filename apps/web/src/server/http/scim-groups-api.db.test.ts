import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { listAuditEvents, recordAudit } from "../domains/audit/actions/audit";
import { createRoot } from "../domains/identity/actions/root-account";
import { createScimLimiters, type ScimLimiters } from "../domains/identity/actions/scim";
import { ScimRequestError } from "../domains/identity/models/scim-user";
import type { CurrentUser } from "../domains/identity/models/user";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyIdentityRepository } from "../domains/identity/repositories/kysely-identity-repository";
import { kyselyScimGroupRepository } from "../domains/identity/repositories/kysely-scim-group-repository";
import { kyselyScimTokenRepository } from "../domains/identity/repositories/kysely-scim-token-repository";
import { kyselySsoRepository } from "../domains/identity/repositories/kysely-sso-repository";
import { createScimGroup } from "../domains/identity/services/scim-groups";
import { createScimToken, disableScim, enableScim } from "../domains/identity/services/scim-tokens";
import { testAppAuth } from "../domains/identity/testing/test-auth";
import { handleScim } from "./scim-api";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Every request goes through the real guard with the provider's token, as a provider's would.
let t: TestDb;
let app: AppAuth;
let limiters: ScimLimiters;
let clock: Date;
let root: CurrentUser;
let token: string;
let eng: string;
let ops: string;
const BASE = "http://localhost:3000/api/v1/scim/v2";
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

type Json = Record<string, unknown>;

const insertProvider = async (id: string) => {
  const at = toDbDate(clock, t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "entra",
      name: id,
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: at,
      updated_at: at,
    })
    .execute();
};

const tokenFor = async (providerId: string) => {
  const deps = { repo: kyselyScimTokenRepository(t.db, t.dialect), now: () => clock };
  await enableScim(deps, { user: root, ip: null }, providerId);
  return (await createScimToken(deps, { user: root, ip: null }, providerId)).token;
};

const insertWorkspace = async (name: string) => {
  const id = newId();
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name,
      description: "A team.",
      visibility: "public",
      is_global: 0,
      owner_id: null,
      created_by: null,
      created_at: toDbDate(clock, t.dialect),
      updated_at: toDbDate(clock, t.dialect),
    } as never)
    .execute();
  return id;
};

const map = async (
  providerId: string,
  group: string,
  workspaceId: string,
  role: "user" | "moderator" | "admin",
) =>
  t.db
    .insertInto("provider_group_mappings")
    .values({
      id: newId(),
      provider_id: providerId,
      group_name: group,
      workspace_id: workspaceId,
      role,
      created_at: toDbDate(clock, t.dialect),
    })
    .execute();

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date("2026-10-18T12:00:00.000Z");
  limiters = createScimLimiters(() => clock.getTime());
  const a = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id: a.id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  await insertProvider("acme");
  token = await tokenFor("acme");
  eng = await insertWorkspace("eng");
  ops = await insertWorkspace("ops");
});
afterEach(() => t.cleanup());

const call = async (
  method: string,
  path: string,
  body?: unknown,
  init: { token?: string } = {},
) => {
  const response = await handleScim(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${init.token ?? token}`,
        ...(body !== undefined ? { "content-type": "application/scim+json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    app,
    { limiters, now: () => clock },
  );
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    json: (text ? JSON.parse(text) : null) as Json,
  };
};

const expectScimError = (r: { status: number; json: Json }, status: number, scimType?: string) => {
  expect(r.status).toBe(status);
  expect(r.json.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
  if (scimType) expect(r.json.scimType).toBe(scimType);
};

/** A SCIM user of acme (or another provider), its link id, and its account id. */
const user = async (email: string, init: { token?: string } = {}) => {
  const r = await call(
    "POST",
    "/Users",
    { schemas: [USER], userName: email, externalId: `ext-${email}`, name: { givenName: email } },
    init,
  );
  expect(r.status).toBe(201);
  const row = await t.db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  return { link: r.json.id as string, account: row.id };
};

/** The account's memberships outside `global` and its personal workspace, with their source. */
const memberships = async (accountId: string) =>
  (
    await t.db
      .selectFrom("workspace_members")
      .select(["workspace_id", "role", "source"])
      .where("user_id", "=", accountId)
      .execute()
  )
    .filter(
      (m) =>
        m.workspace_id === eng || m.workspace_id === ops || m.workspace_id === GLOBAL_WORKSPACE_ID,
    )
    .map((m) => ({
      workspace: m.workspace_id === eng ? "eng" : m.workspace_id === ops ? "ops" : "global",
      role: m.role,
      source: m.source,
    }))
    .sort((a, b) => a.workspace.localeCompare(b.workspace));

const memberEvents = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 200 })).events
    .filter((e) => e.action.startsWith("workspace.member_"))
    .map((e) => ({ action: e.action, metadata: e.metadata }))
    .reverse();

describe("create, find and read", () => {
  it("creates Entra's group, members and all, and gives them the mapped role, marked as acme's", async () => {
    await map("acme", "Engineers", eng, "moderator");
    const ann = await user("ann@example.com");
    const r = await call("POST", "/Groups", {
      schemas: [GROUP],
      externalId: "g-eng",
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    expect(r.status).toBe(201);
    expect(r.headers.get("location")).toBe(`${BASE}/Groups/${r.json.id}`);
    expect(r.json).toMatchObject({
      schemas: [GROUP],
      externalId: "g-eng",
      displayName: "Engineers",
      members: [{ value: ann.link, display: "ann@example.com", $ref: `${BASE}/Users/${ann.link}` }],
      meta: { resourceType: "Group", location: `${BASE}/Groups/${r.json.id}` },
    });
    expect(await memberships(ann.account)).toEqual([
      { workspace: "eng", role: "moderator", source: "acme" },
      { workspace: "global", role: "user", source: null },
    ]);
    expect(await memberEvents()).toEqual([
      {
        action: "workspace.member_added",
        metadata: {
          workspace: "eng",
          email: "ann@example.com",
          role: "moderator",
          via: "scim",
          provider: "acme",
        },
      },
    ]);
    // The user's resource lists the group.
    expect((await call("GET", `/Users/${ann.link}`)).json.groups).toEqual([
      { value: r.json.id, display: "Engineers" },
    ]);
  });

  it("matches a mapping by the group's externalId too (Entra's groups claim names object ids)", async () => {
    await map("acme", "0b6f-object-id", eng, "user");
    const ann = await user("ann@example.com");
    await call("POST", "/Groups", {
      schemas: [GROUP],
      externalId: "0b6f-object-id",
      displayName: "Engineering team",
      members: [{ value: ann.link }],
    });
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "user",
      source: "acme",
    });
  });

  it("stores a group no mapping names, and gives nothing", async () => {
    const ann = await user("ann@example.com");
    const r = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Unmapped",
      members: [{ value: ann.link }],
    });
    expect(r.status).toBe(201);
    expect(await memberships(ann.account)).toEqual([
      { workspace: "global", role: "user", source: null },
    ]);
  });

  it("finds groups by displayName, externalId and id, leaves members out on request, and pages", async () => {
    const ann = await user("ann@example.com");
    const a = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      externalId: "g-1",
      members: [{ value: ann.link }],
    });
    clock = new Date(clock.getTime() + 1000);
    const b = await call("POST", "/Groups", { schemas: [GROUP], displayName: "Ops" });
    const byName = await call(
      "GET",
      `/Groups?filter=${encodeURIComponent('displayName eq "Engineers"')}`,
    );
    expect(byName.json).toMatchObject({ totalResults: 1 });
    expect((byName.json.Resources as Json[])[0]?.id).toBe(a.json.id);
    expect(
      (await call("GET", `/Groups?filter=${encodeURIComponent('displayName eq "engineers"')}`))
        .json,
    ).toMatchObject({ totalResults: 0 });
    expect(
      (await call("GET", `/Groups?filter=${encodeURIComponent('externalId eq "g-1"')}`)).json,
    ).toMatchObject({ totalResults: 1 });
    expect(
      (await call("GET", `/Groups?filter=${encodeURIComponent(`id eq "${b.json.id}"`)}`)).json,
    ).toMatchObject({ totalResults: 1 });
    const lean = await call("GET", `/Groups/${a.json.id}?excludedAttributes=members`);
    expect(lean.json.members).toBeUndefined();
    expect((await call("GET", `/Groups/${a.json.id}`)).json.members).toHaveLength(1);
    const page = await call("GET", "/Groups?startIndex=2&count=1&excludedAttributes=members");
    expect(page.json).toMatchObject({ totalResults: 2, startIndex: 2, itemsPerPage: 1 });
    expect((page.json.Resources as Json[])[0]?.id).toBe(b.json.id);
    expectScimError(
      await call("GET", `/Groups?filter=${encodeURIComponent('displayName co "Eng"')}`),
      400,
      "invalidFilter",
    );
    expectScimError(await call("GET", "/Groups/01NOPE"), 404);
  });

  it("refuses a duplicate externalId, a missing name, and an unknown or deleted member", async () => {
    const ann = await user("ann@example.com");
    expect(
      (await call("POST", "/Groups", { schemas: [GROUP], displayName: "A", externalId: "g-1" }))
        .status,
    ).toBe(201);
    expectScimError(
      await call("POST", "/Groups", { schemas: [GROUP], displayName: "B", externalId: "g-1" }),
      409,
      "uniqueness",
    );
    expectScimError(await call("POST", "/Groups", { schemas: [GROUP] }), 400, "invalidValue");
    expectScimError(
      await call("POST", "/Groups", {
        schemas: [GROUP],
        displayName: "C",
        members: [{ value: "01NOPE" }],
      }),
      400,
      "invalidValue",
    );
    await call("DELETE", `/Users/${ann.link}`);
    expectScimError(
      await call("POST", "/Groups", {
        schemas: [GROUP],
        displayName: "D",
        members: [{ value: ann.link }],
      }),
      400,
      "invalidValue",
    );
    // Nothing half made: one group.
    expect((await call("GET", "/Groups")).json).toMatchObject({ totalResults: 1 });
  });
});

describe("members", () => {
  it("adds and removes members in Entra's path form and Okta's value form, each change applied", async () => {
    await map("acme", "Engineers", eng, "admin");
    const ann = await user("ann@example.com");
    const bob = await user("bob@example.com");
    const g = await call("POST", "/Groups", { schemas: [GROUP], displayName: "Engineers" });
    const id = g.json.id as string;
    // Entra: Add with a path.
    expect(
      (
        await call("PATCH", `/Groups/${id}`, {
          schemas: [PATCH],
          Operations: [
            { op: "Add", path: "members", value: [{ value: ann.link }, { value: bob.link }] },
          ],
        })
      ).status,
    ).toBe(200);
    expect(await memberships(bob.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    // Entra: Remove with a member filter.
    await call("PATCH", `/Groups/${id}`, {
      schemas: [PATCH],
      Operations: [{ op: "Remove", path: `members[value eq "${bob.link}"]` }],
    });
    expect((await memberships(bob.account)).map((m) => m.workspace)).toEqual(["global"]);
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    // Okta: remove with a value list, then replace everything.
    await call("PATCH", `/Groups/${id}`, {
      schemas: [PATCH],
      Operations: [{ op: "remove", path: "members", value: [{ value: ann.link }] }],
    });
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
    const replaced = await call("PATCH", `/Groups/${id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { members: [{ value: bob.link }] } }],
    });
    expect((replaced.json.members as Json[]).map((m) => m.value)).toEqual([bob.link]);
    expect(await memberships(bob.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    // Removing someone who isn't there is no error; removing all empties it.
    expect(
      (
        await call("PATCH", `/Groups/${id}`, {
          schemas: [PATCH],
          Operations: [{ op: "remove", path: `members[value eq "${ann.link}"]` }],
        })
      ).status,
    ).toBe(200);
    await call("PATCH", `/Groups/${id}`, {
      schemas: [PATCH],
      Operations: [{ op: "remove", path: "members" }],
    });
    expect((await memberships(bob.account)).map((m) => m.workspace)).toEqual(["global"]);
    expect((await memberEvents()).map((e) => e.action)).toEqual([
      "workspace.member_added",
      "workspace.member_added",
      "workspace.member_removed",
      "workspace.member_removed",
      "workspace.member_added",
      "workspace.member_removed",
    ]);
  });

  it("gives the higher role when two groups map one workspace, and the other when one goes", async () => {
    await map("acme", "Readers", eng, "user");
    await map("acme", "Leads", eng, "admin");
    const ann = await user("ann@example.com");
    const readers = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Readers",
      members: [{ value: ann.link }],
    });
    const leads = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Leads",
      members: [{ value: ann.link }],
    });
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    await call("PATCH", `/Groups/${leads.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "remove", path: "members" }],
    });
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "user",
      source: "acme",
    });
    await call("DELETE", `/Groups/${readers.json.id}`);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
  });

  it("never changes a membership set by hand, nor removes anyone from global", async () => {
    await map("acme", "Engineers", eng, "admin");
    await map("acme", "Engineers", GLOBAL_WORKSPACE_ID, "moderator");
    const ann = await user("ann@example.com");
    // Ann is a moderator of eng by hand (092).
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: eng,
        user_id: ann.account,
        role: "moderator",
        added_by: root.id,
        source: null,
        created_at: toDbDate(clock, t.dialect),
        updated_at: toDbDate(clock, t.dialect),
      })
      .execute();
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    expect(await memberships(ann.account)).toEqual([
      { workspace: "eng", role: "moderator", source: null },
      { workspace: "global", role: "moderator", source: "acme" },
    ]);
    await call("DELETE", `/Groups/${g.json.id}`);
    // The hand-set row untouched; global back to a hand-set user, not removed.
    expect(await memberships(ann.account)).toEqual([
      { workspace: "eng", role: "moderator", source: null },
      { workspace: "global", role: "user", source: null },
    ]);
  });

  it("skips a root named as a member, and audits it", async () => {
    await map("acme", "Engineers", eng, "admin");
    const ann = await user("ann@example.com");
    await t.db.updateTable("user").set({ role: "root" }).where("id", "=", ann.account).execute();
    const r = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    expect(r.status).toBe(201);
    expect(r.json.members).toEqual([]);
    expect((await memberships(ann.account)).map((m) => m.workspace)).not.toContain("eng");
    const refused = (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.filter(
      (e) => e.action === "scim.request_refused",
    );
    expect(refused.map((e) => e.metadata)).toEqual([{ reason: "root_member", provider: "acme" }]);
  });
});

describe("rename, replace and delete", () => {
  it("re-applies the mappings when a rename changes which ones match", async () => {
    await map("acme", "Engineers", eng, "moderator");
    await map("acme", "Operations", ops, "user");
    const ann = await user("ann@example.com");
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    // Okta's rename: a value object with the id and the new name.
    const r = await call("PATCH", `/Groups/${g.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { id: g.json.id, displayName: "Operations" } }],
    });
    expect(r.json.displayName).toBe("Operations");
    expect(await memberships(ann.account)).toEqual([
      { workspace: "global", role: "user", source: null },
      { workspace: "ops", role: "user", source: "acme" },
    ]);
    // Entra's rename: a path.
    await call("PATCH", `/Groups/${g.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "displayName", value: "Engineers" }],
    });
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "moderator",
      source: "acme",
    });
  });

  it("replaces the name and the members with PUT, members left out meaning none", async () => {
    await map("acme", "Engineers", eng, "user");
    const ann = await user("ann@example.com");
    const bob = await user("bob@example.com");
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    const put = await call("PUT", `/Groups/${g.json.id}`, {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: bob.link }],
    });
    expect((put.json.members as Json[]).map((m) => m.value)).toEqual([bob.link]);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
    expect((await memberships(bob.account)).map((m) => m.workspace)).toEqual(["eng", "global"]);
    await call("PUT", `/Groups/${g.json.id}`, { schemas: [GROUP], displayName: "Engineers" });
    expect((await memberships(bob.account)).map((m) => m.workspace)).toEqual(["global"]);
  });

  it("deletes a group and the memberships it gave; its id is 404 after", async () => {
    await map("acme", "Engineers", eng, "user");
    const ann = await user("ann@example.com");
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    const r = await call("DELETE", `/Groups/${g.json.id}`);
    expect(r.status).toBe(204);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
    expectScimError(await call("GET", `/Groups/${g.json.id}`), 404);
    expectScimError(await call("DELETE", `/Groups/${g.json.id}`), 404);
  });
});

describe("users leaving", () => {
  it("takes a deleted user out of every group and the memberships those gave; active: false keeps them", async () => {
    await map("acme", "Engineers", eng, "admin");
    const ann = await user("ann@example.com");
    const bob = await user("bob@example.com");
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }, { value: bob.link }],
    });
    // Bob deprovisioned by active: false: disabled, memberships kept (Decision 3).
    await call("PATCH", `/Users/${bob.link}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", path: "active", value: false }],
    });
    expect(await memberships(bob.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    // Ann deleted: out of the group and of eng.
    await call("DELETE", `/Users/${ann.link}`);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
    expect(
      ((await call("GET", `/Groups/${g.json.id}`)).json.members as Json[]).map((m) => m.value),
    ).toEqual([bob.link]);
    // Ann comes back by her externalId: a new link, in no group.
    const again = await call("POST", "/Users", {
      schemas: [USER],
      userName: "ann@example.com",
      externalId: "ext-ann@example.com",
    });
    expect(again.status).toBe(201);
    expect(again.json.groups).toEqual([]);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
  });
});

describe("what SCIM never does", () => {
  it("never changes an account promoted to root after it joined a group", async () => {
    await map("acme", "Engineers", eng, "admin");
    await map("acme", "Operations", ops, "user");
    const ann = await user("ann@example.com");
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    await t.db.updateTable("user").set({ role: "root" }).where("id", "=", ann.account).execute();
    await call("PATCH", `/Groups/${g.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", path: "displayName", value: "Operations" }],
    });
    await call("DELETE", `/Groups/${g.json.id}`);
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    expect((await memberships(ann.account)).map((m) => m.workspace)).not.toContain("ops");
  });

  it("refuses a write once SCIM is off, even one already past the guard", async () => {
    await disableScim(
      { repo: kyselyScimTokenRepository(t.db, t.dialect), now: () => clock },
      { user: root, ip: null },
      "acme",
    );
    const write = createScimGroup(
      { repo: kyselyScimGroupRepository(t.db, t.dialect), now: () => clock },
      { providerId: "acme", ip: null },
      { schemas: [GROUP], displayName: "Late" },
      BASE,
    );
    await expect(write).rejects.toMatchObject({ status: 401 });
    await expect(write).rejects.toBeInstanceOf(ScimRequestError);
    expect(await t.db.selectFrom("scim_groups").select("id").execute()).toEqual([]);
  });

  it("keeps the roles an adopted account's sign-in gave until the provider's groups change for it (owner)", async () => {
    await map("acme", "Engineers", eng, "user");
    const identity = kyselyIdentityRepository(t.db, t.dialect);
    const sam = await identity.createUserWithoutPassword(
      { email: "sam@example.com", name: "Sam", role: "user" },
      clock,
    );
    await kyselySsoRepository(t.db, t.dialect).linkAccount(sam, "acme", "sub-sam", clock);
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: sam,
        action: "auth.sso_signed_in",
        target: { type: "user", id: sam },
        metadata: { provider: "acme" },
      },
      clock,
    );
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: eng,
        user_id: sam,
        role: "admin",
        added_by: null,
        source: "acme",
        created_at: toDbDate(clock, t.dialect),
        updated_at: toDbDate(clock, t.dialect),
      })
      .execute();
    const adopted = await call("POST", "/Users", {
      schemas: [USER],
      userName: "sam@example.com",
      externalId: "sam",
    });
    expect(adopted.status).toBe(201);
    expect(await memberships(sam)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "acme",
    });
    // The provider's first group change for Sam applies SCIM's groups: Engineers gives eng as a user.
    await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: adopted.json.id }],
    });
    expect(await memberships(sam)).toContainEqual({
      workspace: "eng",
      role: "user",
      source: "acme",
    });
  });

  it("takes a deleted user out of memberships the provider's sign-in gave before SCIM, so a re-create starts in none", async () => {
    const ann = await user("ann@example.com");
    // 106's sign-in gave Ann eng before SCIM; she is in no SCIM group.
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: eng,
        user_id: ann.account,
        role: "admin",
        added_by: null,
        source: "acme",
        created_at: toDbDate(clock, t.dialect),
        updated_at: toDbDate(clock, t.dialect),
      })
      .execute();
    await call("DELETE", `/Users/${ann.link}`);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
    const again = await call("POST", "/Users", {
      schemas: [USER],
      userName: "ann@example.com",
      externalId: "ext-ann@example.com",
    });
    expect(again.status).toBe(201);
    expect((await memberships(ann.account)).map((m) => m.workspace)).toEqual(["global"]);
  });
});

describe("providers", () => {
  it("keeps each provider's groups to itself", async () => {
    await insertProvider("other");
    const otherToken = await tokenFor("other");
    const ann = await user("ann@example.com");
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    expect((await call("GET", "/Groups", undefined, { token: otherToken })).json).toMatchObject({
      totalResults: 0,
    });
    for (const method of ["GET", "DELETE"])
      expectScimError(
        await call(method, `/Groups/${g.json.id}`, undefined, { token: otherToken }),
        404,
      );
    expectScimError(
      await call(
        "PATCH",
        `/Groups/${g.json.id}`,
        { schemas: [PATCH], Operations: [{ op: "remove", path: "members" }] },
        { token: otherToken },
      ),
      404,
    );
    // Another provider can't name acme's user as its member either.
    expectScimError(
      await call(
        "POST",
        "/Groups",
        { schemas: [GROUP], displayName: "X", members: [{ value: ann.link }] },
        { token: otherToken },
      ),
      400,
      "invalidValue",
    );
    expect(
      ((await call("GET", `/Groups/${g.json.id}`)).json.members as Json[]).map((m) => m.value),
    ).toEqual([ann.link]);
  });

  it("only touches memberships the same provider gave", async () => {
    await insertProvider("other");
    await map("acme", "Engineers", eng, "user");
    const ann = await user("ann@example.com");
    // Another provider's sign-in gave Ann eng as an admin (106).
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: eng,
        user_id: ann.account,
        role: "admin",
        added_by: null,
        source: "other",
        created_at: toDbDate(clock, t.dialect),
        updated_at: toDbDate(clock, t.dialect),
      })
      .execute();
    const g = await call("POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: ann.link }],
    });
    await call("DELETE", `/Groups/${g.json.id}`);
    expect(await memberships(ann.account)).toContainEqual({
      workspace: "eng",
      role: "admin",
      source: "other",
    });
  });
});
