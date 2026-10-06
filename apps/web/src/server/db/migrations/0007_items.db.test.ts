import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let userId: string;
let scopeId: string;
beforeAll(async () => {
  t = await createTestDb();
  userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Publisher",
      email: "publisher@example.com",
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  scopeId = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id: scopeId,
      name: "team",
      description: "A team.",
      created_by: null,
      created_at: now(),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
});
afterAll(() => t.cleanup());

const now = () => toDbDate(new Date(), t.dialect);

const insertItem = async (name: string) => {
  const id = newId();
  await t.db
    .insertInto("items")
    .values({
      id,
      scope_id: scopeId,
      name,
      type: "skill",
      description: "A skill.",
      owner_id: userId,
      created_at: now(),
    })
    .execute();
  return id;
};

const insertVersion = async (itemId: string, version: string, readme: string | null = null) => {
  const id = newId();
  await t.db
    .insertInto("item_versions")
    .values({
      id,
      item_id: itemId,
      version,
      manifest: "{}",
      readme,
      files: "[]",
      notes: null,
      artifact_path: `team/x/${version}.tgz`,
      sha256: "0".repeat(64),
      size: 10,
      published_by: userId,
      published_at: now(),
      deprecated_message: null,
      yanked_at: null,
      submission_id: null,
    })
    .execute();
  return id;
};

describe("0007_items", () => {
  it("creates real foreign keys: everything restricts, and an item's owner sets null", async () => {
    const keys = await foreignKeys(t.db, t.dialect, [
      "items",
      "item_versions",
      "dist_tags",
      "version_dependencies",
    ]);
    expect(keys.map((k) => `${k.table} → ${k.references}: ${k.onDelete}`).sort()).toEqual(
      [
        "dist_tags → item_versions: RESTRICT",
        "dist_tags → items: RESTRICT",
        "item_versions → items: RESTRICT",
        "item_versions → submissions: RESTRICT",
        "item_versions → user: RESTRICT",
        "items → scopes: RESTRICT",
        "items → user: SET NULL",
        "version_dependencies → item_versions: RESTRICT",
        "version_dependencies → items: RESTRICT",
      ].sort(),
    );
  });

  it("keeps item names unique per scope, and versions unique per item, exactly", async () => {
    const item = await insertItem("secure-coding");
    await expect(insertItem("secure-coding")).rejects.toThrow();
    await insertVersion(item, "1.0.0");
    await expect(insertVersion(item, "1.0.0")).rejects.toThrow();
    // Semver is case-sensitive in pre-release ids: these are two versions.
    await insertVersion(item, "1.1.0-beta.1");
    await insertVersion(item, "1.1.0-Beta.1");
    // Another item has its own versions.
    await insertVersion(await insertItem("other"), "1.0.0");
  });

  it("holds one tag per name per item, and refuses to delete a tagged version or depended-on item", async () => {
    const item = await insertItem("tagged");
    const version = await insertVersion(item, "1.0.0");
    await t.db
      .insertInto("dist_tags")
      .values({ item_id: item, tag: "latest", version_id: version })
      .execute();
    await expect(
      t.db
        .insertInto("dist_tags")
        .values({ item_id: item, tag: "latest", version_id: version })
        .execute(),
    ).rejects.toThrow();
    await expect(
      t.db.deleteFrom("item_versions").where("id", "=", version).execute(),
    ).rejects.toThrow();

    const dependent = await insertVersion(await insertItem("kit"), "1.0.0");
    await t.db
      .insertInto("version_dependencies")
      .values({ version_id: dependent, depends_on_item_id: item, range: "^1.0.0" })
      .execute();
    await expect(t.db.deleteFrom("items").where("id", "=", item).execute()).rejects.toThrow();
  });

  it("stores a 1 MB README", async () => {
    const readme = "# Title\n\nSome text é🙂.\n".repeat(40_000);
    const version = await insertVersion(await insertItem("big"), "1.0.0", readme);
    const row = await t.db
      .selectFrom("item_versions")
      .select("readme")
      .where("id", "=", version)
      .executeTakeFirstOrThrow();
    expect(row.readme).toBe(readme);
  });
});
