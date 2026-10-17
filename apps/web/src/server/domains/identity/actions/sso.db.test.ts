import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { HTTP_ENDPOINTS } from "../repositories/better-auth";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import {
  createProvider,
  enableProvider,
  type IdentityProviderDeps,
  markProviderTested,
  updateProvider,
} from "../services/identity-providers";
import { planSsoSignIn } from "../services/sso-sign-in";
import { type FakeOidc, followAuthorize, startFakeOidc } from "../testing/fake-oidc-server";
import { cookieHeaders, createTestUser, TEST_BASE_URL, testAppAuth } from "../testing/test-auth";
import { handleAuthRequest } from "./auth-http";
import { completeSsoSignIn, SSO_STATE_COOKIE, startSsoSignIn } from "./sso";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let fake: FakeOidc;
let root: CurrentUser;
let deps: IdentityProviderDeps;
let limiter: LoginRateLimiter;

const AUTH_SECRET = "test-secret-test-secret-test-secret-00";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  fake = await startFakeOidc();
  limiter = new LoginRateLimiter({ max: 1000 });
  const rootId = await createTestUser(app, {
    email: "root@acme.com",
    password: "correct horse battery",
    role: "root",
  });
  root = { id: rootId, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  deps = {
    repo: kyselyIdentityProviderRepository(t.db, t.dialect),
    types: PROVIDER_TYPES,
    authSecret: AUTH_SECRET,
  };
  const created = await createProvider(deps, { user: root, ip: null }, "acme", {
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
  });
  await markProviderTested(deps, { user: root, ip: null }, "acme", created.updatedAt);
  await enableProvider(deps, { user: root, ip: null }, "acme");
});
afterEach(async () => {
  await fake.close();
  await t.cleanup();
});

/** The whole round trip a browser makes: start, the provider, the callback. */
const signIn = async (
  options: { next?: string; cookie?: (value: string) => string | null; provider?: string } = {},
) => {
  const started = await startSsoSignIn(
    new Headers(),
    { provider: options.provider ?? "acme", next: options.next },
    app,
    { limiter },
  );
  if (!started.ok) return { started, response: null };
  const back = await followAuthorize(started.url);
  const cookie = options.cookie
    ? options.cookie(started.cookie.value)
    : `${SSO_STATE_COOKIE}=${started.cookie.value}`;
  const request = new Request(back.href, { headers: cookie ? { cookie } : {} });
  const response = await completeSsoSignIn(request, options.provider ?? "acme", app, { limiter });
  return { started, response, back, cookie };
};

const location = (response: Response | null) => response?.headers.get("location") ?? "";

const sessionUser = async (response: Response | null) => {
  const setCookie = (response?.headers.getSetCookie() ?? []).join(", ");
  const found = await app.auth.api.getSession({ headers: cookieHeaders(setCookie) });
  return found?.user.email ?? null;
};

const audit = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, { dir: "asc" })).events.filter(
    (e) => e.action === action,
  );

const userByEmail = (email: string) =>
  t.db.selectFrom("user").selectAll().where("email", "=", email).executeTakeFirst();

