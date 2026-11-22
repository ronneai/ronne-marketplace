import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { memoryRateLimiter } from "../../../rate-limit/memory-store";
import { listAuditEvents } from "../../audit/actions/audit";
import type { AppAuth } from "../repositories/auth-instance";
import { type FakeOidc, followAuthorize, startFakeOidc } from "../testing/fake-oidc-server";
import { cookieHeaders, createTestUser, TEST_BASE_URL, testAppAuth } from "../testing/test-auth";
import {
  createProvider,
  enableProvider,
  providerPage,
  startTestSignIn,
  startTestSignInFromRequest,
  testConnection,
  updateProvider,
} from "./identity-providers";
import { signIn } from "./session";
import { completeSsoSignIn, SSO_LIMIT, SSO_STATE_COOKIE } from "./sso";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let fake: FakeOidc;
let rootHeaders: Headers;
let otherRootHeaders: Headers;
const limiter = memoryRateLimiter({ ...SSO_LIMIT, max: 10_000 });
const PASSWORD = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password: PASSWORD, rememberMe: false }, app);
  if (!result.ok) throw new Error("not signed in");
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  fake = await startFakeOidc();
  await createTestUser(app, { email: "root@acme.com", password: PASSWORD, role: "root" });
  await createTestUser(app, { email: "other@acme.com", password: PASSWORD, role: "root" });
  rootHeaders = await signedIn("root@acme.com");
  otherRootHeaders = await signedIn("other@acme.com");
  await createProvider(
    rootHeaders,
    "acme",
    {
      type: "oidc",
      preset: "okta",
      name: "Acme SSO",
      config: {
        issuer: fake.issuer,
        clientId: fake.clientId,
        clientSecret: fake.clientSecret,
        scopes: "openid email profile",
      },
      domains: "acme.com",
      linkByEmail: true,
      groupsClaim: "groups",
    },
    app,
  );
});
afterEach(async () => {
  await fake.close();
  await t.cleanup();
});

/** A *Test sign-in* by `starter`, finished in the browser carrying `finisher`'s session. */
const testSignIn = async (starter: Headers, finisher: Headers = starter) => {
  const started = await startTestSignIn(starter, "acme", app, { limiter });
  if (!started.ok) throw new Error(`not started: ${started.error}`);
  const back = await followAuthorize(started.url);
  const cookie = [finisher.get("cookie"), `${SSO_STATE_COOKIE}=${started.cookie.value}`]
    .filter(Boolean)
    .join("; ");
  return completeSsoSignIn(new Request(back.href, { headers: { cookie } }), "acme", app, {
    limiter,
  });
};

