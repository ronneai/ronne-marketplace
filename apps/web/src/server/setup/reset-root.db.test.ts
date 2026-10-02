import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyIdentityRepository } from "../domains/identity/repositories/kysely-identity-repository";
import { InvalidInputError, MissingInputError } from "./non-interactive-prompts";
import { runResetRootPassword } from "./reset-root";
import { SetupFailedError } from "./run-setup";
import { scriptedPrompts } from "./testing/scripted-prompts";

// runResetRootPassword opens its own connection from a URL, so SQLite uses a file here.
const onServer = Boolean(process.env.TEST_DATABASE_URL);
let appDir: string;
let t: Pick<TestDb, "db" | "dialect" | "url" | "cleanup">;

beforeEach(async () => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-reset-root-"));
  if (onServer) t = await createTestDb();
  else {
    const url = `file:${join(appDir, "reset.db")}`;
    const { db, dialect } = createDb(url);
    await migrateToLatest(db, dialect);
    t = { db, dialect, url, cleanup: () => db.destroy() };
  }
});
afterEach(async () => {
  await t.cleanup();
  rmSync(appDir, { recursive: true, force: true });
});

const password = "a brand new passphrase";
const run = (prompts: ReturnType<typeof scriptedPrompts>["prompts"], rootEmail?: string) =>
  runResetRootPassword({
    appDir,
    envPath: join(appDir, ".env"),
    prompts,
    databaseUrl: t.url,
    rootEmail,
  });

const twoRoots = async () => {
  await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  const repo = kyselyIdentityRepository(t.db, t.dialect);
  const second = await repo.createUserWithPassword(
    { email: "second@example.com", name: "Second", role: "root", passwordHash: "x" },
    new Date(Date.now() + 1000),
  );
  await repo.createUserWithPassword(
    { email: "mod@example.com", name: "Mod", role: "moderator", passwordHash: "x" },
    new Date(),
  );
  return second;
};

describe("runResetRootPassword with several roots (059)", () => {
  it("asks which root in a terminal, naming it in the password question", async () => {
    const second = await twoRoots();
    const scripted = scriptedPrompts({
      "root.which": second,
      "root.password": password,
      "root.password_again": password,
    });
    expect(await run(scripted.prompts)).toEqual({ email: "second@example.com" });
    expect(scripted.asked[0]).toBe("root.which");
  });

  it("uses --email without asking", async () => {
    await twoRoots();
    const scripted = scriptedPrompts({
      "root.password": password,
      "root.password_again": password,
    });
    expect(await run(scripted.prompts, "Root@Example.com")).toEqual({ email: "root@example.com" });
    expect(scripted.asked).not.toContain("root.which");
  });

  it("needs --email when it can't ask, and refuses an account that isn't root", async () => {
    await twoRoots();
    const quiet = () =>
      scriptedPrompts(
        { "root.password": password, "root.password_again": password },
        { interactive: false },
      ).prompts;
    await expect(run(quiet())).rejects.toThrowError(MissingInputError);
    await expect(run(quiet())).rejects.toThrow("there are 2 root accounts");
    await expect(run(quiet(), "mod@example.com")).rejects.toThrowError(InvalidInputError);
    await expect(run(quiet(), "mod@example.com")).rejects.toThrow("isn't a root account");
  });

  it("fails without asking anything when there's no root", async () => {
    const scripted = scriptedPrompts({});
    await expect(run(scripted.prompts)).rejects.toThrowError(SetupFailedError);
    expect(scripted.asked).toEqual([]);
  });
});
