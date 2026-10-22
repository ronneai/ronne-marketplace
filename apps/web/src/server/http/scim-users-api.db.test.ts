import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { listAuditEvents, recordAudit } from "../domains/audit/actions/audit";
import { createRoot } from "../domains/identity/actions/root-account";
import { createScimLimiters, type ScimLimiters } from "../domains/identity/actions/scim";
import { hashToken } from "../domains/identity/models/access-token";
import type { CurrentUser } from "../domains/identity/models/user";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyIdentityRepository } from "../domains/identity/repositories/kysely-identity-repository";
import { kyselyScimTokenRepository } from "../domains/identity/repositories/kysely-scim-token-repository";
import { kyselyScimUserRepository } from "../domains/identity/repositories/kysely-scim-user-repository";
import { kyselySsoRepository } from "../domains/identity/repositories/kysely-sso-repository";
import { createScimToken, enableScim } from "../domains/identity/services/scim-tokens";
import { ADOPTION_WINDOW_MS } from "../domains/identity/services/scim-users";
import { seedErasedUser } from "../domains/identity/testing/erased-user";
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
let erased: { id: string; email: string; name: string };
const BASE = "http://localhost:3000/api/v1/scim/v2";
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const DAY = 24 * 60 * 60 * 1000;

const insertProvider = async (id: string) => {
  const at = toDbDate(clock, t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "entra",
      name: id === "acme" ? "Acme" : "Other",
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
  // An erased account (103) is always there: nothing a provider does may reach or revive it.
  erased = await seedErasedUser(t);
});
afterEach(() => t.cleanup());

type Json = Record<string, unknown>;

