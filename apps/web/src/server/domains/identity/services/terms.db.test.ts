import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { memoryRateLimiter } from "../../../rate-limit/memory-store";
import { listAuditEvents } from "../../audit/actions/audit";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { type SignUpInput, setSignUpPolicy } from "../../settings/services/sign-up";
import { authenticateToken, exchangePassword } from "../actions/access-tokens";
import { signIn } from "../actions/session";
import { completeSsoSignIn, SSO_LIMIT, SSO_STATE_COOKIE, startSsoSignIn } from "../actions/sso";
import { acceptTerms, termsToAccept } from "../actions/terms";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import { type FakeOidc, followAuthorize, startFakeOidc } from "../testing/fake-oidc-server";
import { cookieHeaders, createTestUser, TEST_SECRET, testAppAuth } from "../testing/test-auth";
import { createProvider, enableProvider, markProviderTested } from "./identity-providers";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default).
let t: TestDb;
let app: AppAuth;
let root: CurrentUser;
const PASSWORD = "correct horse battery";
const READY = { mail: true, contact: true, password: true };

/**
 * Root's terms, as the Self-registration panel saves them. A few milliseconds apart from what came
 * before: the hold compares an acceptance's time with when root asked.
 */
const terms = async (version: string, askAgain: boolean, extra: Partial<SignUpInput> = {}) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return setSignUpPolicy(
    { repo: kyselySettingsRepository(t.db, t.dialect) },
    { user: root, ip: null },
    {
      enabled: false,
      domainsMode: "any",
      codeMinutes: "15",
      termsUrl: "https://acme.com/terms",
      termsVersion: version,
      askAgain,
      ...extra,
    },
    READY,
  );
};

/** A web sign-in with a password: the session's cookie, as the browser sends it back. */
const passwordSession = async (email: string) => {
  const result = await signIn(new Headers(), { email, password: PASSWORD, rememberMe: false }, app);
  if (!result.ok) throw new Error(`sign-in refused: ${result.error}`);
  return cookieHeaders(result.headers.getSetCookie().join(", "));
};
const rows = () =>
  t.db
    .selectFrom("terms_acceptances")
    .select(["user_id", "version"])
    .orderBy("accepted_at")
    .execute();

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  const id = await createTestUser(app, {
    email: "root@acme.com",
    password: PASSWORD,
    role: "root",
  });
  root = { id, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  await createTestUser(app, { email: "ana@acme.com", password: PASSWORD });
});
afterEach(() => t.cleanup());

