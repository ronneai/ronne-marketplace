import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { logger, setLoggerForTests } from "../../../log";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../actions/root-account";
import {
  ForbiddenError,
  NoScimTokenError,
  ProviderNotFoundError,
  ScimOffError,
  ScimTokenExistsError,
} from "../exceptions/errors";
import { hashScimToken } from "../models/scim-token";
import type { CurrentUser } from "../models/user";
import { kyselyScimTokenRepository } from "../repositories/kysely-scim-token-repository";
import type { ScimTokenRepository } from "../repositories/scim-token-repository";
import {
  checkScimToken,
  createScimToken,
  disableScim,
  enableScim,
  revokeScimTokens,
  rotateScimToken,
  type ScimTokenDeps,
  scimStatus,
} from "./scim-tokens";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let deps: ScimTokenDeps;
let clock: Date;

const IP = "203.0.113.9";
const HOUR = 60 * 60 * 1000;
const actor = (user: CurrentUser | null = root) => ({ user, ip: IP });
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const insertProvider = async (id: string) => {
  const at = toDbDate(clock, t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "entra",
      name: "Acme",
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

const scimEvents = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 50 })).events
    .filter((e) => e.action.startsWith("instance.scim_"))
    .map((e) => ({ action: e.action, actorId: e.actorId, metadata: e.metadata, ip: e.ipAddress }))
    .reverse();

beforeEach(async () => {
  t = await createTestDb();
  clock = new Date("2026-10-18T12:00:00.000Z");
  const a = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id: a.id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  deps = { repo: kyselyScimTokenRepository(t.db, t.dialect), now: () => clock };
  await insertProvider("acme");
  await insertProvider("other");
});
afterEach(() => t.cleanup());

