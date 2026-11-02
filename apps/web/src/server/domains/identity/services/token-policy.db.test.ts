import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { createPersonalWorkspace } from "../../../db/personal-workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { tokenDeps } from "../actions/token-deps";
import { ForbiddenError } from "../exceptions/errors";
import { hashToken } from "../models/access-token";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselyTokenRepository } from "../repositories/kysely-token-repository";
import type { TokenRepository } from "../repositories/token-repository";
import { createTestUser, testAppAuth } from "../testing/test-auth";
import type { TokenDeps } from "./access-tokens";
import { countTokensPastPolicy, shortenTokens } from "./token-policy";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let deps: TokenDeps;
let root: CurrentUser;
let plain: CurrentUser;
let mod: CurrentUser;
const NOW = new Date("2026-11-01T12:00:00.000Z");
const DAY = 86_400_000;
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

const userOf = async (id: string) => {
  const user = await kyselyIdentityRepository(t.db, t.dialect).findActiveUser(id);
  if (!user) throw new Error("no user");
  return user;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  deps = { ...tokenDeps(t), now: () => NOW };
  const password = "correct horse battery";
  root = await userOf(
    await createTestUser(app, { email: "root@example.com", password, role: "root" }),
  );
  const plainId = await createTestUser(app, { email: "u@example.com", password });
  // A real plain user: admin of their own personal workspace (114), not a reviewer.
  await createPersonalWorkspace(t.db, t.dialect, { id: plainId, email: "u@example.com" }, NOW);
  plain = await userOf(plainId);
  mod = await userOf(
    await createTestUser(app, { email: "mod@example.com", password, role: "moderator" }),
  );
});
afterEach(() => t.cleanup());

let seq = 0;
/** A token as an older instance made it, without the policy: straight into the table. */
const seed = async (
  user: CurrentUser,
  expiresAt: Date | null,
  extra: { revokedAt?: Date } = {},
): Promise<string> => {
  seq += 1;
  const id = await kyselyTokenRepository(t.db, t.dialect).insert({
    userId: user.id,
    name: `t${seq}`,
    tokenHash: hashToken(`seed-${seq}`),
    tokenPrefix: "rmk_seed0000",
    expiresAt,
    createdAt: inDays(-400),
    via: "web",
  });
  if (extra.revokedAt)
    await t.db
      .updateTable("access_tokens")
      .set({ revoked_at: toDbDate(extra.revokedAt, t.dialect) })
      .where("id", "=", id)
      .execute();
  return id;
};

const expiryOf = async (id: string) =>
  fromDbDate(
    (
      await t.db
        .selectFrom("access_tokens")
        .select("expires_at")
        .where("id", "=", id)
        .executeTakeFirstOrThrow()
    ).expires_at,
  );

const setPolicy = async (everyone: string, reviewers: string) => {
  const settings = kyselySettingsRepository(t.db, t.dialect);
  await settings.set("token_max_days", everyone, null, NOW);
  await settings.set("token_max_days_reviewers", reviewers, null, NOW);
};

const shortened = async () =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter(
    (e) => e.action === "access_token.shortened",
  );

const rootActor = () => ({ user: root, ip: "203.0.113.7" });