describe("Test sign-in", () => {
  it("shows the claims and what a sign-in would do, changes nothing, and lets this root turn it on", async () => {
    const response = await testSignIn(rootHeaders);
    expect(response.headers.get("location")).toBe(
      `${TEST_BASE_URL}/admin/settings?tab=authentication&provider=acme&test=done`,
    );
    // No session for anyone, no account, no link.
    expect(response.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(false);
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "ana@acme.com").execute(),
    ).toEqual([]);
    expect(
      await t.db.selectFrom("account").select("id").where("provider_id", "=", "acme").execute(),
    ).toEqual([]);
    const actions = (await listAuditEvents(t.db, t.dialect, { dir: "asc" })).events.map(
      (e) => e.action,
    );
    expect(actions.filter((a) => a.startsWith("auth.sso") || a === "user.created")).toEqual([]);

    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.lastTest).toMatchObject({
      ok: true,
      claims: {
        subject: "sub-ana",
        email: "ana@acme.com",
        emailVerified: true,
        groups: ["engineering"],
      },
      decision: expect.stringContaining("Create the account ana@acme.com"),
    });
    expect(page.canEnable).toBe(true);
    expect(await enableProvider(rootHeaders, "acme", app)).toEqual({ changed: true });
  });

  it("works while the provider is off (that's when it's tested)", async () => {
    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.provider?.enabled).toBe(false);
    const response = await testSignIn(rootHeaders);
    expect(response.headers.get("location")).toContain("test=done");
  });

  it("counts only for the root who ran it", async () => {
    await testSignIn(rootHeaders);
    expect((await providerPage(otherRootHeaders, "acme", app)).canEnable).toBe(false);
    await expect(enableProvider(otherRootHeaders, "acme", app)).rejects.toThrow();
    expect((await providerPage(otherRootHeaders, "acme", app)).lastTest).toBeNull();
  });

  it("finishes only in the browser of the root who started it", async () => {
    const response = await testSignIn(rootHeaders, otherRootHeaders);
    expect(response.headers.get("location")).toBe(`${TEST_BASE_URL}/sign-in?error=expired`);
    expect((await providerPage(rootHeaders, "acme", app)).canEnable).toBe(false);
    const noSession = await testSignIn(rootHeaders, new Headers());
    expect(noSession.headers.get("location")).toContain("error=expired");
  });

  it("doesn't pass when the email isn't verified, and says why", async () => {
    fake.user = { ...fake.user, emailVerified: false };
    await testSignIn(rootHeaders);
    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.lastTest?.ok).toBe(false);
    expect(page.lastTest?.lines.join(" ")).toContain("isn't marked verified");
    expect(page.canEnable).toBe(false);
  });

  it("says when an existing account wouldn't be linked because its domain isn't listed", async () => {
    await createTestUser(app, { email: "ana@gmail.com", password: PASSWORD });
    fake.user = { ...fake.user, email: "ana@gmail.com" };
    await testSignIn(rootHeaders);
    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.lastTest?.decision).toBe(
      "Refuse: the account ana@gmail.com exists, but its email's domain isn't on this provider's list, so it isn't linked.",
    );
  });

  it("says when the address can't be used (not plain ASCII), though its domain is listed", async () => {
    fake.user = { ...fake.user, email: "\u212Aate@acme.com" };
    await testSignIn(rootHeaders);
    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.lastTest?.decision).toBe(
      "Refuse: the email address isn't plain ASCII, and Ronne only matches and creates plain ASCII addresses.",
    );
  });

  it("says a blocked domain, creating off and waiting for approval in words (191)", async () => {
    const decision = async () => {
      await testSignIn(rootHeaders);
      return (await providerPage(rootHeaders, "acme", app)).lastTest?.decision;
    };
    const flag = (column: "creates_accounts" | "needs_approval", on: boolean) =>
      app.db
        .updateTable("identity_providers")
        .set({ [column]: app.dialect === "sqlite" ? Number(on) : on })
        .where("id", "=", "acme")
        .execute();
    await flag("needs_approval", true);
    expect(await decision()).toBe(
      "Create the account ana@acme.com (a user in global, with a personal workspace), waiting for a root's approval: no sign-in and no groups until a root approves it.",
    );
    await flag("creates_accounts", false);
    expect(await decision()).toBe(
      "Refuse (creating_off): no account matches, and this provider doesn't create accounts.",
    );
    await app.db
      .insertInto("instance_settings")
      .values({
        key: "blocked_domains",
        value: '["acme.com"]',
        updated_by: null,
        updated_at: toDbDate(new Date(), app.dialect),
      })
      .execute();
    expect(await decision()).toBe(
      "Refuse (domain_blocked): acme.com is on the instance's block list.",
    );
  });

  it("predicts no group changes for an account that would wait for approval (191)", async () => {
    await app.db
      .insertInto("provider_group_mappings")
      .values({
        id: newId(),
        provider_id: "acme",
        group_name: "mods",
        workspace_id: GLOBAL_WORKSPACE_ID,
        role: "moderator",
        created_at: toDbDate(new Date(), app.dialect),
      })
      .execute();
    fake.user = { ...fake.user, groups: ["mods"] };
    const changes = async () => {
      await testSignIn(rootHeaders);
      return (await providerPage(rootHeaders, "acme", app)).lastTest?.groupChanges;
    };
    // Without approval, the new account would get the mapping's role at once.
    expect((await changes())?.length).toBeGreaterThan(0);
    await app.db
      .updateTable("identity_providers")
      .set({ needs_approval: app.dialect === "sqlite" ? 1 : true })
      .where("id", "=", "acme")
      .execute();
    expect(await changes()).toEqual([]);
  });

  it("fails on a bad answer, marks the provider Failing, and records no test", async () => {
    fake.switches.badSignature = true;
    await testSignIn(rootHeaders);
    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.lastTest).toMatchObject({ ok: false, claims: null });
    expect(page.status).toBe("failing");
    expect(page.canEnable).toBe(false);
  });

  it("doesn't count when the provider was saved during the test", async () => {
    const started = await startTestSignIn(rootHeaders, "acme", app, { limiter });
    if (!started.ok) throw new Error("not started");
    const before = (await providerPage(rootHeaders, "acme", app)).provider;
    await updateProvider(
      rootHeaders,
      "acme",
      {
        preset: "okta",
        name: "Renamed",
        config: before?.config ?? {},
        domains: "acme.com",
        linkByEmail: true,
        groupsClaim: "groups",
      },
      before?.updatedAt as Date,
      app,
    );
    const back = await followAuthorize(started.url);
    await completeSsoSignIn(
      new Request(back.href, {
        headers: {
          cookie: `${rootHeaders.get("cookie")}; ${SSO_STATE_COOKIE}=${started.cookie.value}`,
        },
      }),
      "acme",
      app,
      { limiter },
    );
    const page = await providerPage(rootHeaders, "acme", app);
    expect(page.lastTest?.ok).toBe(false);
    expect(page.lastTest?.lines.join(" ")).toContain("changed during the test");
    expect(page.canEnable).toBe(false);
  });
});

describe("Test connection", () => {
  it("reports in words, and marks a failing provider", async () => {
    expect(await testConnection(rootHeaders, "acme", app)).toMatchObject({ ok: true });
    fake.switches.wrongIssuer = true;
    const failed = await testConnection(rootHeaders, "acme", app);
    expect(failed.ok).toBe(false);
    expect((await providerPage(rootHeaders, "acme", app)).status).toBe("failing");
  });
});

describe("the Test sign-in button's route", () => {
  const post = (headers: Headers, origin: string | null = TEST_BASE_URL) => {
    const h = new Headers(headers);
    if (origin) h.set("origin", origin);
    return startTestSignInFromRequest(
      new Request(`${TEST_BASE_URL}/api/auth/sso/test/acme`, { method: "POST", headers: h }),
      "acme",
      app,
      { limiter },
    );
  };

  it("sends root to the provider with the state cookie", async () => {
    const response = await post(rootHeaders);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(new RegExp(`^${fake.issuer}/authorize\\?`));
    expect(response.headers.getSetCookie().join("\n")).toMatch(
      new RegExp(
        `^${SSO_STATE_COOKIE}=[^;]+; Path=/api/auth/sso/callback; Max-Age=600; HttpOnly; SameSite=Lax`,
      ),
    );
  });

  it("refuses a post from another site, or with no Origin", async () => {
    expect((await post(rootHeaders, "https://evil.example")).status).toBe(403);
    expect((await post(rootHeaders, null)).status).toBe(403);
  });

  it("sends someone who isn't root back, starting nothing", async () => {
    await createTestUser(app, { email: "ana@acme.com", password: PASSWORD });
    const response = await post(await signedIn("ana@acme.com"));
    expect(response.headers.get("location")).toContain("&test=unavailable");
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
