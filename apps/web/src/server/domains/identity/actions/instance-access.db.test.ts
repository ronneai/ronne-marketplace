import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { requireToken } from "../../../http/require-token";
import { listAuditEvents } from "../../audit/actions/audit";
import { UserNotFoundError } from "../exceptions/errors";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { authenticateToken, createMyToken } from "./access-tokens";
import { accessToRevoke, revokeAccess } from "./instance-access";
import { createRoot } from "./root-account";
import { getCurrentUser, requireUser, signIn } from "./session";
import { adminDisableUser } from "./user-admin";

let t: TestDb;
let app: AppAuth;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "ada@example.com", password });
  await createTestUser(app, { email: "bob@example.com", password });
});
afterEach(() => t.cleanup());

/** A fresh limiter per sign-in, so the tests never hit the rate limit. */
const sessionFor = async (email: string) => {
  const result = await signIn(
    new Headers(),
    { email, password, rememberMe: false },
    testAppAuth(t),
  );
  if (!result.ok) throw new Error(`sign-in failed for ${email}`);
  return cookieHeaders(result.headers.get("set-cookie"));
};

let tokenCount = 0;
const tokenFor = async (headers: Headers) =>
  (await createMyToken(headers, { name: `laptop ${++tokenCount}` }, app)).token;

const signedIn = async (headers: Headers) => (await getCurrentUser(headers, app)) !== null;
const tokenWorks = async (token: string) => (await authenticateToken(token, app)).ok;

const events = async () =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter(
    (e) => e.action === "instance.access_revoked",
  );

const both = { sessions: true, tokens: true };

describe("revoke-access --everyone", () => {
  it("ends every session and revokes every token, root's included, in one audited step", async () => {
    const root = await sessionFor("root@example.com");
    const ada = await sessionFor("ada@example.com");
    const bob = await sessionFor("bob@example.com");
    const tokens = [await tokenFor(root), await tokenFor(ada), await tokenFor(ada)];

    expect(await accessToRevoke(t.db, t.dialect, { kind: "everyone" })).toEqual({
      sessions: 3,
      tokens: 3,
    });
    expect(await revokeAccess(t.db, t.dialect, { kind: "everyone" }, both)).toEqual({
      sessions: 3,
      tokens: 3,
    });

    // The next request: no session, no token works.
    for (const headers of [root, ada, bob]) expect(await signedIn(headers)).toBe(false);
    for (const token of tokens) expect(await tokenWorks(token)).toBe(false);
    expect(await authenticateToken(tokens[0] ?? "", app)).toEqual({
      ok: false,
      failure: "token_revoked",
    });

    const [event, ...rest] = await events();
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      actorId: null,
      targetType: "instance",
      targetId: null,
      metadata: { via: "cli", scope: "everyone", sessionsEnded: 3, tokensRevoked: 3 },
    });
  });

  it("leaves accounts and passwords as they were: everyone signs in again", async () => {
    await sessionFor("ada@example.com");
    await revokeAccess(t.db, t.dialect, { kind: "everyone" }, both);
    const ada = await sessionFor("ada@example.com");
    expect(await signedIn(ada)).toBe(true);
    const disabled = await t.db
      .selectFrom("user")
      .select("id")
      .where("disabled_at", "is not", null)
      .execute();
    expect(disabled).toEqual([]);
  });

  it("--sessions-only keeps tokens, and --tokens-only keeps sessions", async () => {
    const ada = await sessionFor("ada@example.com");
    const token = await tokenFor(ada);

    expect(
      await revokeAccess(t.db, t.dialect, { kind: "everyone" }, { sessions: true, tokens: false }),
    ).toEqual({ sessions: 1, tokens: 0 });
    expect(await signedIn(ada)).toBe(false);
    expect(await tokenWorks(token)).toBe(true);

    const again = await sessionFor("ada@example.com");
    expect(
      await revokeAccess(t.db, t.dialect, { kind: "everyone" }, { sessions: false, tokens: true }),
    ).toEqual({ sessions: 0, tokens: 1 });
    expect(await signedIn(again)).toBe(true);
    expect(await tokenWorks(token)).toBe(false);
  });

  it("a second run finds nothing left, and says so with zeros", async () => {
    await tokenFor(await sessionFor("ada@example.com"));
    await revokeAccess(t.db, t.dialect, { kind: "everyone" }, both);
    expect(await accessToRevoke(t.db, t.dialect, { kind: "everyone" })).toEqual({
      sessions: 0,
      tokens: 0,
    });
    expect(await revokeAccess(t.db, t.dialect, { kind: "everyone" }, both)).toEqual({
      sessions: 0,
      tokens: 0,
    });
  });

  it("two runs at once revoke each session and token once between them", async () => {
    await sessionFor("ada@example.com");
    await sessionFor("bob@example.com");
    await tokenFor(await sessionFor("root@example.com"));
    const [a, b] = await Promise.all([
      revokeAccess(t.db, t.dialect, { kind: "everyone" }, both),
      revokeAccess(t.db, t.dialect, { kind: "everyone" }, both),
    ]);
    expect((a?.sessions ?? 0) + (b?.sessions ?? 0)).toBe(3);
    expect((a?.tokens ?? 0) + (b?.tokens ?? 0)).toBe(1);
    expect(await events()).toHaveLength(2);
  });
});

