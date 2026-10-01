import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { getUsage, postUsage, type UsageApiDeps } from "./usage-api";
import { createUsageLimiter } from "./usage-rate-limit";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let deps: UsageApiDeps;
let token: string;
const URL_ = "http://localhost:3000/api/v1/usage";
const password = "correct horse battery";
const today = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  deps = {
    app,
    guard: { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
    limiter: createUsageLimiter(),
    accepting: true,
  };
  const { id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  });
  await createTestUser(app, { email: "u@example.com", password });
  const result = await exchangePassword(
    { email: "u@example.com", password, name: "test" },
    new Headers(),
    app,
  );
  if (!result.ok) throw new Error("no token");
  token = result.token.token;
  await t.db
    .insertInto("scopes")
    .values({
      id: "s1",
      name: "team",
      description: "",
      created_by: rootId,
      created_at: toDbDate(new Date(), t.dialect),
    })
    .execute();
  const items = kyselyItemRepository(t.db, t.dialect);
  const itemId = await items.insertItem({
    scopeId: "s1",
    name: "reviewer",
    type: "agent",
    description: "",
    ownerId: rootId,
    createdAt: new Date(),
  });
  await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: {},
    readme: null,
    files: [],
    notes: null,
    artifactPath: "team/reviewer/1.0.0.tgz",
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
});
afterEach(() => t.cleanup());

const event = (extra: Record<string, unknown> = {}) => ({
  day: today,
  item: "@team/reviewer",
  version: "1.0.0",
  tool: "claude-code",
  event: "run",
  trigger: "user",
  outcome: "success",
  count: 1,
  ...extra,
});

const post = (body: unknown, auth: string | null = token, d: UsageApiDeps = deps) =>
  postUsage(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    d,
  );

const totals = async () =>
  (await t.db.selectFrom("usage_daily").select(["event", "count"]).execute()).map((r) => ({
    event: r.event,
    count: Number(r.count),
  }));

describe("POST /api/v1/usage", () => {
  it("counts what it can and says how many lines it ignored", async () => {
    const response = await post({
      events: [event(), event({ count: 2 }), event({ item: "@team/nope" })],
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 2, ignored: 1 });
    expect(await totals()).toEqual([{ event: "run", count: 3 }]);
  });

  it("needs a token", async () => {
    const response = await post({ events: [event()] }, null);
    expect(response.status).toBe(401);
    expect(await totals()).toEqual([]);
  });

  it("refuses everything with 403 usage_disabled when the instance doesn't collect usage", async () => {
    const response = await post({ events: [event()] }, token, { ...deps, accepting: false });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("usage_disabled");
    expect(await totals()).toEqual([]);
  });

  it("refuses a body that isn't a report, too many events and a body over 256 KiB", async () => {
    const shape = await post("not json");
    expect(shape.status).toBe(400);
    expect((await shape.json()).error.code).toBe("invalid_request");
    const many = await post({ events: Array.from({ length: 501 }, () => event()) });
    expect(many.status).toBe(400);
    const large = await post({ events: [event({ padding: "x".repeat(300 * 1024) })] });
    expect(large.status).toBe(413);
    expect((await large.json()).error.code).toBe("body_too_large");
  });

  it("limits each user to 60 reports in 10 minutes", async () => {
    for (let i = 0; i < 60; i += 1) expect((await post({ events: [] })).status).toBe(202);
    const response = await post({ events: [event()] });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});

describe("GET /api/v1/usage", () => {
  const get = (d: UsageApiDeps, auth: string | null = token) =>
    getUsage(new Request(URL_, { headers: auth ? { authorization: `Bearer ${auth}` } : {} }), d);

  it("says whether the instance accepts usage and how long it keeps it", async () => {
    expect(await (await get(deps)).json()).toEqual({ accepting: true, retentionDays: 90 });
    expect(await (await get({ ...deps, accepting: false })).json()).toEqual({
      accepting: false,
      retentionDays: 90,
    });
    expect((await get(deps, null)).status).toBe(401);
  });
});