const call = async (
  method: string,
  path: string,
  body?: unknown,
  init: { token?: string; contentType?: string } = {},
) => {
  const response = await handleScim(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${init.token ?? token}`,
        ...(body !== undefined
          ? { "content-type": init.contentType ?? "application/scim+json" }
          : {}),
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
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

const entraCreate = (overrides: Json = {}) => ({
  schemas: [USER, ENTERPRISE],
  externalId: "0a21f0f2-8d2a-4f8e-bf98-7363c4aed4ef",
  userName: "Ann@Example.com",
  active: true,
  emails: [{ primary: true, type: "work", value: "Ann@Example.com" }],
  meta: { resourceType: "User" },
  name: { formatted: "Ann Lee", familyName: "Lee", givenName: "Ann" },
  roles: [],
  [ENTERPRISE]: { department: "Eng" },
  ...overrides,
});

const oktaCreate = (overrides: Json = {}) => ({
  schemas: [USER],
  userName: "bob@example.com",
  name: { givenName: "Bob", familyName: "Ng" },
  emails: [{ primary: true, value: "bob@example.com", type: "work" }],
  displayName: "Bob Ng",
  locale: "en-US",
  externalId: "00u1abcd",
  groups: [],
  password: "ignored-Secret1",
  active: true,
  ...overrides,
});

const account = (email: string) =>
  t.db
    .selectFrom("user")
    .select(["id", "email", "name", "role", "disabled_at", "password_change_required_at"])
    .where("email", "=", email)
    .executeTakeFirst();

const events = async (action?: string) =>
  (await listAuditEvents(t.db, t.dialect, { size: 200 })).events
    .filter((e) => !action || e.action === action)
    .map((e) => ({ action: e.action, target: e.targetId, metadata: e.metadata }))
    .reverse();

const expectScimError = (
  r: { status: number; headers: Headers; json: Json },
  status: number,
  scimType?: string,
) => {
  expect(r.status).toBe(status);
  expect(r.headers.get("content-type")).toBe("application/scim+json");
  expect(r.json.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
  expect(r.json.status).toBe(String(status));
  if (scimType) expect(r.json.scimType).toBe(scimType);
};

describe("create", () => {
  it("makes an account from Entra's body: a user in global, a personal workspace, no password", async () => {
    const r = await call("POST", "/Users", entraCreate());
    expect(r.status).toBe(201);
    expect(r.headers.get("location")).toBe(`${BASE}/Users/${r.json.id}`);
    expect(r.json).toMatchObject({
      schemas: [USER],
      externalId: "0a21f0f2-8d2a-4f8e-bf98-7363c4aed4ef",
      userName: "ann@example.com",
      name: { formatted: "Ann Lee", givenName: "Ann", familyName: "Lee" },
      displayName: "Ann Lee",
      emails: [{ value: "ann@example.com", primary: true, type: "work" }],
      active: true,
      groups: [],
      meta: { resourceType: "User", location: `${BASE}/Users/${r.json.id}` },
    });
    const ann = await account("ann@example.com");
    expect(ann).toMatchObject({ name: "Ann Lee", role: "user", disabled_at: null });
    // No password was chosen by anyone, so none is asked to be replaced (128).
    expect(ann?.password_change_required_at).toBeNull();
    // The SCIM id is the link's, not the account's.
    expect(r.json.id).not.toBe(ann?.id);
    const memberships = await t.db
      .selectFrom("workspace_members")
      .select(["workspace_id", "role"])
      .where("user_id", "=", ann?.id ?? "")
      .execute();
    expect(memberships).toContainEqual({ workspace_id: GLOBAL_WORKSPACE_ID, role: "user" });
    const personal = await t.db
      .selectFrom("workspaces")
      .select("id")
      .where("owner_id", "=", ann?.id ?? "")
      .execute();
    expect(personal).toHaveLength(1);
    const credentials = await t.db
      .selectFrom("account")
      .select("id")
      .where("user_id", "=", ann?.id ?? "")
      .execute();
    expect(credentials).toEqual([]);
    expect(await events("user.created")).toEqual([
      {
        action: "user.created",
        target: ann?.id,
        metadata: { via: "scim", provider: "acme", email: "ann@example.com", role: "user" },
      },
    ]);
  });

  it("makes an account from Okta's body, ignoring the password and groups", async () => {
    const r = await call("POST", "/Users", oktaCreate());
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ userName: "bob@example.com", displayName: "Bob Ng" });
    expect((await account("bob@example.com"))?.name).toBe("Bob Ng");
  });

  it("answers the same request twice with 409 uniqueness, on the userName or the externalId", async () => {
    expect((await call("POST", "/Users", entraCreate())).status).toBe(201);
    expectScimError(await call("POST", "/Users", entraCreate()), 409, "uniqueness");
    expectScimError(
      await call("POST", "/Users", entraCreate({ userName: "ann2@example.com" })),
      409,
      "uniqueness",
    );
    expectScimError(
      await call("POST", "/Users", entraCreate({ externalId: "another" })),
      409,
      "uniqueness",
    );
  });

  it("makes a disabled account for active: false, Entra's string included", async () => {
    const r = await call("POST", "/Users", entraCreate({ active: "False" }));
    expect(r.status).toBe(201);
    expect(r.json.active).toBe(false);
    expect((await account("ann@example.com"))?.disabled_at).not.toBeNull();
    expect((await events("user.disabled")).map((e) => e.metadata)).toEqual([
      { via: "scim", provider: "acme", sessionsEnded: 0, tokensRevoked: 0 },
    ]);
  });

  it("refuses a userName that isn't plain ASCII, and a bad body", async () => {
    expectScimError(
      await call("POST", "/Users", entraCreate({ userName: "Kate@example.com" })),
      400,
      "invalidValue",
    );
    expectScimError(
      await call("POST", "/Users", entraCreate({ userName: "ann" })),
      400,
      "invalidValue",
    );
    expectScimError(await call("POST", "/Users", "{not json"), 400, "invalidSyntax");
    expectScimError(await call("POST", "/Users", [1]), 400, "invalidSyntax");
    expect(
      (await call("POST", "/Users", entraCreate(), { contentType: "text/plain" })).status,
    ).toBe(415);
    expect(await account("ann@example.com")).toBeUndefined();
  });

  it("refuses an email that belongs to another account, and a root's with 403", async () => {
    const identity = kyselyIdentityRepository(t.db, t.dialect);
    await identity.createUserWithPassword(
      { email: "cy@example.com", name: "Cy", role: "user", passwordHash: "x" },
      clock,
    );
    expectScimError(
      await call("POST", "/Users", oktaCreate({ userName: "cy@example.com" })),
      409,
      "uniqueness",
    );
    const r = await call("POST", "/Users", oktaCreate({ userName: "root@example.com" }));
    expectScimError(r, 403);
    expect(r.json.detail).toBe("root accounts are managed in Ronne");
    expect(await events("scim.request_refused")).toEqual([
      {
        action: "scim.request_refused",
        target: null,
        metadata: { reason: "root", provider: "acme" },
      },
    ]);
    expect((await account("root@example.com"))?.role).toBe("root");
  });
});

describe("adoption", () => {
  /** An account that signs in through acme (106), as it would after a first sign-in. */
  const signedInAccount = async (email: string, signedInAt: Date, provider = "acme") => {
    const identity = kyselyIdentityRepository(t.db, t.dialect);
    const id = await identity.createUserWithoutPassword(
      { email, name: "Dana Before", role: "user" },
      new Date(signedInAt.getTime() - DAY),
    );
    await kyselySsoRepository(t.db, t.dialect).linkAccount(
      id,
      provider,
      `sub-${email}`,
      signedInAt,
    );
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: id,
        action: "auth.sso_signed_in",
        target: { type: "user", id },
        metadata: { provider },
      },
      signedInAt,
    );
    return id;
  };

  it("adopts an enabled account the provider signed in to within 30 days, exact email, no SCIM link", async () => {
    const id = await signedInAccount("dana@example.com", new Date(clock.getTime() - 29 * DAY));
    const r = await call(
      "POST",
      "/Users",
      oktaCreate({
        userName: "Dana@Example.com",
        externalId: "00u-dana",
        displayName: "Dana After",
      }),
    );
    expect(r.status).toBe(201);
    expect(r.json.userName).toBe("dana@example.com");
    const dana = await account("dana@example.com");
    expect(dana?.id).toBe(id);
    expect(dana?.name).toBe("Dana After");
    expect(await events("user.scim_adopted")).toEqual([
      { action: "user.scim_adopted", target: id, metadata: { via: "scim", provider: "acme" } },
    ]);
    expect(await events("user.created")).toEqual([]);
    // 106's link stays as it was.
    const links = await t.db
      .selectFrom("account")
      .select("account_id")
      .where("user_id", "=", id)
      .execute();
    expect(links).toEqual([{ account_id: "sub-dana@example.com" }]);
    // The account is now this provider's SCIM user.
    expect((await call("GET", `/Users/${r.json.id}`)).json).toMatchObject({ id: r.json.id });
  });

  it("doesn't adopt when the sign-in is older than 30 days, through another provider, or missing", async () => {
    await signedInAccount("old@example.com", new Date(clock.getTime() - ADOPTION_WINDOW_MS - 1));
    await insertProvider("other");
    await signedInAccount("elsewhere@example.com", new Date(clock.getTime() - DAY), "other");
    const identity = kyselyIdentityRepository(t.db, t.dialect);
    await identity.createUserWithoutPassword(
      { email: "never@example.com", name: "N", role: "user" },
      clock,
    );
    for (const email of ["old@example.com", "elsewhere@example.com", "never@example.com"])
      expectScimError(
        await call("POST", "/Users", oktaCreate({ userName: email, externalId: email })),
        409,
        "uniqueness",
      );
    expect(await events("user.scim_adopted")).toEqual([]);
  });

  it("doesn't adopt a disabled account, and never enables one", async () => {
    const id = await signedInAccount("gone@example.com", new Date(clock.getTime() - DAY));
    await kyselyIdentityRepository(t.db, t.dialect).disableUser(id, clock);
    expectScimError(
      await call(
        "POST",
        "/Users",
        oktaCreate({ userName: "gone@example.com", externalId: "gone" }),
      ),
      409,
      "uniqueness",
    );
    expect((await account("gone@example.com"))?.disabled_at).not.toBeNull();
  });

  it("doesn't adopt an account with a SCIM link on another provider, nor one whose tombstone exists", async () => {
    await insertProvider("other");
    const otherToken = await tokenFor("other");
    const created = await call(
      "POST",
      "/Users",
      oktaCreate({ userName: "eve@example.com", externalId: "eve" }),
      { token: otherToken },
    );
    expect(created.status).toBe(201);
    const eve = await account("eve@example.com");
    // Eve also signs in through acme, recently.
    await kyselySsoRepository(t.db, t.dialect).linkAccount(eve?.id ?? "", "acme", "sub-eve", clock);
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: eve?.id ?? null,
        action: "auth.sso_signed_in",
        target: { type: "user", id: eve?.id ?? null },
        metadata: { provider: "acme" },
      },
      clock,
    );
    expectScimError(
      await call(
        "POST",
        "/Users",
        oktaCreate({ userName: "eve@example.com", externalId: "eve-acme" }),
      ),
      409,
      "uniqueness",
    );
    // Deleted on the other provider: still a SCIM link (a tombstone), still 409 here.
    expect(
      (await call("DELETE", `/Users/${created.json.id}`, undefined, { token: otherToken })).status,
    ).toBe(204);
    expectScimError(
      await call(
        "POST",
        "/Users",
        oktaCreate({ userName: "eve@example.com", externalId: "eve-acme" }),
      ),
      409,
      "uniqueness",
    );
  });

  it("adopts with active: false by disabling the account", async () => {
    const id = await signedInAccount("fay@example.com", new Date(clock.getTime() - DAY));
    const r = await call(
      "POST",
      "/Users",
      oktaCreate({ userName: "fay@example.com", externalId: "fay", active: false }),
    );
    expect(r.status).toBe(201);
    expect((await account("fay@example.com"))?.disabled_at).not.toBeNull();
    expect((await events("user.disabled")).map((e) => e.target)).toEqual([id]);
  });
});

describe("get, list and filter", () => {
  it("lists the provider's users in creation order, paged, and finds one by its id", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    clock = new Date(clock.getTime() + 1000);
    const bob = await call("POST", "/Users", oktaCreate());
    const list = await call("GET", "/Users");
    expect(list.status).toBe(200);
    expect(list.json).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
    });
    expect((list.json.Resources as Json[]).map((r) => r.id)).toEqual([ann.json.id, bob.json.id]);
    const second = await call("GET", "/Users?startIndex=2&count=1");
    expect(second.json).toMatchObject({ totalResults: 2, startIndex: 2, itemsPerPage: 1 });
    expect((second.json.Resources as Json[])[0]?.id).toBe(bob.json.id);
    expect((await call("GET", "/Users?count=0")).json).toMatchObject({
      totalResults: 2,
      itemsPerPage: 0,
    });
    expect((await call("GET", `/Users/${ann.json.id}`)).json).toMatchObject({
      userName: "ann@example.com",
    });
    expectScimError(await call("GET", "/Users/01NOPE"), 404);
  });

  it("filters with eq on userName (lowercased, as Entra asks), externalId and id", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const byName = await call(
      "GET",
      `/Users?filter=${encodeURIComponent('userName eq "Ann@Example.com"')}`,
    );
    expect(byName.json).toMatchObject({ totalResults: 1 });
    expect((byName.json.Resources as Json[])[0]?.id).toBe(ann.json.id);
    expect(
      (
        await call(
          "GET",
          `/Users?filter=${encodeURIComponent('externalId eq "0a21f0f2-8d2a-4f8e-bf98-7363c4aed4ef"')}`,
        )
      ).json,
    ).toMatchObject({ totalResults: 1 });
    expect(
      (await call("GET", `/Users?filter=${encodeURIComponent(`id eq "${ann.json.id}"`)}`)).json,
    ).toMatchObject({
      totalResults: 1,
    });
    expect(
      (await call("GET", `/Users?filter=${encodeURIComponent('userName eq "nobody@example.com"')}`))
        .json,
    ).toMatchObject({
      totalResults: 0,
      Resources: [],
    });
    expect(
      (await call("GET", `/Users?filter=${encodeURIComponent('userName eq "Kate@example.com"')}`))
        .json,
    ).toMatchObject({
      totalResults: 0,
    });
    expectScimError(
      await call("GET", `/Users?filter=${encodeURIComponent('userName co "ann"')}`),
      400,
      "invalidFilter",
    );
  });

  it("takes any startIndex or count without failing, however large or odd", async () => {
    await call("POST", "/Users", entraCreate());
    for (const query of [
      "startIndex=1e21",
      "startIndex=99999999999999999999",
      "startIndex=-5&count=abc",
      "count=1e21",
      "startIndex=1.5&count=0x10",
    ]) {
      const r = await call("GET", `/Users?${query}`);
      expect(r.status, query).toBe(200);
      expect(r.json.totalResults, query).toBe(1);
    }
    expect((await call("GET", "/Users?startIndex=99999999999999999999")).json).toMatchObject({
      itemsPerPage: 0,
    });
  });

  it("keeps each provider's users to itself", async () => {
    await insertProvider("other");
    const otherToken = await tokenFor("other");
    const ann = await call("POST", "/Users", entraCreate());
    expect((await call("GET", "/Users", undefined, { token: otherToken })).json).toMatchObject({
      totalResults: 0,
    });
    expectScimError(
      await call("GET", `/Users/${ann.json.id}`, undefined, { token: otherToken }),
      404,
    );
    expectScimError(
      await call("DELETE", `/Users/${ann.json.id}`, undefined, { token: otherToken }),
      404,
    );
    expectScimError(
      await call(
        "PATCH",
        `/Users/${ann.json.id}`,
        { schemas: [PATCH], Operations: [{ op: "replace", path: "active", value: false }] },
        { token: otherToken },
      ),
      404,
    );
    expect((await account("ann@example.com"))?.disabled_at).toBeNull();
    // The other provider may create its own link to the same email? No: the email is taken.
    expectScimError(
      await call("POST", "/Users", entraCreate(), { token: otherToken }),
      409,
      "uniqueness",
    );
  });
});

describe("patch and replace", () => {
  it("applies Entra's path operations: the name, the display name, active as a string", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const r = await call("PATCH", `/Users/${ann.json.id}`, {
      schemas: [PATCH],
      Operations: [
        { op: "Replace", path: "name.givenName", value: "Annie" },
        { op: "Add", path: "displayName", value: "Annie Lee" },
        { op: "Replace", path: "active", value: "False" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      name: { givenName: "Annie", familyName: "Lee" },
      displayName: "Annie Lee",
      active: false,
    });
    expect(await account("ann@example.com")).toMatchObject({ name: "Annie Lee" });
    expect((await account("ann@example.com"))?.disabled_at).not.toBeNull();
    const back = await call("PATCH", `/Users/${ann.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "active", value: "True" }],
    });
    expect(back.json.active).toBe(true);
    expect((await account("ann@example.com"))?.disabled_at).toBeNull();
    expect((await events()).map((e) => e.action).filter((a) => a.startsWith("user."))).toEqual([
      "user.created",
      "user.updated",
      "user.disabled",
      "user.enabled",
    ]);
  });

  it("applies Okta's value-object operation, and PUT replaces everything", async () => {
    const bob = await call("POST", "/Users", oktaCreate());
    const patched = await call("PATCH", `/Users/${bob.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { active: false, name: { givenName: "Robert" } } }],
    });
    expect(patched.json).toMatchObject({
      active: false,
      name: { givenName: "Robert", familyName: "Ng" },
    });
    const put = await call("PUT", `/Users/${bob.json.id}`, {
      schemas: [USER],
      id: bob.json.id,
      userName: "bob@example.com",
      name: { givenName: "Bob", familyName: "Ng" },
      emails: [{ primary: true, value: "bob@example.com", type: "work" }],
      active: true,
    });
    expect(put.status).toBe(200);
    // PUT: the display name wasn't sent, so it's gone; the account's name falls back.
    expect(put.json).toMatchObject({
      active: true,
      displayName: "Bob Ng",
      name: { givenName: "Bob" },
    });
    expect((await account("bob@example.com"))?.disabled_at).toBeNull();
  });

  it("changes the email through userName or emails, lowercased, and refuses another account's", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    await call("POST", "/Users", oktaCreate());
    const renamed = await call("PATCH", `/Users/${ann.json.id}`, {
      schemas: [PATCH],
      Operations: [
        { op: "Replace", path: 'emails[type eq "work"].value', value: "Annie@Example.com" },
      ],
    });
    expect(renamed.json.userName).toBe("annie@example.com");
    expect(await account("annie@example.com")).toMatchObject({ name: "Ann Lee" });
    expect(await account("ann@example.com")).toBeUndefined();
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, {
        schemas: [PATCH],
        Operations: [{ op: "replace", path: "userName", value: "Bob@Example.com" }],
      }),
      409,
      "uniqueness",
    );
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, {
        schemas: [PATCH],
        Operations: [{ op: "replace", path: "userName", value: "kåte@example.com" }],
      }),
      400,
      "invalidValue",
    );
    expect((await account("annie@example.com"))?.email).toBe("annie@example.com");
  });

  it("refuses to take a manual account's email through PATCH or PUT", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    await kyselyIdentityRepository(t.db, t.dialect).createUserWithPassword(
      { email: "cy@example.com", name: "Cy", role: "user", passwordHash: "x" },
      clock,
    );
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, {
        schemas: [PATCH],
        Operations: [{ op: "replace", path: "userName", value: "Cy@Example.com" }],
      }),
      409,
      "uniqueness",
    );
    expectScimError(
      await call("PUT", `/Users/${ann.json.id}`, entraCreate({ userName: "cy@example.com" })),
      409,
      "uniqueness",
    );
    expect(await account("ann@example.com")).toMatchObject({ name: "Ann Lee" });
    expect(await account("cy@example.com")).toMatchObject({ name: "Cy" });
  });

  it("puts back an email or a name root changed by hand: the provider's word wins", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const row = await account("ann@example.com");
    await t.db
      .updateTable("user")
      .set({ email: "ann.hand@example.com", name: "By Hand" })
      .where("id", "=", row?.id ?? "")
      .execute();
    const r = await call("PATCH", `/Users/${ann.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "name.givenName", value: "Ann" }],
    });
    expect(r.status).toBe(200);
    expect(await account("ann@example.com")).toMatchObject({ name: "Ann Lee" });
  });

  it("never disables the last enabled root, whatever the request", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const row = await account("ann@example.com");
    // Ann becomes the only enabled root.
    await t.db
      .updateTable("user")
      .set({ role: "root" })
      .where("id", "=", row?.id ?? "")
      .execute();
    await kyselyIdentityRepository(t.db, t.dialect).disableUser(root.id, clock);
    expectScimError(await call("DELETE", `/Users/${ann.json.id}`), 403);
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, {
        schemas: [PATCH],
        Operations: [{ op: "Replace", path: "active", value: "False" }],
      }),
      403,
    );
    expectScimError(
      await call("PUT", `/Users/${ann.json.id}`, entraCreate({ active: false })),
      403,
    );
    expect((await account("ann@example.com"))?.disabled_at).toBeNull();
    expect((await events("user.disabled")).map((e) => e.target)).toEqual([]);
  });

  it("refuses to touch an account that became root, and a bad patch", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const row = await account("ann@example.com");
    await t.db
      .updateTable("user")
      .set({ role: "root" })
      .where("id", "=", row?.id ?? "")
      .execute();
    const r = await call("DELETE", `/Users/${ann.json.id}`);
    expectScimError(r, 403);
    expect((await account("ann@example.com"))?.disabled_at).toBeNull();
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, {
        schemas: [PATCH],
        Operations: [{ op: "replace", path: "active", value: false }],
      }),
      403,
    );
    expect((await events("scim.request_refused")).map((e) => e.metadata)).toEqual([
      { reason: "root", provider: "acme" },
      { reason: "root", provider: "acme" },
    ]);
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, { schemas: [PATCH], Operations: [] }),
      400,
      "invalidSyntax",
    );
  });
});