describe("the next request after revoke-access", () => {
  it("gets 401 from the API with a revoked token, and a sign-in redirect with an ended session", async () => {
    const ada = await sessionFor("ada@example.com");
    const token = await tokenFor(ada);
    const apiCall = () =>
      requireToken(
        new Request("http://localhost:3000/api/v1/me", {
          headers: { authorization: `Bearer ${token}` },
        }),
        { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
      );
    expect((await apiCall()).ok).toBe(true);
    await expect(requireUser(ada, app)).resolves.toMatchObject({ email: "ada@example.com" });

    await revokeAccess(t.db, t.dialect, { kind: "everyone" }, both);

    const refused = await apiCall();
    if (refused.ok) throw new Error("expected the token to be refused");
    expect(refused.response.status).toBe(401);
    expect(await refused.response.json()).toMatchObject({ error: { code: "token_revoked" } });
    await expect(requireUser(ada, app)).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("revoke-access --user", () => {
  it("ends only that person's sessions and tokens, audited on them", async () => {
    const ada = await sessionFor("ada@example.com");
    const bob = await sessionFor("bob@example.com");
    const adaToken = await tokenFor(ada);
    const bobToken = await tokenFor(bob);

    expect(
      await accessToRevoke(t.db, t.dialect, { kind: "user", email: " Ada@Example.com " }),
    ).toEqual({ email: "ada@example.com", sessions: 1, tokens: 1 });
    expect(
      await revokeAccess(t.db, t.dialect, { kind: "user", email: "ada@example.com" }, both),
    ).toEqual({ email: "ada@example.com", sessions: 1, tokens: 1 });

    expect(await signedIn(ada)).toBe(false);
    expect(await tokenWorks(adaToken)).toBe(false);
    expect(await signedIn(bob)).toBe(true);
    expect(await tokenWorks(bobToken)).toBe(true);

    const [event] = await events();
    expect(event).toMatchObject({
      targetType: "user",
      targetEmail: "ada@example.com",
      metadata: {
        via: "cli",
        scope: "user",
        email: "ada@example.com",
        sessionsEnded: 1,
        tokensRevoked: 1,
      },
    });
  });

  it("refuses an unknown email and changes nothing", async () => {
    const ada = await sessionFor("ada@example.com");
    await expect(
      accessToRevoke(t.db, t.dialect, { kind: "user", email: "nobody@example.com" }),
    ).rejects.toThrow(UserNotFoundError);
    await expect(
      revokeAccess(t.db, t.dialect, { kind: "user", email: "nobody@example.com" }, both),
    ).rejects.toThrow(UserNotFoundError);
    expect(await signedIn(ada)).toBe(true);
    expect(await events()).toEqual([]);
  });

  it("a disabled person has nothing left to revoke", async () => {
    const root = await sessionFor("root@example.com");
    const ada = await sessionFor("ada@example.com");
    await tokenFor(ada);
    const adaId = (
      await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "ada@example.com")
        .executeTakeFirstOrThrow()
    ).id;
    await adminDisableUser(root, adaId, app);
    expect(
      await accessToRevoke(t.db, t.dialect, { kind: "user", email: "ada@example.com" }),
    ).toEqual({ email: "ada@example.com", sessions: 0, tokens: 0 });
  });
});
