import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { rollbackProbe, throwAfterNotify } from "../../notifications/testing/throw-after-notify";
import { seedUser } from "../../shelves/repositories/test-seed";
import { kyselyFeedbackRepository } from "./kysely-feedback-repository";

vi.mock("../../notifications/services/notify", async (original) =>
  throwAfterNotify(await original<{ notify: (...a: never[]) => Promise<number> }>()),
);

// Atomicity of feedback.new (139, task 3): the repository's own transaction holds the feedback row
// and the roots' notifications, so a failure right after the notifications were written leaves
// neither.
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

const send = (user: string) =>
  kyselyFeedbackRepository(t.db, t.dialect).insert(
    user,
    { kind: "idea", message: "A thought.", page: null },
    { version: "1.0.0", at: new Date() },
  );

const count = async (table: "feedback" | "notifications") =>
  Number(
    (
      await t.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow()
    ).n,
  );

describe("feedback.new (139)", () => {
  it("leaves no feedback row and no notification when it fails after notifying", async () => {
    const [sender, root] = [await seedUser(t, "Sender"), await seedUser(t, "Root")];
    await t.db.updateTable("user").set({ role: "root" }).where("id", "=", root).execute();

    rollbackProbe.armed = true;
    try {
      await expect(send(sender)).rejects.toThrow("failed after notify");
    } finally {
      rollbackProbe.armed = false;
    }
    expect(rollbackProbe.fired).toBe(1);
    expect(await count("notifications")).toBe(0);
    expect(await count("feedback")).toBe(0);

    // The control: unarmed, both are written together.
    await send(sender);
    expect(await count("feedback")).toBe(1);
    expect(await count("notifications")).toBe(1);
  });
});
