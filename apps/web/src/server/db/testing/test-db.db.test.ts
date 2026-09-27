import { afterEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { MIGRATION_TABLE } from "../migrate";
import { createTestDb, type TestDb } from "./test-db";

const opened: TestDb[] = [];
afterEach(async () => {
  for (const t of opened.splice(0)) await t.cleanup();
});
const open = async (options?: { migrate?: boolean }) => {
  const t = await createTestDb(options);
  opened.push(t);
  return t;
};
const tables = async (t: TestDb) =>
  (await t.db.introspection.getTables())
    .map((x) => x.name)
    .filter((n) => !n.startsWith(MIGRATION_TABLE));

describe("createTestDb", () => {
  it("returns a migrated database by default", async () => {
    const t = await open();
    expect(await tables(t)).toEqual(
      expect.arrayContaining(["user", "session", "account", "verification", "access_tokens"]),
    );
  });

  it("returns an empty database with migrate: false", async () => {
    expect(await tables(await open({ migrate: false }))).toEqual([]);
  });

  it("gives each call its own database", async () => {
    const a = await open();
    const b = await open();
    const now = toDbDate(new Date(), a.dialect);
    await a.db
      .insertInto("user")
      .values({
        id: "01TESTDB000000000000000000",
        name: "A",
        email: "a@example.com",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        disabled_at: null,
      })
      .execute();
    expect(await b.db.selectFrom("user").select("id").execute()).toEqual([]);
  });
});