describe("first sign-in from a listed domain", () => {
  it("creates a user in global with a personal workspace, no password and no root role, and signs in", async () => {
    const { response } = await signIn({ next: "/items" });
    expect(response?.status).toBe(302);
    expect(location(response)).toBe(`${TEST_BASE_URL}/items`);
    expect(await sessionUser(response)).toBe("ana@acme.com");

    const user = await userByEmail("ana@acme.com");
    expect(user).toMatchObject({ name: "Ana Acme", role: "user", disabled_at: null });
    const accounts = await t.db
      .selectFrom("account")
      .select(["provider_id", "account_id", "password"])
      .where("user_id", "=", user?.id as string)
      .execute();
    expect(accounts).toEqual([{ provider_id: "acme", account_id: "sub-ana", password: null }]);
    const memberships = await t.db
      .selectFrom("workspace_members as m")
      .innerJoin("workspaces as w", "w.id", "m.workspace_id")
      .select(["m.workspace_id", "m.role", "w.owner_id"])
      .where("m.user_id", "=", user?.id as string)
      .execute();
    expect(memberships).toContainEqual({
      workspace_id: GLOBAL_WORKSPACE_ID,
      role: "user",
      owner_id: null,
    });
    expect(memberships.some((m) => m.owner_id === user?.id && m.role === "admin")).toBe(true);

    expect(await audit("user.created")).toMatchObject([
      { metadata: { email: "ana@acme.com", role: "user", via: "sso", provider: "acme" } },
    ]);
    expect(await audit("auth.signed_in")).toMatchObject([
      { actorId: user?.id, metadata: { via: "sso", provider: "acme" } },
    ]);
    expect(await audit("auth.sso_signed_in")).toHaveLength(1);
    const provider = await deps.repo.find("acme");
    expect(provider?.provider.lastSignedInAt).not.toBeNull();
  });

  it("creates nothing for an unlisted domain", async () => {
    fake.user = { ...fake.user, sub: "sub-zed", email: "zed@other.com" };
    const { response } = await signIn();
    expect(location(response)).toBe(`${TEST_BASE_URL}/sign-in?error=not_allowed`);
    expect(await sessionUser(response)).toBeNull();
    expect(await userByEmail("zed@other.com")).toBeUndefined();
    expect(await audit("auth.sso_failed")).toMatchObject([
      { metadata: { provider: "acme", reason: "not_allowed", email: "zed@other.com" } },
    ]);
  });

  it("creates nothing when no domain is listed", async () => {
    const p = (await deps.repo.find("acme"))?.provider;
    await updateProvider(
      deps,
      { user: root, ip: null },
      "acme",
      {
        preset: "okta",
        name: p?.name,
        config: p?.config ?? {},
        domains: "",
        linkByEmail: true,
        groupsClaim: "groups",
      },
      p?.updatedAt as Date,
    );
    const { response } = await signIn();
    expect(location(response)).toContain("error=not_allowed");
    expect(await userByEmail("ana@acme.com")).toBeUndefined();
  });
});

