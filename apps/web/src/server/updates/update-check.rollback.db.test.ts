import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import {
  rollbackProbe,
  throwAfterNotify,
} from "../domains/notifications/testing/throw-after-notify";
import { seedUser } from "../domains/shelves/repositories/test-seed";
import { runUpdateCheck, UPDATE_KEYS } from "./update-check";

vi.mock("../domains/notifications/services/notify", async (original) =>
  throwAfterNotify(await original<{ notify: (...a: never[]) => Promise<number> }>()),
);

// Atomicity of the upgrade check (140): the stored answer, the "announced" marker and the roots'
// notifications are one transaction, so a failure right after the notifications were written
// leaves none of them, and the next check announces the version again.
let t: TestDb;
beforeEach(async () => {
  rollbackProbe.armed = false;
  rollbackProbe.fired = 0;
  t = await createTestDb();
});
afterEach(() => {
  rollbackProbe.armed = false;
  return t.cleanup();
});

const check = () =>
  runUpdateCheck({
    db: t.db,
    dialect: t.dialect,
    fetch: (async () => new Response(JSON.stringify({ tag_name: "v0.9.0" }))) as never,
    current: "0.8.2",
  });

const counts = async () => ({
  notifications: (await t.db.selectFrom("notifications").selectAll().execute()).length,
  settings: (
    await t.db
      .selectFrom("instance_settings")
      .select("key")
      .where("key", "in", Object.values(UPDATE_KEYS))
      .execute()
  ).length,
});

describe("the upgrade check's transaction (140)", () => {
  it("leaves no result, marker or notification when it fails after notifying", async () => {
    await t.db
      .updateTable("user")
      .set({ role: "root" })
      .where("id", "=", await seedUser(t, "Root1"))
      .execute();
    rollbackProbe.armed = true;
    await expect(check()).rejects.toThrow("failed after notify");
    expect(rollbackProbe.fired).toBe(1);
    expect(await counts()).toEqual({ notifications: 0, settings: 0 });
    // Disarmed, the next check announces the version.
    rollbackProbe.armed = false;
    expect(await check()).toMatchObject({ notified: 1 });
    expect((await counts()).notifications).toBe(1);
  });
});
