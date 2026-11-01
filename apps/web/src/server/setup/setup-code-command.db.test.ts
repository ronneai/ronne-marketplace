import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { migrateToLatest } from "../db/migrate";
import { readSetupCode } from "./setup-code";
import { runSetupCode } from "./setup-code-command";

// `setup-code` (161) against an instance's real setup state, read from its settings and database
// as the command reads it: no state is injected here.
let appDir: string;
let env: Record<string, string>;
beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-setup-code-db-"));
  env = { RONNE_ENV_FILE: join(appDir, ".env") };
  writeFileSync(
    env.RONNE_ENV_FILE as string,
    `DATABASE_URL=file:${join(appDir, "ronne.db")}\nAUTH_SECRET=${"s".repeat(44)}\n`,
  );
});
afterEach(() => rmSync(appDir, { recursive: true, force: true }));

/** The settings' database, migrated, with a root account unless told otherwise. */
const database = async (withRoot: boolean) => {
  const { db, dialect } = createDb(`file:${join(appDir, "ronne.db")}`);
  await migrateToLatest(db, dialect);
  if (withRoot) {
    const at = toDbDate(new Date(), dialect);
    await db
      .insertInto("user")
      .values({
        id: newId(),
        name: "Root",
        email: "root@example.test",
        email_verified: 0,
        image: null,
        role: "root",
        created_at: at,
        updated_at: at,
        disabled_at: null,
      } as never)
      .execute();
  }
  await db.destroy();
};

describe("setup-code on a real instance", () => {
  it("refuses once root exists, and makes nothing", async () => {
    await database(true);
    expect(await runSetupCode({ appDir, env })).toMatchObject({ kind: "set-up" });
    expect(readSetupCode(join(appDir, "data", "setup-code"))).toBeNull();
  });

  it("gives a code while settings and tables exist but root doesn't", async () => {
    await database(false);
    const answer = await runSetupCode({ appDir, env });
    expect(answer).toMatchObject({ kind: "code", created: true });
    expect(readSetupCode(join(appDir, "data", "setup-code"))).toBe(
      (answer as { code: string }).code,
    );
  });
});
