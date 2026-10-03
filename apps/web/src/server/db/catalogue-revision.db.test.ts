import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyFeedRepository } from "../domains/feeds/repositories/kysely-feed-repository";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { toDbDate } from "./dates";
import { createTestDb, type TestDb } from "./testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let publisher: string;
const now = new Date("2026-10-03T12:00:00.000Z");

beforeEach(async () => {
  t = await createTestDb();
  ({ id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  }));
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
});
afterEach(() => t.cleanup());

const revision = () => kyselyFeedRepository(t.db, t.dialect).revision();

const version = (itemId: string, value: string) => ({
  itemId,
  version: value,
  manifest: {},
  readme: null,
  files: [],
  notes: null,
  artifactPath: `team/x/${value}.tgz`,
  sha256: "0".repeat(64),
  size: 1,
  publishedBy: publisher,
  publishedAt: now,
  submissionId: null,
  dependencies: [],
  riskFlags: [],
});

describe("the catalogue revision (079)", () => {
  it("starts at 0, and each change that can change a feed raises it by one", async () => {
    const items = kyselyItemRepository(t.db, t.dialect);
    expect(await revision()).toBe(0);
    const itemId = await items.insertItem({
      scopeId: "s1",
      name: "x",
      type: "skill",
      description: "",
      ownerId: publisher,
      createdAt: now,
    });
    // An item with no version isn't in any feed.
    expect(await revision()).toBe(0);
    const steps: [string, () => Promise<unknown>][] = [];
    let v1 = "";
    steps.push([
      "a release",
      async () => (v1 = await items.insertVersion(version(itemId, "1.0.0"))),
    ]);
    steps.push(["a tag", () => items.setTag(itemId, "latest", v1)]);
    steps.push(["a tag removed", () => items.removeTag(itemId, "latest")]);
    steps.push(["a deprecation", () => items.setDeprecated(v1, "Old.")]);
    steps.push(["an undeprecation", () => items.setDeprecated(v1, null)]);
    steps.push(["a yank", () => items.setYanked(v1, { at: now, reason: "Broken." })]);
    steps.push(["an unyank", () => items.setYanked(v1, null)]);
    steps.push(["a description", () => items.updateDescription(itemId, "New.")]);
    let expected = 0;
    for (const [what, step] of steps) {
      await step();
      expect(await revision(), what).toBe(++expected);
    }
    // Reading changes nothing.
    await items.versions(itemId);
    await items.tags(itemId);
    expect(await revision()).toBe(expected);
  });

  it("isn't raised by a change that rolls back", async () => {
    const items = kyselyItemRepository(t.db, t.dialect);
    const itemId = await items.insertItem({
      scopeId: "s1",
      name: "x",
      type: "skill",
      description: "",
      ownerId: publisher,
      createdAt: now,
    });
    await expect(
      items.transaction(async (repo) => {
        await repo.insertVersion(version(itemId, "1.0.0"));
        throw new Error("Release failed.");
      }),
    ).rejects.toThrow("Release failed.");
    expect(await revision()).toBe(0);
    expect(await items.versions(itemId)).toEqual([]);
  });
});