describe("delete", () => {
  it("disables the account, ends its sessions and tokens, and makes the id 404 for everything", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const row = await account("ann@example.com");
    await t.db
      .insertInto("access_tokens")
      .values({
        id: newId(),
        user_id: row?.id ?? "",
        name: "laptop",
        token_hash: hashToken(`rmk_${"a".repeat(43)}`),
        token_prefix: "rmk_aaaaaaaa",
        created_at: toDbDate(clock, t.dialect),
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_via: "web",
      })
      .execute();
    const r = await call("DELETE", `/Users/${ann.json.id}`);
    expect(r.status).toBe(204);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await account("ann@example.com"))?.disabled_at).not.toBeNull();
    const tokens = await t.db.selectFrom("access_tokens").select("revoked_at").execute();
    expect(tokens[0]?.revoked_at).not.toBeNull();
    expect((await events("user.disabled")).map((e) => e.metadata)).toEqual([
      { via: "scim", provider: "acme", sessionsEnded: 0, tokensRevoked: 1, deprovisioned: true },
    ]);
    for (const method of ["GET", "DELETE"])
      expectScimError(await call(method, `/Users/${ann.json.id}`), 404);
    expectScimError(await call("PUT", `/Users/${ann.json.id}`, entraCreate()), 404);
    expectScimError(
      await call("PATCH", `/Users/${ann.json.id}`, {
        schemas: [PATCH],
        Operations: [{ op: "replace", path: "active", value: true }],
      }),
      404,
    );
    // Left out of lists and filters, and in no uniqueness check for the id or the name.
    expect((await call("GET", "/Users")).json).toMatchObject({ totalResults: 0 });
    expect(
      (await call("GET", `/Users?filter=${encodeURIComponent('userName eq "ann@example.com"')}`))
        .json,
    ).toMatchObject({ totalResults: 0 });
    // The tombstone keeps only its external id.
    const tomb = await t.db
      .selectFrom("scim_users")
      .select(["user_name", "external_id", "deleted_at"])
      .executeTakeFirstOrThrow();
    expect(tomb.user_name).toBeNull();
    expect(tomb.external_id).toBe("0a21f0f2-8d2a-4f8e-bf98-7363c4aed4ef");
    expect(tomb.deleted_at).not.toBeNull();
  });

  it("links the account again on a create with this provider's tombstone externalId, with a new id", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    await call("DELETE", `/Users/${ann.json.id}`);
    clock = new Date(clock.getTime() + 1000);
    const again = await call(
      "POST",
      "/Users",
      entraCreate({
        userName: "Ann.Lee@Example.com",
        name: { givenName: "Ann", familyName: "Lee" },
        displayName: "Ann Lee",
      }),
    );
    expect(again.status).toBe(201);
    expect(again.json.id).not.toBe(ann.json.id);
    const row = await account("ann.lee@example.com");
    expect(row?.disabled_at).toBeNull();
    expect(await account("ann@example.com")).toBeUndefined();
    expect(await t.db.selectFrom("scim_users").select("id").execute()).toHaveLength(1);
    expect((await events("user.enabled")).map((e) => e.target)).toEqual([row?.id]);
    expect(await events("user.created")).toHaveLength(1);
    expect((await call("GET", `/Users/${ann.json.id}`)).status).toBe(404);
    expect((await call("GET", `/Users/${again.json.id}`)).json).toMatchObject({
      active: true,
      groups: [],
    });
  });

  it("keeps the account disabled when the create that brings it back says active: false", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    await call("DELETE", `/Users/${ann.json.id}`);
    const again = await call("POST", "/Users", entraCreate({ active: false }));
    expect(again.status).toBe(201);
    expect(again.json.active).toBe(false);
    expect((await account("ann@example.com"))?.disabled_at).not.toBeNull();
    expect(await events("user.enabled")).toEqual([]);
  });

  it("refuses the tombstone's email with another externalId, or none, and another provider's tombstone", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    await call("DELETE", `/Users/${ann.json.id}`);
    expectScimError(
      await call("POST", "/Users", entraCreate({ externalId: "new-person" })),
      409,
      "uniqueness",
    );
    const noId = entraCreate();
    delete (noId as Json).externalId;
    expectScimError(await call("POST", "/Users", noId), 409, "uniqueness");
    await insertProvider("other");
    const otherToken = await tokenFor("other");
    expectScimError(
      await call("POST", "/Users", entraCreate(), { token: otherToken }),
      409,
      "uniqueness",
    );
    // Still one account (plus the erased one, 103), still disabled.
    expect((await account("ann@example.com"))?.disabled_at).not.toBeNull();
    expect(
      await t.db
        .selectFrom("user")
        .select("id")
        .where("role", "=", "user")
        .where("erased_at", "is", null)
        .execute(),
    ).toHaveLength(1);
  });

  it("takes the user out of the provider's groups", async () => {
    const ann = await call("POST", "/Users", entraCreate());
    const row = await account("ann@example.com");
    await t.db
      .insertInto("scim_groups")
      .values({
        id: "01GROUP0000000000000000000",
        provider_id: "acme",
        display_name: "Engineers",
        external_id: null,
        created_at: toDbDate(clock, t.dialect),
        updated_at: toDbDate(clock, t.dialect),
      })
      .execute();
    await t.db
      .insertInto("scim_group_members")
      .values({
        group_id: "01GROUP0000000000000000000",
        user_id: row?.id ?? "",
        created_at: toDbDate(clock, t.dialect),
      })
      .execute();
    expect((await call("GET", `/Users/${ann.json.id}`)).json.groups).toEqual([
      { value: "01GROUP0000000000000000000", display: "Engineers" },
    ]);
    await call("DELETE", `/Users/${ann.json.id}`);
    expect(await t.db.selectFrom("scim_group_members").select("user_id").execute()).toEqual([]);
  });
});

