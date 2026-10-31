import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { seedUser } from "../../shelves/repositories/test-seed";
import { kyselyFeedbackRepository } from "./kysely-feedback-repository";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const send = (user: string, message = "The secret message text") =>
  kyselyFeedbackRepository(t.db, t.dialect).insert(
    user,
    { kind: "idea", message, page: null },
    { version: "1.0.0", at: new Date() },
  );

const makeRoot = (id: string) =>
  t.db.updateTable("user").set({ role: "root" }).where("id", "=", id).execute();

const rows = () => t.db.selectFrom("notifications").selectAll().execute();

describe("feedback.new (139)", () => {
  it("tells each active root once, not the sender, a disabled or erased root", async () => {
    const [sender, root1, root2, off, gone] = [
      await seedUser(t, "Sender"),
      await seedUser(t, "Root1"),
      await seedUser(t, "Root2"),
      await seedUser(t, "Off"),
      await seedUser(t, "Gone"),
    ];
    await seedUser(t, "Plain"); // a non-root: never told
    for (const id of [root1, root2, off, gone]) await makeRoot(id);
    const at = toDbDate(new Date(), t.dialect);
    await t.db.updateTable("user").set({ disabled_at: at }).where("id", "=", off).execute();
    await t.db.updateTable("user").set({ erased_at: at }).where("id", "=", gone).execute();
    const id = await send(sender);
    const found = await rows();
    expect(found.map((r) => r.user_id).sort()).toEqual([root1, root2].sort());
    expect(found.every((r) => r.kind === "feedback.new" && r.actor_id === sender)).toBe(true);
    expect(found[0]).toMatchObject({ subject_type: "feedback", subject_id: id });
  });

  it("does not tell a root who sends it", async () => {
    const [root, other] = [await seedUser(t, "Root"), await seedUser(t, "Other")];
    await makeRoot(root);
    await makeRoot(other);
    await send(root);
    expect((await rows()).map((r) => r.user_id)).toEqual([other]);
  });

  it("carries the kind, never the message and never the sender's name", async () => {
    const [sender, root] = [await seedUser(t, "Ana"), await seedUser(t, "Root")];
    await makeRoot(root);
    await send(sender, "The secret message text");
    const [row] = await rows();
    expect(JSON.parse(row?.params ?? "{}")).toEqual({ feedbackKind: "idea" });
    expect(row?.params).not.toContain("secret");
    // The sender is the actor, read when shown, so erasing them leaves a pseudonym and no name.
    expect(row?.params).not.toContain("Ana");
    expect(row?.actor_id).toBe(sender);
  });

  it("writes no notification when the message isn't stored", async () => {
    const root = await seedUser(t, "Root");
    await makeRoot(root);
    await expect(send("1".repeat(26))).rejects.toThrow();
    expect(await rows()).toEqual([]);
    expect(await t.db.selectFrom("feedback").selectAll().execute()).toEqual([]);
  });
});
