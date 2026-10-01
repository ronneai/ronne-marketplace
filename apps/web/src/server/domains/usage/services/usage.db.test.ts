import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { foreignKeys } from "../../../db/testing/foreign-keys";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { InvalidUsageReportError, UsageDisabledError } from "../exceptions/errors";
import { kyselyUsageRepository } from "../repositories/kysely-usage-repository";
import { recordUsage, type UsageDeps, usageSettings } from "./usage";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let itemId: string;
const user: CurrentUser = { id: "u1", email: "a@example.com", name: "A", role: "user" };
const now = new Date("2026-10-05T12:00:00.000Z");

beforeEach(async () => {
  t = await createTestDb();
  const { id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  await t.db
    .insertInto("scopes")
    .values({
      id: "s1",
      name: "team",
      description: "",
      created_by: publisher,
      created_at: toDbDate(now, t.dialect),
    })
    .execute();
  const items = kyselyItemRepository(t.db, t.dialect);
  itemId = await items.insertItem({
    scopeId: "s1",
    name: "reviewer",
    type: "agent",
    description: "",
    ownerId: publisher,
    createdAt: now,
  });
  for (const version of ["1.0.0", "1.1.0"])
    await items.insertVersion({
      itemId,
      version,
      manifest: {},
      readme: null,
      files: [],
      notes: null,
      artifactPath: `team/reviewer/${version}.tgz`,
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: publisher,
      publishedAt: now,
      submissionId: null,
      dependencies: [],
      riskFlags: [],
    });
});
afterEach(() => t.cleanup());

const deps = (overrides: Partial<UsageDeps> = {}): UsageDeps => ({
  usage: kyselyUsageRepository(t.db, t.dialect),
  accepting: true,
  now: () => now,
  pruneDue: () => false,
  ...overrides,
});

const run = (extra: Record<string, unknown> = {}) => ({
  day: "2026-10-05",
  item: "@team/reviewer",
  version: "1.1.0",
  tool: "claude-code",
  event: "run",
  trigger: "model",
  outcome: "success",
  count: 2,
  ...extra,
});

const stored = async () =>
  (
    await t.db
      .selectFrom("usage_daily")
      .selectAll()
      .orderBy(["day", "version", "tool", "event", "run_trigger", "outcome"])
      .execute()
  ).map((row) => ({ ...row, count: Number(row.count) }));

describe("recordUsage", () => {
  it("adds each line to its day's total, summing lines and reports for the same row", async () => {
    expect(
      await recordUsage(
        deps(),
        { user },
        { events: [run(), run({ count: 3 }), run({ outcome: "error", count: 1 })] },
      ),
    ).toEqual({ accepted: 3, ignored: 0 });
    await recordUsage(deps(), { user }, { events: [run({ count: 4 })] });
    await recordUsage(
      deps(),
      { user },
      {
        events: [
          {
            day: "2026-10-04",
            item: "@team/reviewer",
            version: "1.0.0",
            tool: "cursor",
            event: "install",
            count: 1,
          },
        ],
      },
    );
    expect(await stored()).toEqual([
      {
        item_id: itemId,
        day: "2026-10-04",
        version: "1.0.0",
        tool: "cursor",
        event: "install",
        run_trigger: "",
        outcome: "",
        count: 1,
      },
      {
        item_id: itemId,
        day: "2026-10-05",
        version: "1.1.0",
        tool: "claude-code",
        event: "run",
        run_trigger: "model",
        outcome: "error",
        count: 1,
      },
      {
        item_id: itemId,
        day: "2026-10-05",
        version: "1.1.0",
        tool: "claude-code",
        event: "run",
        run_trigger: "model",
        outcome: "success",
        count: 9,
      },
    ]);
  });

  it("ignores lines it can't count, and keeps the rest", async () => {
    const result = await recordUsage(
      deps(),
      { user },
      {
        events: [
          run(),
          run({ item: "@team/unknown" }),
          run({ version: "9.9.9" }),
          run({ day: "2026-10-07" }),
          run({ day: "2026-10-01" }),
          run({ tool: "notepad" }),
          run({ trigger: "telepathy" }),
          run({ count: 0 }),
          { ...run(), event: "install" },
          "not an event",
        ],
      },
    );
    expect(result).toEqual({ accepted: 1, ignored: 9 });
    expect(await stored()).toHaveLength(1);
  });

  it("refuses a report that isn't a list of events, or is too long", async () => {
    await expect(recordUsage(deps(), { user }, { lines: [] })).rejects.toBeInstanceOf(
      InvalidUsageReportError,
    );
    await expect(
      recordUsage(deps(), { user }, { events: Array.from({ length: 501 }, () => run()) }),
    ).rejects.toThrow("at most 500 events");
  });

  it("refuses every report when the instance doesn't collect usage", async () => {
    await expect(
      recordUsage(deps({ accepting: false }), { user }, { events: [run()] }),
    ).rejects.toBeInstanceOf(UsageDisabledError);
    expect(usageSettings(deps({ accepting: false }), { user })).toEqual({
      accepting: false,
      retentionDays: 90,
    });
    expect(await stored()).toEqual([]);
  });

  it("needs a signed-in user", async () => {
    await expect(
      recordUsage(deps(), { user: null as unknown as CurrentUser }, { events: [] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deletes totals older than 90 days when pruning is due", async () => {
    const usage = kyselyUsageRepository(t.db, t.dialect);
    const row = (day: string) => ({
      itemId,
      day,
      version: "1.0.0",
      tool: "codex",
      event: "install",
      trigger: "",
      outcome: "",
      count: 1,
    });
    await usage.add([row("2026-07-07"), row("2026-07-08"), row("2026-10-04")]);
    await recordUsage(deps({ pruneDue: () => true }), { user }, { events: [] });
    expect((await stored()).map((r) => r.day)).toEqual(["2026-07-08", "2026-10-04"]);
  });
});

describe("usage_daily", () => {
  it("goes with its item", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["usage_daily"])).toEqual([
      { table: "usage_daily", references: "items", onDelete: "CASCADE" },
    ]);
  });
});