describe("Shorten (162)", () => {
  it("counts and shortens the active tokens past each owner's cap, and leaves the rest", async () => {
    // Root's defaults: 365 for everyone, 90 for reviewers and root.
    const tokens = {
      plainForever: await seed(plain, null),
      plainLong: await seed(plain, inDays(400)),
      plainWithin: await seed(plain, inDays(300)),
      modForever: await seed(mod, null),
      modLong: await seed(mod, inDays(100)),
      modWithin: await seed(mod, inDays(50)),
      rootLong: await seed(root, inDays(200)),
      expired: await seed(mod, inDays(-1)),
      revoked: await seed(plain, null, { revokedAt: inDays(-2) }),
      revokedLong: await seed(mod, inDays(500), { revokedAt: inDays(-2) }),
    };
    expect(await countTokensPastPolicy(deps, rootActor())).toBe(5);

    expect(await shortenTokens(deps, rootActor())).toEqual({ count: 5 });
    expect(await expiryOf(tokens.plainForever)).toEqual(inDays(365));
    expect(await expiryOf(tokens.plainLong)).toEqual(inDays(365));
    expect(await expiryOf(tokens.plainWithin)).toEqual(inDays(300));
    expect(await expiryOf(tokens.modForever)).toEqual(inDays(90));
    expect(await expiryOf(tokens.modLong)).toEqual(inDays(90));
    expect(await expiryOf(tokens.modWithin)).toEqual(inDays(50));
    expect(await expiryOf(tokens.rootLong)).toEqual(inDays(90));
    // Expired and revoked tokens are left alone, and nothing is revoked.
    expect(await expiryOf(tokens.expired)).toEqual(inDays(-1));
    expect(await expiryOf(tokens.revoked)).toBeNull();
    expect(await expiryOf(tokens.revokedLong)).toEqual(inDays(500));
    const revoked = await t.db
      .selectFrom("access_tokens")
      .select("id")
      .where("revoked_at", "is not", null)
      .execute();
    expect(revoked.map((row) => row.id).sort()).toEqual(
      [tokens.revoked, tokens.revokedLong].sort(),
    );

    expect(
      (await shortened()).map((e) => [e.actorId, e.ipAddress, e.targetType, e.metadata]),
    ).toEqual([[root.id, "203.0.113.7", "instance", { count: 5, days: 365, reviewersDays: 90 }]]);
    // A second run finds nothing, and records nothing.
    expect(await countTokensPastPolicy(deps, rootActor())).toBe(0);
    expect(await shortenTokens(deps, rootActor())).toEqual({ count: 0 });
    expect(await shortened()).toHaveLength(1);
  });

  it("follows the caps root set, no limit included", async () => {
    const forever = await seed(plain, null);
    const modForever = await seed(mod, null);
    await setPolicy("none", "none");
    expect(await countTokensPastPolicy(deps, rootActor())).toBe(0);
    expect(await shortenTokens(deps, rootActor())).toEqual({ count: 0 });
    expect(await shortened()).toEqual([]);

    await setPolicy("none", "30");
    expect(await countTokensPastPolicy(deps, rootActor())).toBe(1);
    expect(await shortenTokens(deps, rootActor())).toEqual({ count: 1 });
    expect(await expiryOf(forever)).toBeNull();
    expect(await expiryOf(modForever)).toEqual(inDays(30));
    expect((await shortened())[0]?.metadata).toEqual({ count: 1, days: null, reviewersDays: 30 });

    await setPolicy("90", "30");
    expect(await shortenTokens(deps, rootActor())).toEqual({ count: 1 });
    expect(await expiryOf(forever)).toEqual(inDays(90));
  });

  it("reads each owner's cap as it is today", async () => {
    const before = await seed(plain, inDays(200));
    // The plain user becomes a moderator of a shared workspace: the reviewers' 90 days now.
    await t.db
      .updateTable("workspace_members")
      .set({ role: "moderator" })
      .where("user_id", "=", plain.id)
      .where("workspace_id", "!=", plain.personal ?? "")
      .execute();
    expect(await shortenTokens(deps, rootActor())).toEqual({ count: 1 });
    expect(await expiryOf(before)).toEqual(inDays(90));
  });

  it("counts what it changed, not what it found: a token revoked meanwhile isn't counted", async () => {
    const kept = await seed(plain, null);
    const revokedMeanwhile = await seed(mod, null);
    const racing = (repo: TokenRepository): TokenRepository => ({
      ...repo,
      transaction: (work) => repo.transaction((inner) => work(racing(inner))),
      shortenTo: async (ids, expiresAt) => {
        // Between the look-up and the update, someone revokes one of them.
        await repo.revoke(revokedMeanwhile, NOW);
        return repo.shortenTo(ids, expiresAt);
      },
    });
    expect(await shortenTokens({ ...deps, repo: racing(deps.repo) }, rootActor())).toEqual({
      count: 1,
    });
    expect(await expiryOf(kept)).toEqual(inDays(365));
    expect(await expiryOf(revokedMeanwhile)).toBeNull();
    expect((await shortened())[0]?.metadata).toMatchObject({ count: 1 });
  });

  it("is root's alone", async () => {
    const forever = await seed(plain, null);
    for (const user of [plain, mod, null]) {
      await expect(countTokensPastPolicy(deps, { user, ip: null })).rejects.toThrow(ForbiddenError);
      await expect(shortenTokens(deps, { user, ip: null })).rejects.toThrow(ForbiddenError);
    }
    expect(await expiryOf(forever)).toBeNull();
    expect(await shortened()).toEqual([]);
  });

  it("writes in batches of 500, all in one transaction", async () => {
    const total = 1003;
    const rows = Array.from({ length: total }, (_, i) => ({
      id: `tok${String(i).padStart(5, "0")}`,
      user_id: plain.id,
      name: `bulk ${i}`,
      token_hash: hashToken(`bulk-${i}`),
      token_prefix: "rmk_bulk0000",
      expires_at: null,
      created_at: toDbDate(inDays(-400), t.dialect),
      created_via: "web",
    }));
    for (let i = 0; i < rows.length; i += 200)
      await t.db
        .insertInto("access_tokens")
        .values(rows.slice(i, i + 200))
        .execute();

    const batches: number[] = [];
    let failOn = 0;
    const counting = (repo: TokenRepository): TokenRepository => ({
      ...repo,
      transaction: (work) => repo.transaction((inner) => work(counting(inner))),
      shortenTo: async (ids, expiresAt) => {
        batches.push(ids.length);
        if (batches.length === failOn) throw new Error("the database went away");
        return repo.shortenTo(ids, expiresAt);
      },
    });
    const watched = { ...deps, repo: counting(deps.repo) };

    // A failure in the third batch changes nothing: one transaction.
    failOn = 3;
    await expect(shortenTokens(watched, rootActor())).rejects.toThrow("the database went away");
    expect(await expiryOf(rows[0]?.id ?? "")).toBeNull();
    expect(await shortened()).toEqual([]);

    batches.length = 0;
    failOn = 0;
    expect(await shortenTokens(watched, rootActor())).toEqual({ count: total });
    expect(batches).toEqual([500, 500, 3]);
    const left = await t.db
      .selectFrom("access_tokens")
      .select("id")
      .where("user_id", "=", plain.id)
      .where("expires_at", "is", null)
      .execute();
    expect(left).toEqual([]);
  });
});