describe("the account's lock", () => {
  // A write locks the account's row after the provider's and reads it again: a change committed by
  // root meanwhile (a promotion to root) is what its checks see. Two transactions that overlap need
  // a database server: SQLite runs one writer at a time.
  const servers =
    process.env.TEST_DATABASE_URL !== undefined &&
    !process.env.TEST_DATABASE_URL.startsWith("file:");
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /** Holds the account's row, promotes it to root, and commits a moment later. */
  const promoteWhileHolding = (userId: string) =>
    t.db.transaction().execute(async (trx) => {
      await trx.selectFrom("user").select("id").where("id", "=", userId).forUpdate().execute();
      await trx.updateTable("user").set({ role: "root" }).where("id", "=", userId).execute();
      await sleep(500);
    });

  it.skipIf(!servers)("makes a create wait, and see the account become root", async () => {
    const identity = kyselyIdentityRepository(t.db, t.dialect);
    const id = await identity.createUserWithoutPassword(
      { email: "held@example.com", name: "Held", role: "user" },
      new Date(clock.getTime() - DAY),
    );
    await kyselySsoRepository(t.db, t.dialect).linkAccount(id, "acme", "sub-held", clock);
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: id,
        action: "auth.sso_signed_in",
        target: { type: "user", id },
        metadata: { provider: "acme" },
      },
      clock,
    );
    const hold = promoteWhileHolding(id);
    await sleep(100);
    const r = await call(
      "POST",
      "/Users",
      oktaCreate({ userName: "held@example.com", externalId: "held", active: false }),
    );
    await hold;
    expectScimError(r, 403);
    expect(await account("held@example.com")).toMatchObject({ role: "root", disabled_at: null });
    expect(await events("user.scim_adopted")).toEqual([]);
  });

  it.skipIf(!servers)(
    "makes a create that brings a deleted user back wait, and see it become root",
    async () => {
      const ann = await call("POST", "/Users", entraCreate());
      await call("DELETE", `/Users/${ann.json.id}`);
      const row = await account("ann@example.com");
      const hold = promoteWhileHolding(row?.id ?? "");
      await sleep(100);
      // Under a new email, so only the tombstone leads to the account (no email match to lock).
      const r = await call("POST", "/Users", entraCreate({ userName: "ann.new@example.com" }));
      await hold;
      expectScimError(r, 403);
      // Still the tombstone, still disabled: nothing was linked again.
      expect((await account("ann@example.com"))?.disabled_at).not.toBeNull();
      expect(await t.db.selectFrom("scim_users").select("deleted_at").execute()).toHaveLength(1);
      expect(await events("user.enabled")).toEqual([]);
    },
  );

  it.skipIf(!servers)("makes a create wait, and see the account's email change", async () => {
    const identity = kyselyIdentityRepository(t.db, t.dialect);
    const id = await identity.createUserWithoutPassword(
      { email: "moving@example.com", name: "Moving", role: "user" },
      new Date(clock.getTime() - DAY),
    );
    await kyselySsoRepository(t.db, t.dialect).linkAccount(id, "acme", "sub-moving", clock);
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: id,
        action: "auth.sso_signed_in",
        target: { type: "user", id },
        metadata: { provider: "acme" },
      },
      clock,
    );
    // Root changes the address while the create for the old one waits on the row.
    const hold = t.db.transaction().execute(async (trx) => {
      await trx.selectFrom("user").select("id").where("id", "=", id).forUpdate().execute();
      await trx
        .updateTable("user")
        .set({ email: "moved@example.com" })
        .where("id", "=", id)
        .execute();
      await sleep(500);
    });
    await sleep(100);
    const r = await call(
      "POST",
      "/Users",
      oktaCreate({ userName: "moving@example.com", externalId: "moving" }),
    );
    await hold;
    expectScimError(r, 409, "uniqueness");
    expect(await t.db.selectFrom("scim_users").select("id").execute()).toEqual([]);
    expect(await events("user.scim_adopted")).toEqual([]);
  });

  it.skipIf(!servers)("makes a PATCH wait, and see the account become root", async () => {
    const bob = await call("POST", "/Users", oktaCreate());
    const row = await account("bob@example.com");
    const hold = promoteWhileHolding(row?.id ?? "");
    await sleep(100);
    const r = await call("PATCH", `/Users/${bob.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", path: "active", value: false }],
    });
    await hold;
    expectScimError(r, 403);
    expect((await account("bob@example.com"))?.disabled_at).toBeNull();
  });
});

describe("two providers at once", () => {
  it("lets one create an email and answers the other 409, never a raw database error", async () => {
    await insertProvider("other");
    const otherToken = await tokenFor("other");
    const body = oktaCreate({ userName: "race@example.com", externalId: "race" });
    const [a, b] = await Promise.all([
      call("POST", "/Users", body),
      call("POST", "/Users", body, { token: otherToken }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.json.scimType).toBe("uniqueness");
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "race@example.com").execute(),
    ).toHaveLength(1);
    expect(await t.db.selectFrom("scim_users").select("id").execute()).toHaveLength(1);
  });
});

describe("an erased account (103)", () => {
  const linkErased = async (externalId: string | null) =>
    kyselyScimUserRepository(t.db, t.dialect).insertLink({
      providerId: "acme",
      userId: erased.id,
      externalId,
      userName: erased.email,
      givenName: null,
      familyName: null,
      displayName: null,
      active: false,
      createdAt: clock,
    });
  const erasedRow = () =>
    t.db.selectFrom("user").selectAll().where("id", "=", erased.id).executeTakeFirstOrThrow();

  it("is out of reach through a link that survived: 404 on every request, nothing changed", async () => {
    const id = await linkErased("ext-erased");
    const before = await erasedRow();
    expectScimError(await call("GET", `/Users/${id}`), 404);
    expectScimError(
      await call("PUT", `/Users/${id}`, oktaCreate({ userName: "back@example.com" })),
      404,
    );
    expectScimError(
      await call("PATCH", `/Users/${id}`, {
        schemas: [PATCH],
        Operations: [{ op: "replace", path: "active", value: true }],
      }),
      404,
    );
    expectScimError(await call("DELETE", `/Users/${id}`), 404);
    const list = await call("GET", "/Users");
    expect(list.status).toBe(200);
    expect(list.json.Resources).toEqual([]);
    expect(await erasedRow()).toEqual(before);
    expect(await events("user.enabled")).toEqual([]);
  });

  it("is never brought back by its tombstone's external id: the create makes a new account", async () => {
    const id = await linkErased("ext-erased");
    await kyselyScimUserRepository(t.db, t.dialect).tombstoneLink(id, clock);
    const before = await erasedRow();
    const r = await call(
      "POST",
      "/Users",
      oktaCreate({ userName: "back@example.com", externalId: "ext-erased" }),
    );
    expect(r.status).toBe(201);
    const back = await account("back@example.com");
    expect(back?.id).toBeDefined();
    expect(back?.id).not.toBe(erased.id);
    expect(await erasedRow()).toEqual(before);
    expect(await events("user.updated")).toEqual([]);
    expect(await events("user.created")).toMatchObject([{ target: back?.id }]);
  });

  it("is never adopted, even with the provider's own sign-in and a real email left on the row", async () => {
    const ghost = await seedErasedUser(t, { email: "ghost@example.com", disabled: false });
    await kyselySsoRepository(t.db, t.dialect).linkAccount(ghost.id, "acme", "sub-ghost", clock);
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: ghost.id,
        action: "auth.sso_signed_in",
        target: { type: "user", id: ghost.id },
        metadata: { provider: "acme" },
      },
      new Date(clock.getTime() - DAY),
    );
    expectScimError(
      await call(
        "POST",
        "/Users",
        oktaCreate({ userName: "ghost@example.com", externalId: "ghost" }),
      ),
      409,
      "uniqueness",
    );
    expect(await events("user.scim_adopted")).toEqual([]);
    expect(await t.db.selectFrom("scim_users").select("id").execute()).toEqual([]);
  });

  it("refuses the pseudonym as a userName: no address on the reserved domain is anyone's", async () => {
    expectScimError(await call("POST", "/Users", oktaCreate({ userName: erased.email })), 400);
    expect(await events("user.created")).toEqual([]);
  });
});