describe("the decision list", () => {
  it("refuses an unverified email, before anything else", async () => {
    await createTestUser(app, { email: "ana@acme.com", password: "correct horse battery" });
    fake.user = { ...fake.user, emailVerified: false };
    const { response } = await signIn();
    expect(location(response)).toContain("error=unverified_email");
    expect(await sessionUser(response)).toBeNull();
    expect(
      await t.db.selectFrom("account").select("id").where("provider_id", "=", "acme").execute(),
    ).toEqual([]);
    expect(await audit("auth.sso_failed")).toMatchObject([
      { metadata: { reason: "unverified_email" } },
    ]);
  });

  it("links an existing account by verified email, then signs in by the link", async () => {
    const id = await createTestUser(app, {
      email: "ana@acme.com",
      password: "correct horse battery",
    });
    expect(await sessionUser((await signIn()).response)).toBe("ana@acme.com");
    expect(await audit("user.sso_linked")).toMatchObject([
      { actorId: id, metadata: { provider: "acme", email: "ana@acme.com" } },
    ]);
    // The password account stays: they can still use it.
    const accounts = await t.db
      .selectFrom("account")
      .select("provider_id")
      .where("user_id", "=", id)
      .execute();
    expect(accounts.map((a) => a.provider_id).sort()).toEqual(["acme", "credential"]);
    // Second time: the known link, no second link.
    expect(await sessionUser((await signIn()).response)).toBe("ana@acme.com");
    expect(await audit("user.sso_linked")).toHaveLength(1);
  });

  it("doesn't link by email when the provider says not to", async () => {
    await createTestUser(app, { email: "ana@acme.com", password: "correct horse battery" });
    await t.db
      .updateTable("identity_providers")
      .set({ link_by_email: toDbBoolean(false, t.dialect) })
      .execute();
    const { response } = await signIn();
    expect(location(response)).toContain("error=not_allowed");
  });

  it("doesn't link an account whose email's domain isn't on the provider's list", async () => {
    // A provider for acme.com vouching for a gmail.com address can't take that account over.
    const id = await createTestUser(app, {
      email: "ana@gmail.com",
      password: "correct horse battery",
    });
    fake.user = { ...fake.user, email: "ana@gmail.com" };
    const { response } = await signIn();
    expect(location(response)).toContain("error=not_allowed");
    expect(await sessionUser(response)).toBeNull();
    expect(
      await t.db.selectFrom("account").select("id").where("provider_id", "=", "acme").execute(),
    ).toEqual([]);
    expect(await audit("auth.sso_failed")).toMatchObject([
      { metadata: { reason: "not_allowed", why: "domain_not_listed", email: "ana@gmail.com" } },
    ]);
    expect(await audit("user.sso_linked")).toEqual([]);
    expect((await userByEmail("ana@gmail.com"))?.id).toBe(id);
  });

  it("links nobody by email when no domain is listed", async () => {
    await createTestUser(app, { email: "ana@acme.com", password: "correct horse battery" });
    const p = (await deps.repo.find("acme"))?.provider;
    await updateProvider(
      deps,
      { user: root, ip: null },
      "acme",
      {
        preset: "okta",
        name: p?.name,
        config: p?.config ?? {},
        domains: "",
        linkByEmail: true,
        groupsClaim: "groups",
      },
      p?.updatedAt as Date,
    );
    const { response } = await signIn();
    expect(location(response)).toContain("error=not_allowed");
    expect(await audit("user.sso_linked")).toEqual([]);
  });

  it("keeps the link when the person's email changes at the provider (the Ronne email stays)", async () => {
    await signIn();
    fake.user = { ...fake.user, email: "ana.new@acme.com" };
    const { response } = await signIn();
    expect(await sessionUser(response)).toBe("ana@acme.com");
    expect(await userByEmail("ana.new@acme.com")).toBeUndefined();
  });

  it("refuses a new subject with an email already linked to someone else's subject", async () => {
    await signIn();
    // The provider reused the address for another person.
    fake.user = { ...fake.user, sub: "sub-someone-else" };
    const { response } = await signIn();
    expect(location(response)).toContain("error=not_allowed");
    expect(await sessionUser(response)).toBeNull();
    const links = await t.db
      .selectFrom("account")
      .select("account_id")
      .where("provider_id", "=", "acme")
      .execute();
    expect(links).toEqual([{ account_id: "sub-ana" }]);
  });

  it("compares subjects exactly, letter case included", async () => {
    await signIn();
    fake.user = { ...fake.user, sub: "SUB-ANA" };
    const { response } = await signIn();
    expect(location(response)).toContain("error=not_allowed");
  });

  it("refuses a disabled account, linked or matched by email, with the disabled reason", async () => {
    const id = await createTestUser(app, {
      email: "ana@acme.com",
      password: "correct horse battery",
    });
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", id)
      .execute();
    const first = await signIn();
    expect(location(first.response)).toContain("error=disabled");
    expect(await audit("auth.sso_failed")).toMatchObject([{ metadata: { reason: "disabled" } }]);
    // Linked, then disabled.
    await t.db.updateTable("user").set({ disabled_at: null }).where("id", "=", id).execute();
    await signIn();
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", id)
      .execute();
    expect(location((await signIn()).response)).toContain("error=disabled");
  });

  it("refuses a linked account that was disabled, before the session (the plan says so)", async () => {
    await signIn();
    const user = await userByEmail("ana@acme.com");
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", user?.id as string)
      .execute();
    const provider = (await deps.repo.find("acme"))?.provider;
    if (!provider) throw new Error("no provider");
    const plan = await planSsoSignIn(kyselySsoRepository(t.db, t.dialect), provider, {
      subject: "sub-ana",
      email: "ana@acme.com",
      emailVerified: true,
      name: "Ana",
      groups: null,
    });
    expect(plan).toMatchObject({ action: "refuse", reason: "disabled" });
  });

  it("never matches or creates an address that isn't plain ASCII (no case-folding takeover)", async () => {
    await createTestUser(app, { email: "kate@acme.com", password: "correct horse battery" });
    // KELVIN SIGN: lowercases to an ASCII k.
    fake.user = { ...fake.user, sub: "sub-kelvin", email: "\u212Aate@acme.com" };
    const kelvin = await signIn();
    expect(location(kelvin.response)).toContain("error=not_allowed");
    expect(await sessionUser(kelvin.response)).toBeNull();
    expect(await audit("auth.sso_failed")).toMatchObject([
      { metadata: { reason: "not_allowed", why: "non_ascii_email" } },
    ]);
    fake.user = { ...fake.user, sub: "sub-dotted", email: "\u0130van@acme.com" };
    expect(location((await signIn()).response)).toContain("error=not_allowed");
    expect(
      await t.db.selectFrom("account").select("id").where("provider_id", "=", "acme").execute(),
    ).toEqual([]);
    expect(
      await t.db
        .selectFrom("user")
        .select("email")
        .where("email", "like", "%van@acme.com")
        .execute(),
    ).toEqual([]);
  });

  it("links only the exact address, never one the database's collation calls equal", async () => {
    await createTestUser(app, { email: "k\u00E5te@acme.com", password: "correct horse battery" });
    fake.user = { ...fake.user, sub: "sub-kate", email: "kate@acme.com" };
    const { response } = await signIn();
    const signedIn = await sessionUser(response);
    // Never the accented account. MySQL and MariaDB refuse (the names collide there); SQLite and
    // PostgreSQL tell them apart, so kate@ gets an account of her own.
    expect(signedIn).not.toBe("k\u00E5te@acme.com");
    const links = await t.db
      .selectFrom("account as a")
      .innerJoin("user as u", "u.id", "a.user_id")
      .select("u.email")
      .where("a.provider_id", "=", "acme")
      .execute();
    expect(links.map((l) => l.email)).not.toContain("k\u00E5te@acme.com");
    if (t.dialect === "mysql") {
      expect(location(response)).toContain("error=not_allowed");
      expect(await audit("auth.sso_failed")).toMatchObject([
        { metadata: { reason: "not_allowed", why: "lookalike_email" } },
      ]);
    }
  });

  it("gives a new account a name by Create user's rule", async () => {
    fake.user = { ...fake.user, name: `  ${"\u{1F600}".repeat(300)}  ` };
    await signIn();
    const user = await userByEmail("ana@acme.com");
    expect([...(user?.name ?? "")]).toHaveLength(255);
    expect(user?.name).toBe("\u{1F600}".repeat(255));
    fake.user = { ...fake.user, sub: "sub-bo", email: "bo@acme.com", name: "   " };
    await signIn();
    expect((await userByEmail("bo@acme.com"))?.name).toBe("bo");
  });

  it("lets root sign in when linked by email, and changes nothing about root", async () => {
    fake.user = { ...fake.user, sub: "sub-root", email: "root@acme.com" };
    const { response } = await signIn();
    expect(await sessionUser(response)).toBe("root@acme.com");
    expect((await userByEmail("root@acme.com"))?.role).toBe("root");
  });
});

