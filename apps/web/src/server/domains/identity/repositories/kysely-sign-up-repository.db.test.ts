import type { KyselyPlugin, PluginTransformQueryArgs, RootOperationNode } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { TEST_SECRET } from "../testing/test-auth";
import { kyselySignUpRepository } from "./kysely-sign-up-repository";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

/** Every query the repository runs: its kind and the tables it names. */
const watching = () => {
  const seen: { kind: string; tables: string[] }[] = [];
  const plugin: KyselyPlugin = {
    transformQuery: ({ node }: PluginTransformQueryArgs): RootOperationNode => {
      const text = JSON.stringify(node);
      seen.push({
        kind: node.kind,
        tables: ["mail_outbox", "instance_settings"].filter((table) => text.includes(`"${table}"`)),
      });
      return node;
    },
    transformResult: async ({ result }) => result,
  };
  return { db: t.db.withPlugin(plugin), seen };
};

describe("rehearsing a bot's email (190)", () => {
  it("reads what queuing reads, the mail setup and the outbox's count, and writes nothing", async () => {
    const { db, seen } = watching();
    const repo = kyselySignUpRepository(db, t.dialect, TEST_SECRET);
    await repo.rehearseMail(
      {
        template: "sign_up_code",
        locale: "en",
        to: "bot@acme.com",
        userId: null,
        subject: "s",
        text: "t",
        html: "h",
      },
      new Date("2026-11-21T12:00:00.000Z"),
    );
    expect(
      seen.some((q) => q.kind === "SelectQueryNode" && q.tables.includes("instance_settings")),
    ).toBe(true);
    expect(seen.some((q) => q.kind === "SelectQueryNode" && q.tables.includes("mail_outbox"))).toBe(
      true,
    );
    expect(seen.filter((q) => q.kind !== "SelectQueryNode")).toEqual([]);
    expect(await t.db.selectFrom("mail_outbox").select("id").execute()).toEqual([]);
  });
});