describe("turning SCIM on and off", () => {
  it("records when it was turned on, once, and audits each change", async () => {
    expect(await scimStatus(deps, actor(), "acme")).toEqual({ enabledAt: null, tokens: [] });
    expect(await enableScim(deps, actor(), "acme")).toEqual({ changed: true });
    advance(1000);
    expect(await enableScim(deps, actor(), "acme")).toEqual({ changed: false });
    expect((await scimStatus(deps, actor(), "acme")).enabledAt).toEqual(
      new Date("2026-10-18T12:00:00.000Z"),
    );
    expect(await disableScim(deps, actor(), "acme")).toEqual({ changed: true });
    expect(await disableScim(deps, actor(), "acme")).toEqual({ changed: false });
    expect((await scimStatus(deps, actor(), "acme")).enabledAt).toBeNull();
    expect(await scimEvents()).toEqual([
      {
        action: "instance.scim_enabled",
        actorId: root.id,
        metadata: { provider: "acme" },
        ip: IP,
      },
      {
        action: "instance.scim_disabled",
        actorId: root.id,
        metadata: { provider: "acme" },
        ip: IP,
      },
    ]);
  });

  it("is root's alone, and needs a provider", async () => {
    const admin: CurrentUser = { ...root, role: "user", workspaces: { global: "admin" } };
    await expect(enableScim(deps, actor(admin), "acme")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(enableScim(deps, actor(null), "acme")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createScimToken(deps, actor(admin), "acme")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(enableScim(deps, actor(), "nobody")).rejects.toBeInstanceOf(ProviderNotFoundError);
    expect(await scimEvents()).toEqual([]);
  });
});

describe("the token", () => {
  beforeEach(async () => {
    await enableScim(deps, actor(), "acme");
  });

  it("is made only while SCIM is on, once, and only its hash is stored", async () => {
    await expect(createScimToken(deps, actor(), "other")).rejects.toBeInstanceOf(ScimOffError);
    const { token, id } = await createScimToken(deps, actor(), "acme");
    expect(token).toMatch(/^scim_[A-Za-z0-9_-]{43}$/);
    await expect(createScimToken(deps, actor(), "acme")).rejects.toBeInstanceOf(
      ScimTokenExistsError,
    );

    const rows = await t.db.selectFrom("scim_tokens").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(hashScimToken(token));
    expect(rows[0]?.created_by).toBe(root.id);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect((await scimStatus(deps, actor(), "acme")).tokens).toEqual([
      { id, createdAt: clock, createdBy: root.id, expiresAt: null, lastUsedAt: null },
    ]);
  });

  it("says who is calling, and refuses what doesn't work", async () => {
    const { token, id } = await createScimToken(deps, actor(), "acme");
    expect(await checkScimToken(deps, token)).toEqual({
      ok: true,
      providerId: "acme",
      tokenId: id,
    });
    expect(await checkScimToken(deps, `rmk_${token.slice(5)}`)).toEqual({
      ok: false,
      reason: "format",
    });
    expect(await checkScimToken(deps, `${token} `)).toEqual({ ok: false, reason: "format" });
    expect(await checkScimToken(deps, `scim_${"A".repeat(43)}`)).toEqual({
      ok: false,
      reason: "unknown",
    });

    await disableScim(deps, actor(), "acme");
    expect(await checkScimToken(deps, token)).toEqual({
      ok: false,
      reason: "scim_off",
      providerId: "acme",
    });
    // Turned on again, the same token works: turning off kept it.
    await enableScim(deps, actor(), "acme");
    expect((await checkScimToken(deps, token)).ok).toBe(true);
  });

  it("records when it was last used, at most once a minute", async () => {
    const { token } = await createScimToken(deps, actor(), "acme");
    const lastUsed = async () => (await scimStatus(deps, actor(), "acme")).tokens[0]?.lastUsedAt;
    await checkScimToken(deps, token);
    expect(await lastUsed()).toEqual(clock);
    const first = clock;
    advance(30_000);
    await checkScimToken(deps, token);
    expect(await lastUsed()).toEqual(first);
    advance(31_000);
    await checkScimToken(deps, token);
    expect(await lastUsed()).toEqual(clock);
  });

  it("keeps working for 24 hours after a rotation, and the new one at once", async () => {
    const first = await createScimToken(deps, actor(), "acme");
    advance(HOUR);
    const second = await rotateScimToken(deps, actor(), "acme");
    expect(second.previousExpiresAt).toEqual(new Date(clock.getTime() + 24 * HOUR));
    expect((await checkScimToken(deps, first.token)).ok).toBe(true);
    expect(await checkScimToken(deps, second.token)).toEqual({
      ok: true,
      providerId: "acme",
      tokenId: second.id,
    });
    expect((await scimStatus(deps, actor(), "acme")).tokens.map((tk) => tk.id)).toEqual([
      second.id,
      first.id,
    ]);

    advance(24 * HOUR - 1);
    expect((await checkScimToken(deps, first.token)).ok).toBe(true);
    advance(1);
    expect(await checkScimToken(deps, first.token)).toEqual({
      ok: false,
      reason: "expired",
      providerId: "acme",
    });
    expect((await checkScimToken(deps, second.token)).ok).toBe(true);
    expect((await scimStatus(deps, actor(), "acme")).tokens.map((tk) => tk.id)).toEqual([
      second.id,
    ]);
  });

  it("ends the one before at once when it's rotated again within the 24 hours", async () => {
    const first = await createScimToken(deps, actor(), "acme");
    const second = await rotateScimToken(deps, actor(), "acme");
    advance(HOUR);
    const third = await rotateScimToken(deps, actor(), "acme");
    expect(await checkScimToken(deps, first.token)).toEqual({
      ok: false,
      reason: "revoked",
      providerId: "acme",
    });
    expect((await checkScimToken(deps, second.token)).ok).toBe(true);
    expect((await checkScimToken(deps, third.token)).ok).toBe(true);
    expect((await scimStatus(deps, actor(), "acme")).tokens).toHaveLength(2);
  });

  it("can't be rotated before there is one, nor while SCIM is off", async () => {
    await expect(rotateScimToken(deps, actor(), "acme")).rejects.toBeInstanceOf(NoScimTokenError);
    await createScimToken(deps, actor(), "acme");
    await disableScim(deps, actor(), "acme");
    await expect(rotateScimToken(deps, actor(), "acme")).rejects.toBeInstanceOf(ScimOffError);
  });

  it("stops every token at once on Revoke, the one before a rotation too", async () => {
    const first = await createScimToken(deps, actor(), "acme");
    const second = await rotateScimToken(deps, actor(), "acme");
    expect(await revokeScimTokens(deps, actor(), "acme")).toEqual({ revoked: 2 });
    expect(await checkScimToken(deps, first.token)).toEqual({
      ok: false,
      reason: "revoked",
      providerId: "acme",
    });
    expect(await checkScimToken(deps, second.token)).toEqual({
      ok: false,
      reason: "revoked",
      providerId: "acme",
    });
    expect((await scimStatus(deps, actor(), "acme")).tokens).toEqual([]);
    expect(await revokeScimTokens(deps, actor(), "acme")).toEqual({ revoked: 0 });
    // A new one can be made after a revoke.
    const third = await createScimToken(deps, actor(), "acme");
    expect((await checkScimToken(deps, third.token)).ok).toBe(true);
  });

  it("belongs to its provider only", async () => {
    await enableScim(deps, actor(), "other");
    const acme = await createScimToken(deps, actor(), "acme");
    const other = await createScimToken(deps, actor(), "other");
    await revokeScimTokens(deps, actor(), "other");
    expect(await checkScimToken(deps, other.token)).toEqual({
      ok: false,
      reason: "revoked",
      providerId: "other",
    });
    expect(await checkScimToken(deps, acme.token)).toMatchObject({ ok: true, providerId: "acme" });
  });

  it("audits each change with the provider, never the token", async () => {
    const first = await createScimToken(deps, actor(), "acme");
    const second = await rotateScimToken(deps, actor(), "acme");
    await revokeScimTokens(deps, actor(), "acme");
    const events = await scimEvents();
    expect(events.map((e) => [e.action, e.metadata])).toEqual([
      ["instance.scim_enabled", { provider: "acme" }],
      ["instance.scim_token_created", { provider: "acme" }],
      ["instance.scim_token_rotated", { provider: "acme" }],
      ["instance.scim_token_revoked", { provider: "acme", tokens: 2 }],
    ]);
    const audit = JSON.stringify(await t.db.selectFrom("audit_log").selectAll().execute());
    for (const token of [first.token, second.token]) {
      expect(audit).not.toContain(token);
      expect(audit).not.toContain(hashScimToken(token));
    }
  });

  it("is never in a log line", async () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    vi.stubEnv("LOG_FORMAT", "json");
    const out: string[] = [];
    const write = (chunk: unknown) => {
      out.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(write);
    vi.spyOn(process.stderr, "write").mockImplementation(write);
    setLoggerForTests();
    try {
      const first = await createScimToken(deps, actor(), "acme");
      const second = await rotateScimToken(deps, actor(), "acme");
      await checkScimToken(deps, first.token);
      await checkScimToken(deps, `${second.token}x`);
      await revokeScimTokens(deps, actor(), "acme");
      await checkScimToken(deps, second.token);
      logger.info("scim.probe", { reason: "probe" });
      const text = out.join("");
      expect(text).toContain("probe");
      for (const token of [first.token, second.token]) expect(text).not.toContain(token);
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      setLoggerForTests();
    }
  });
});

describe("two changes at once", () => {
  // Every read after the provider's lock waits a little, so without the lock two changes would
  // both pass their check before either writes.
  const slow = (repo: ScimTokenRepository): ScimTokenRepository => ({
    ...repo,
    transaction: (work) => repo.transaction((inner) => work(slow(inner))),
    listWorking: async (providerId, at) => {
      const rows = await repo.listWorking(providerId, at);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return rows;
    },
  });

  beforeEach(async () => {
    await enableScim(deps, actor(), "acme");
    deps = { repo: slow(kyselyScimTokenRepository(t.db, t.dialect)), now: () => clock };
  });

  it("make one token, however many creates arrive together", async () => {
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => createScimToken(deps, actor(), "acme")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results)
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ScimTokenExistsError);
    expect((await scimStatus(deps, actor(), "acme")).tokens).toHaveLength(1);
  });

  it("leave one current token and one in its overlap after rotations together", async () => {
    await createScimToken(deps, actor(), "acme");
    await Promise.all([1, 2, 3].map(() => rotateScimToken(deps, actor(), "acme")));
    const tokens = (await scimStatus(deps, actor(), "acme")).tokens;
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((tk) => tk.expiresAt === null)).toHaveLength(1);
  });
});