describe("two first sign-ins at once", () => {
  it("create one account with one link", async () => {
    const begin = async () => {
      const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
      if (!started.ok) throw new Error("not started");
      const back = await followAuthorize(started.url);
      return new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      });
    };
    const requests = [await begin(), await begin()];
    const responses = await Promise.all(
      requests.map((r) => completeSsoSignIn(r, "acme", app, { limiter })),
    );
    expect(responses.map((r) => location(r))).toEqual([`${TEST_BASE_URL}/`, `${TEST_BASE_URL}/`]);
    const users = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "ana@acme.com")
      .execute();
    expect(users).toHaveLength(1);
    const links = await t.db
      .selectFrom("account")
      .select("user_id")
      .where("provider_id", "=", "acme")
      .execute();
    expect(links).toEqual([{ user_id: users[0]?.id }]);
    expect(await audit("user.created")).toHaveLength(1);
  });
});

describe("the sign-in in progress", () => {
  it("goes back to a relative next only: an off-site next lands on /", async () => {
    for (const next of [
      "//evil.example/x",
      "https://evil.example/",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      const { response } = await signIn({ next });
      expect(location(response)).toBe(`${TEST_BASE_URL}/`);
    }
  });

  it("needs the state cookie of the browser that started it", async () => {
    expect(location((await signIn({ cookie: () => null })).response)).toContain("error=expired");
    expect(
      location(
        (await signIn({ cookie: () => `${SSO_STATE_COOKIE}=someone-elses-state` })).response,
      ),
    ).toContain("error=expired");
    expect(await userByEmail("ana@acme.com")).toBeUndefined();
  });

  it("answers expired, not a crash, to a malformed state cookie", async () => {
    const { response } = await signIn({ cookie: () => `${SSO_STATE_COOKIE}=%E0` });
    expect(location(response)).toContain("error=expired");
  });

  it("is taken by one of two callbacks replaying it at once", async () => {
    const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
    if (!started.ok) throw new Error("not started");
    const back = await followAuthorize(started.url);
    const request = () =>
      new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      });
    const responses = await Promise.all(
      [request(), request()].map((r) => completeSsoSignIn(r, "acme", app, { limiter })),
    );
    const codes = responses
      .map((r) => (location(r).includes("error=expired") ? "expired" : "ok"))
      .sort();
    expect(codes).toEqual(["expired", "ok"]);
  });

  it("never opens a session for a Test sign-in's state", async () => {
    const started = await startSsoSignIn(
      new Headers(),
      { provider: "acme", test: { by: root.id, version: new Date().toISOString() } },
      app,
      { limiter },
    );
    if (!started.ok) throw new Error("not started");
    const back = await followAuthorize(started.url);
    const response = await completeSsoSignIn(
      new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      }),
      "acme",
      app,
      { limiter },
    );
    expect(await sessionUser(response)).toBeNull();
    expect(await userByEmail("ana@acme.com")).toBeUndefined();
  });

  it("can be used once", async () => {
    const { back, cookie } = await signIn();
    const again = await completeSsoSignIn(
      new Request(back?.href as string, { headers: { cookie: cookie as string } }),
      "acme",
      app,
      { limiter },
    );
    expect(location(again)).toContain("error=expired");
  });

  it("expires after 10 minutes", async () => {
    const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
    if (!started.ok) throw new Error("not started");
    const back = await followAuthorize(started.url);
    const late = await completeSsoSignIn(
      new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      }),
      "acme",
      app,
      { limiter, now: () => new Date(Date.now() + 11 * 60_000) },
    );
    expect(location(late)).toContain("error=expired");
  });

  it("can't be finished through another provider's callback", async () => {
    const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
    if (!started.ok) throw new Error("not started");
    const back = await followAuthorize(started.url);
    const other = await completeSsoSignIn(
      new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      }),
      "other",
      app,
      { limiter },
    );
    expect(location(other)).toContain("error=expired");
  });

  it("sets a short-lived HttpOnly, SameSite=Lax state cookie scoped to the callback", async () => {
    const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
    expect(started).toMatchObject({
      ok: true,
      cookie: {
        name: SSO_STATE_COOKIE,
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/api/auth/sso/callback",
          maxAge: 600,
          secure: false,
        },
      },
    });
    const { response } = await signIn();
    expect(response?.headers.getSetCookie().join("\n")).toContain(
      `${SSO_STATE_COOKIE}=; Path=/api/auth/sso/callback; Max-Age=0`,
    );
  });
});