describe("accepting new terms (190)", () => {
  it("asks nothing with no terms link, or a version change root didn't ask everyone to accept", async () => {
    const session = await passwordSession("ana@acme.com");
    expect(await termsToAccept(session, app)).toBeNull();
    await terms("2026-10", false);
    expect(await termsToAccept(session, app)).toBeNull();
    await terms("2026-11", false);
    expect(await termsToAccept(session, app)).toBeNull();
  });

  it("holds a password sign-in once root asks everyone to accept the new version", async () => {
    await terms("2026-11", true);
    const session = await passwordSession("ana@acme.com");
    expect(await termsToAccept(session, app)).toEqual({
      url: "https://acme.com/terms",
      version: "2026-11",
    });
    // No session, nothing asked.
    expect(await termsToAccept(new Headers(), app)).toBeNull();
  });

  it("keeps access tokens working while their owner is held: the web asks, the API doesn't", async () => {
    await terms("2026-11", true);
    const exchanged = await exchangePassword(
      { email: "ana@acme.com", password: PASSWORD },
      new Headers(),
      app,
    );
    if (!exchanged.ok) throw new Error("the exchange was refused");
    expect(await termsToAccept(await passwordSession("ana@acme.com"), app)).not.toBeNull();
    expect((await authenticateToken(exchanged.token.token, app)).ok).toBe(true);
  });

  it("records each acceptance once, with its version, and audits it", async () => {
    await terms("2026-11", true);
    const session = await passwordSession("ana@acme.com");
    expect(await acceptTerms(session, { accepted: false, version: "2026-11" }, app)).toEqual({
      ok: false,
      error: "unticked",
    });
    // A page open since before root changed it again.
    expect(await acceptTerms(session, { accepted: true, version: "2026-10" }, app)).toEqual({
      ok: false,
      error: "changed",
    });
    expect(await acceptTerms(session, { accepted: true, version: "2026-11" }, app)).toEqual({
      ok: true,
    });
    expect(await acceptTerms(session, { accepted: true, version: "2026-11" }, app)).toEqual({
      ok: true,
    });
    expect(await termsToAccept(session, app)).toBeNull();
    await terms("2027-01", true);
    expect(await termsToAccept(session, app)).toMatchObject({ version: "2027-01" });
    await acceptTerms(session, { accepted: true, version: "2027-01" }, app);
    const ana = (await rows()).filter((r) => r.user_id !== root.id).map((r) => r.version);
    expect(ana).toEqual(["2026-11", "2027-01"]);
    const audited = (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.filter(
      (e) => e.action === "user.terms_accepted",
    );
    expect(audited.map((e) => e.metadata.version).sort()).toEqual(["2026-11", "2027-01"]);
  });

  it("doesn't hold a sign-up that accepted a version root changed to without asking everyone", async () => {
    await terms("2026-11", true);
    await terms("2026-12", false);
    // What sign-up records for someone who signs up now: the version the link shows.
    const ana = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto("terms_acceptances")
      .values({
        id: "01TERMSAT2026120000000000A",
        user_id: ana.id,
        version: "2026-12",
        accepted_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    expect(await termsToAccept(await passwordSession("ana@acme.com"), app)).toBeNull();
  });

  it("asks someone held for the version the link shows, and records that one", async () => {
    await terms("2026-11", true);
    await terms("2026-12", false);
    const session = await passwordSession("ana@acme.com");
    expect(await termsToAccept(session, app)).toEqual({
      url: "https://acme.com/terms",
      version: "2026-12",
    });
    expect(await acceptTerms(session, { accepted: true, version: "2026-11" }, app)).toEqual({
      ok: false,
      error: "changed",
    });
    expect(await acceptTerms(session, { accepted: true, version: "2026-12" }, app)).toEqual({
      ok: true,
    });
    expect(await termsToAccept(session, app)).toBeNull();
    const ana = (await rows()).filter((r) => r.user_id !== root.id).map((r) => r.version);
    expect(ana).toEqual(["2026-12"]);
  });

  it("asks no one again after several changes root didn't ask everyone to accept", async () => {
    await terms("2026-11", true);
    await terms("2026-12", false);
    const session = await passwordSession("ana@acme.com");
    await acceptTerms(session, { accepted: true, version: "2026-12" }, app);
    // A sign-up on 2026-12, as sign-up records it.
    const bo = await createTestUser(app, { email: "bo@acme.com", password: PASSWORD });
    await t.db
      .insertInto("terms_acceptances")
      .values({
        id: "01TERMSAT2026120000000000B",
        user_id: bo,
        version: "2026-12",
        accepted_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    await terms("2027-01", false);
    await terms("2027-02", false);
    expect(await termsToAccept(session, app)).toBeNull();
    expect(await termsToAccept(await passwordSession("bo@acme.com"), app)).toBeNull();
    // Ticked, everyone is asked again, for the version the link shows.
    await terms("2027-03", true);
    expect(await termsToAccept(session, app)).toMatchObject({ version: "2027-03" });
  });

  it("doesn't count an acceptance from before root asked, and keeps the asked version's time when other settings change", async () => {
    const session = await passwordSession("ana@acme.com");
    await terms("2026-10", false);
    await acceptTerms(session, { accepted: true, version: "2026-10" }, app);
    // 2026-10 was never asked of everyone, so nothing was recorded; force an old acceptance.
    const ana = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto("terms_acceptances")
      .values({
        id: "01TERMSAT2026100000000000A",
        user_id: ana.id,
        version: "2026-10",
        accepted_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    await terms("2026-11", true);
    expect(await termsToAccept(session, app)).toMatchObject({ version: "2026-11" });
    await acceptTerms(session, { accepted: true, version: "2026-11" }, app);
    // Another setting changes: the time root asked doesn't move, so no one is asked again.
    await terms("2026-11", false, { codeMinutes: "30" });
    expect(await termsToAccept(session, app)).toBeNull();
  });

  it("asks again when root reuses an old label, and Continue then lets the person through", async () => {
    const session = await passwordSession("ana@acme.com");
    await terms("2026-10", true);
    await acceptTerms(session, { accepted: true, version: "2026-10" }, app);
    await terms("2026-11", true);
    await terms("2026-10", false);
    // Root asked after her 2026-10: she's asked again, for the version the link shows.
    expect(await termsToAccept(session, app)).toMatchObject({ version: "2026-10" });
    expect(await acceptTerms(session, { accepted: true, version: "2026-10" }, app)).toEqual({
      ok: true,
    });
    expect(await termsToAccept(session, app)).toBeNull();
    const ana = (await rows()).filter((r) => r.user_id !== root.id).map((r) => r.version);
    expect(ana).toEqual(["2026-10", "2026-10"]);
    // Back to a label used before with Ask everyone ticked: everyone is asked, her included.
    await terms("2026-11", false);
    await terms("2026-10", true);
    expect(await termsToAccept(session, app)).toMatchObject({ version: "2026-10" });
  });

  it("never records an acceptance before root asked, whatever this server's clock says", async () => {
    const session = await passwordSession("ana@acme.com");
    // Root's save on a server an hour ahead.
    await setSignUpPolicy(
      {
        repo: kyselySettingsRepository(t.db, t.dialect),
        now: () => new Date(Date.now() + 3_600_000),
      },
      { user: root, ip: null },
      {
        enabled: false,
        domainsMode: "any",
        codeMinutes: "15",
        termsUrl: "https://acme.com/terms",
        termsVersion: "2026-11",
        askAgain: true,
      },
      READY,
    );
    expect(await termsToAccept(session, app)).not.toBeNull();
    await acceptTerms(session, { accepted: true, version: "2026-11" }, app);
    expect(await termsToAccept(session, app)).toBeNull();
  });

  it("records one row for two acceptances at once", async () => {
    await terms("2026-11", true);
    const session = await passwordSession("ana@acme.com");
    await Promise.all(
      [1, 2, 3].map(() => acceptTerms(session, { accepted: true, version: "2026-11" }, app)),
    );
    expect((await rows()).filter((r) => r.user_id !== root.id)).toHaveLength(1);
  });

  it("asks root too, and a later unticked change leaves the accepted version standing", async () => {
    await terms("2026-11", true);
    const session = await passwordSession("root@acme.com");
    expect(await termsToAccept(session, app)).not.toBeNull();
    await acceptTerms(session, { accepted: true, version: "2026-11" }, app);
    await terms("2026-12", false);
    expect(await termsToAccept(session, app)).toBeNull();
  });
});

describe("accepting new terms after a provider's sign-in (190)", () => {
  let fake: FakeOidc;
  beforeEach(async () => {
    fake = await startFakeOidc();
  });
  afterEach(async () => {
    await fake.close();
  });

  it("holds it as it holds a password's", async () => {
    const deps = {
      repo: kyselyIdentityProviderRepository(t.db, t.dialect),
      types: PROVIDER_TYPES,
      authSecret: TEST_SECRET,
    };
    const actor = { user: root, ip: null };
    const created = await createProvider(deps, actor, "acme", {
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
    await markProviderTested(deps, actor, "acme", created.updatedAt);
    await enableProvider(deps, actor, "acme");
    await terms("2026-11", true);

    const limiter = memoryRateLimiter({ ...SSO_LIMIT, max: 1000 });
    const started = await startSsoSignIn(new Headers(), { provider: "acme" }, app, { limiter });
    if (!started.ok) throw new Error("the provider sign-in didn't start");
    const back = await followAuthorize(started.url);
    const response = await completeSsoSignIn(
      new Request(back.href, {
        headers: { cookie: `${SSO_STATE_COOKIE}=${started.cookie.value}` },
      }),
      "acme",
      app,
      { limiter },
    );
    const session = cookieHeaders((response?.headers.getSetCookie() ?? []).join(", "));
    const user = await app.auth.api.getSession({ headers: session });
    expect(user?.user.email).toBeTruthy();
    expect(await termsToAccept(session, app)).toEqual({
      url: "https://acme.com/terms",
      version: "2026-11",
    });
  });
});
