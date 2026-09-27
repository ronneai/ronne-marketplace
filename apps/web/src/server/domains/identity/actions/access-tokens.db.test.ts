import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import {
  ForbiddenError,
  TokenLimitError,
  TokenNameTakenError,
  TokenNotFoundError,
} from "../exceptions/errors";
import { hashToken, MAX_ACTIVE_TOKENS } from "../models/access-token";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyTokenRepository } from "../repositories/kysely-token-repository";
import * as service from "../services/access-tokens";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { authenticateToken, createMyToken, listMyTokens, revokeMyToken } from "./access-tokens";
import { getCurrentUser, signIn } from "./session";

let t: TestDb;
let app: AppAuth;
let userId: string;
let asUser: Headers;
const password = "correct horse battery";

const headersFor = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, { email: "u@example.com", password });
  asUser = await headersFor("u@example.com");
});
afterEach(() => t.cleanup());

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("createMyToken", () => {
  it("returns the plain token once, and stores only its hash and prefix", async () => {
    const created = await createMyToken(asUser, { name: " laptop ", lifetime: "30" }, app);
    expect(created.token).toMatch(/^rmk_[A-Za-z0-9_-]{43}$/);
    expect(created.name).toBe("laptop");

    const row = await t.db
      .selectFrom("access_tokens")
      .selectAll()
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();
    expect(row.token_hash).toBe(hashToken(created.token));
    expect(row.token_prefix).toBe(created.token.slice(0, 12));
    expect(JSON.stringify(row)).not.toContain(created.token);
    const days = (fromDbDate(row.expires_at as string).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    const [event] = await events("access_token.created");
    expect(event).toMatchObject({
      actorId: userId,
      targetId: created.id,
      metadata: { name: "laptop", via: "web" },
    });
    expect(JSON.stringify(event)).not.toContain(created.token);
  });

  it("defaults to 90 days, and allows no expiry", async () => {
    const standard = await createMyToken(asUser, { name: "a" }, app);
    expect(Math.round(((standard.expiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000)).toBe(90);
    expect(
      (await createMyToken(asUser, { name: "b", lifetime: "none" }, app)).expiresAt,
    ).toBeNull();
  });

  it("refuses a duplicate active name, but not one that's been revoked", async () => {
    const first = await createMyToken(asUser, { name: "ci" }, app);
    await expect(createMyToken(asUser, { name: "ci" }, app)).rejects.toThrow(TokenNameTakenError);
    await revokeMyToken(asUser, first.id, app);
    await expect(createMyToken(asUser, { name: "ci" }, app)).resolves.toMatchObject({ name: "ci" });
  });

  it("refuses the 51st active token", async () => {
    const repo = kyselyTokenRepository(t.db, t.dialect);
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) {
      await repo.insert({
        userId,
        name: `t${i}`,
        tokenHash: hashToken(`seed-${i}`),
        tokenPrefix: "rmk_seed0000",
        expiresAt: null,
        createdAt: new Date(),
      });
    }
    await expect(createMyToken(asUser, { name: "one more" }, app)).rejects.toThrow(TokenLimitError);
    expect(await events("access_token.created")).toEqual([]);
  });

  it("needs a signed-in user", async () => {
    await expect(createMyToken(new Headers(), { name: "x" }, app)).rejects.toThrow(ForbiddenError);
  });
});

describe("listMyTokens and revokeMyToken", () => {
  it("lists only your own tokens, newest first, without the secret", async () => {
    await createTestUser(app, { email: "other@example.com", password });
    await createMyToken(await headersFor("other@example.com"), { name: "theirs" }, app);
    await createMyToken(asUser, { name: "first" }, app);
    const second = await createMyToken(asUser, { name: "second" }, app);

    const mine = await listMyTokens(asUser, app);
    expect(mine.map((token) => token.name)).toEqual(["second", "first"]);
    expect(mine[0]?.preview).toBe(second.token.slice(0, 12));
    expect(JSON.stringify(mine)).not.toContain(second.token);
  });

  it("revokes your own token, audited, and refuses someone else's as not found", async () => {
    const mine = await createMyToken(asUser, { name: "laptop" }, app);
    await createTestUser(app, { email: "other@example.com", password });
    const theirs = await createMyToken(await headersFor("other@example.com"), { name: "x" }, app);

    await expect(revokeMyToken(asUser, theirs.id, app)).rejects.toThrow(TokenNotFoundError);
    await revokeMyToken(asUser, mine.id, app);
    await revokeMyToken(asUser, mine.id, app);

    expect((await listMyTokens(asUser, app))[0]?.revokedAt).toBeInstanceOf(Date);
    const revoked = await events("access_token.revoked");
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.metadata).toEqual({ name: "laptop", by: "owner" });
  });
});

describe("authenticateToken", () => {
  it("accepts a valid token and returns its user and metadata", async () => {
    const created = await createMyToken(asUser, { name: "cli" }, app);
    const result = await authenticateToken(created.token, app);
    expect(result).toEqual({
      ok: true,
      value: {
        user: { id: userId, email: "u@example.com", name: "Someone", role: "user" },
        token: { id: created.id, name: "cli", expiresAt: created.expiresAt },
      },
    });
  });

  it("refuses missing, malformed, unknown, expired, revoked and disabled-user tokens", async () => {
    expect(await authenticateToken(null, app)).toEqual({ ok: false, failure: "token_missing" });
    expect(await authenticateToken("not-a-token", app)).toEqual({
      ok: false,
      failure: "token_invalid",
    });
    expect(await authenticateToken(`rmk_${"a".repeat(43)}`, app)).toEqual({
      ok: false,
      failure: "token_invalid",
    });

    const expiring = await createMyToken(asUser, { name: "short", lifetime: "30" }, app);
    await t.db
      .updateTable("access_tokens")
      .set({ expires_at: toDbDate(new Date(Date.now() - 1000), t.dialect) })
      .where("id", "=", expiring.id)
      .execute();
    expect(await authenticateToken(expiring.token, app)).toEqual({
      ok: false,
      failure: "token_expired",
    });

    const revoked = await createMyToken(asUser, { name: "gone" }, app);
    await revokeMyToken(asUser, revoked.token ? revoked.id : "", app);
    expect(await authenticateToken(revoked.token, app)).toEqual({
      ok: false,
      failure: "token_revoked",
    });

    const live = await createMyToken(asUser, { name: "live" }, app);
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    expect(await authenticateToken(live.token, app)).toEqual({
      ok: false,
      failure: "user_disabled",
    });
    expect(await getCurrentUser(asUser, app)).toBeNull();
  });

  it("updates last_used_at at most once a minute", async () => {
    const created = await createMyToken(asUser, { name: "busy" }, app);
    const lastUsed = async () =>
      (
        await t.db
          .selectFrom("access_tokens")
          .select("last_used_at")
          .where("id", "=", created.id)
          .executeTakeFirstOrThrow()
      ).last_used_at;
    const repo = kyselyTokenRepository(t.db, t.dialect);
    // A clock that starts now: a fixed date could fall after the token's 90-day expiry.
    const base = Date.now();
    const at = (ms: number) => ({ repo, now: () => new Date(base + ms) });

    expect(await lastUsed()).toBeNull();
    await service.authenticateToken(at(0), created.token);
    const first = fromDbDate(await lastUsed());
    expect(first?.getTime()).toBe(base);
    await service.authenticateToken(at(30_000), created.token);
    expect(fromDbDate(await lastUsed())).toEqual(first);
    await service.authenticateToken(at(61_000), created.token);
    expect(fromDbDate(await lastUsed())?.getTime()).toBe(base + 61_000);
  });
});
