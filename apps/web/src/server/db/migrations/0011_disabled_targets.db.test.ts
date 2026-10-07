import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot } from "../../domains/identity/actions/root-account";
import { kyselyItemRepository } from "../../domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../domains/workspaces/models/viewer";
import { toDbDate } from "../dates";
import { encodeJson } from "../json";
import { createTestDb, type TestDb } from "../testing/test-db";
import { backfillDisabledTargets } from "./0011_disabled_targets";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

describe("0011 disabled targets", () => {
  it("fills in the tools each version's manifest turns off, padded for the filter", async () => {
    const { id: publisher } = await createRoot(t.db, t.dialect, {
      email: "root@example.com",
      name: "Root",
      password: "correct horse battery",
    });
    const scopeId = "s1";
    await t.db
      .insertInto("scopes")
      .values({
        id: scopeId,
        name: "team",
        description: "",
        created_by: publisher,
        created_at: toDbDate(new Date(), t.dialect),
        workspace_id: GLOBAL_WORKSPACE_ID,
      })
      .execute();
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const itemId = await items.insertItem({
      scopeId,
      name: "kit",
      type: "skill",
      description: "",
      ownerId: publisher,
      createdAt: new Date(),
    });
    const release = (version: string, manifest: Record<string, unknown>) =>
      items.insertVersion({
        itemId,
        version,
        manifest,
        readme: null,
        files: [],
        notes: null,
        artifactPath: `team/kit/${version}.tgz`,
        sha256: "0".repeat(64),
        size: 1,
        publishedBy: publisher,
        publishedAt: new Date(),
        submissionId: null,
        dependencies: [],
        riskFlags: [],
      });
    const off = await release("1.0.0", { targets: { cursor: { enabled: false } } });
    const on = await release("1.1.0", {});
    const stored = async (id: string) =>
      (
        await t.db
          .selectFrom("item_versions")
          .select("disabled_targets")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).disabled_targets;
    // Released now: stored at release.
    expect(await stored(off)).toBe(" cursor ");
    expect(await stored(on)).toBe("");
    // Released before 0011: the backfill reads the manifest.
    await t.db
      .updateTable("item_versions")
      .set({
        disabled_targets: "",
        manifest: encodeJson({
          targets: { codex: { enabled: false }, cursor: { enabled: false } },
        }),
      })
      .where("id", "=", on)
      .execute();
    await backfillDisabledTargets(t.db);
    expect(await stored(on)).toBe(" codex cursor ");
    expect(await stored(off)).toBe(" cursor ");
  });
});