describe("providers that can't be used", () => {
  it("won't start or finish with a provider that's off or doesn't exist", async () => {
    expect((await signIn({ provider: "nope" })).started).toEqual({
      ok: false,
      error: "unavailable",
    });
    const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
    if (!started.ok) throw new Error("not started");
    await t.db
      .updateTable("identity_providers")
      .set({ enabled: toDbBoolean(false, t.dialect) })
      .execute();
    expect((await signIn()).started).toEqual({ ok: false, error: "unavailable" });
    const back = await followAuthorize(started.url);
    const response = await completeSsoSignIn(
      new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      }),
      "acme",
      app,
      { limiter },
    );
    expect(location(response)).toContain("error=unavailable");
  });

  it("says provider_error when the provider fails, and counts towards Failing", async () => {
    fake.switches.tokenError = true;
    const { response } = await signIn();
    expect(location(response)).toContain("error=provider_error");
    expect((await deps.repo.find("acme"))?.provider.failures).toBe(1);
    fake.switches.tokenError = false;
    await signIn();
    expect((await deps.repo.find("acme"))?.provider.failures).toBe(0);
  });

  it("is limited per client IP when the proxy is trusted", async () => {
    app = testAppAuth(t, { trustProxy: true });
    limiter = new LoginRateLimiter({ max: 2 });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });
    const start = () => startSsoSignIn(headers, { provider: "acme" }, app, { limiter });
    expect((await start()).ok).toBe(true);
    expect((await start()).ok).toBe(true);
    expect(await start()).toEqual({ ok: false, error: "rate_limited" });
  });

  it("limits the callback per client IP too", async () => {
    app = testAppAuth(t, { trustProxy: true });
    const callbacks = new LoginRateLimiter({ max: 1 });
    const headers = { "x-forwarded-for": "203.0.113.6" };
    const one = await completeSsoSignIn(
      new Request(`${TEST_BASE_URL}/api/auth/sso/callback/acme?state=x`, { headers }),
      "acme",
      app,
      { limiter: callbacks },
    );
    expect(location(one)).toContain("error=expired");
    const two = await completeSsoSignIn(
      new Request(`${TEST_BASE_URL}/api/auth/sso/callback/acme?state=x`, { headers }),
      "acme",
      app,
      { limiter: callbacks },
    );
    expect(location(two)).toContain("error=rate_limited");
  });

  it("opens no session for someone disabled between the decision and the session", async () => {
    const id = await createTestUser(app, {
      email: "cy@acme.com",
      password: "correct horse battery",
    });
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", id)
      .execute();
    expect(await betterAuthSessionStore(app.auth).startSession(new Headers(), id)).toBeNull();
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", id).execute(),
    ).toEqual([]);
  });
});

describe("the HTTP surface", () => {
  it("adds no Better Auth route: the allowlist is unchanged, and the session endpoint is a 404 over HTTP", async () => {
    expect([...HTTP_ENDPOINTS].sort()).toEqual(["/get-session", "/ok"]);
    const user = await createTestUser(app, {
      email: "eve@acme.com",
      password: "correct horse battery",
    });
    const request = () =>
      new Request(`${TEST_BASE_URL}/api/auth/ronne/sso-session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_BASE_URL },
        body: JSON.stringify({ userId: user }),
      });
    expect((await handleAuthRequest(request(), () => app.auth)).status).toBe(404);
    // Even straight to Better Auth's handler, past Ronne's allowlist.
    const direct = await app.auth.handler(request());
    expect(direct.status).toBe(404);
    expect(direct.headers.getSetCookie()).toEqual([]);
  });
});
