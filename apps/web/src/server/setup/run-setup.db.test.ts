import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createAuth } from "../domains/identity/repositories/better-auth";
import type { DatabaseAnswers } from "./database-url";
import { runSetup, SetupFailedError } from "./run-setup";
import { CANCEL, scriptedPrompts } from "./testing/scripted-prompts";

let appDir: string;
let envPath: string;
beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-setup-"));
  envPath = join(appDir, ".env");
});
afterEach(() => rmSync(appDir, { recursive: true, force: true }));

const rootAnswers = {
  "root.email": "Root@Example.com",
  "root.name": "Root",
  "root.password": "correct horse battery",
  "root.password_again": "correct horse battery",
};
const sqliteAnswers = {
  "database.kind": "sqlite",
  "database.path": "./data/ronne.db",
  public_url: "http://localhost:3000/",
};

const openEnvDb = () => {
  const env = parseEnv(readFileSync(envPath, "utf8"));
  return createDb(env.DATABASE_URL as string, { baseDir: appDir });
};

describe("runSetup on SQLite", () => {
  it("does the whole first run: .env (0600), database, migrations, storage and a root that can sign in", async () => {
    const { prompts, unused } = scriptedPrompts({ ...sqliteAnswers, ...rootAnswers });
    const result = await runSetup({ appDir, envPath, prompts });

    expect(result).toEqual({
      publicUrl: "http://localhost:3000",
      rootEmail: "root@example.com",
      rootCreated: true,
    });
    expect(unused()).toEqual([]);

    const env = parseEnv(readFileSync(envPath, "utf8"));
    expect(env).toMatchObject({
      DATABASE_URL: "file:./data/ronne.db",
      STORAGE_PATH: "./data/storage",
      PUBLIC_URL: "http://localhost:3000",
    });
    expect(Buffer.from(env.AUTH_SECRET as string, "base64")).toHaveLength(32);
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    expect(existsSync(join(appDir, "data/ronne.db"))).toBe(true);
    expect(existsSync(join(appDir, "data/storage"))).toBe(true);

    const { db, dialect } = openEnvDb();
    const auth = createAuth({
      db,
      dialect,
      secret: env.AUTH_SECRET as string,
      baseURL: "http://localhost:3000",
    });
    const signedIn = await auth.api.signInEmail({
      body: { email: "root@example.com", password: "correct horse battery" },
    });
    expect(signedIn.user.email).toBe("root@example.com");
    await db.destroy();
  });

  it("is safe to run again: reuses .env, keeps AUTH_SECRET, and doesn't create a second root", async () => {
    await runSetup({
      appDir,
      envPath,
      prompts: scriptedPrompts({ ...sqliteAnswers, ...rootAnswers }).prompts,
    });
    const secret = parseEnv(readFileSync(envPath, "utf8")).AUTH_SECRET;

    const second = scriptedPrompts({ "database.reuse": true, public_url: "http://localhost:3000" });
    const result = await runSetup({ appDir, envPath, prompts: second.prompts });

    expect(result).toEqual({
      publicUrl: "http://localhost:3000",
      rootEmail: "root@example.com",
      rootCreated: false,
    });
    expect(second.asked).not.toContain("root.email");
    expect(second.logs.some((l) => l.message.includes("already exists"))).toBe(true);
    expect(parseEnv(readFileSync(envPath, "utf8")).AUTH_SECRET).toBe(secret);
  });

  it("asks again after a database that fails its check, keeping the other answers", async () => {
    const { prompts, logs } = scriptedPrompts({
      ...sqliteAnswers,
      "database.kind": ["sqlite", "sqlite"],
      // A file inside a path that can't be a folder, then a good path.
      "database.path": ["/dev/null/ronne.db", "./data/ronne.db"],
      ...rootAnswers,
    });
    await runSetup({ appDir, envPath, prompts });
    expect(logs.filter((l) => l.level === "error")).toHaveLength(1);
    expect(parseEnv(readFileSync(envPath, "utf8")).DATABASE_URL).toBe("file:./data/ronne.db");
  });

  it("rejects an invalid email and a short password at the prompt, and repeats a mismatched confirmation", async () => {
    const { prompts, rejected, logs } = scriptedPrompts({
      ...sqliteAnswers,
      "root.email": ["not-an-email", "root@example.com"],
      "root.name": "Root",
      "root.password": ["too short", "correct horse battery", "correct horse battery"],
      "root.password_again": ["different horse battery", "correct horse battery"],
    });
    const result = await runSetup({ appDir, envPath, prompts });

    expect(result.rootCreated).toBe(true);
    expect(rejected.map((r) => r.id)).toEqual(["root.email", "root.password"]);
    expect(logs.some((l) => l.message.includes("don't match"))).toBe(true);
  });

  it("leaves no partial root when cancelled at the root prompts; running again finishes the job", async () => {
    const cancelled = scriptedPrompts({ ...sqliteAnswers, "root.email": CANCEL });
    await expect(runSetup({ appDir, envPath, prompts: cancelled.prompts })).rejects.toThrowError(
      /cancelled/,
    );

    const { db } = openEnvDb();
    expect(await db.selectFrom("user").select("id").execute()).toEqual([]);
    await db.destroy();

    const again = scriptedPrompts({
      "database.reuse": true,
      public_url: "http://localhost:3000",
      ...rootAnswers,
    });
    expect((await runSetup({ appDir, envPath, prompts: again.prompts })).rootCreated).toBe(true);
  });

  it("stops instead of asking again when not interactive", async () => {
    const { prompts } = scriptedPrompts(
      { ...sqliteAnswers, "database.path": "/dev/null/ronne.db" },
      { interactive: false },
    );
    await expect(runSetup({ appDir, envPath, prompts })).rejects.toThrowError(SetupFailedError);
    expect(existsSync(envPath)).toBe(false);
  });
});

// With TEST_DATABASE_URL on MySQL/MariaDB or PostgreSQL (004's matrix), run setup against an empty
// server database, including a wrong password first.
const serverUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!serverUrl || serverUrl.startsWith("file:"))("runSetup against a server", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await createTestDb({ migrate: false });
  });
  afterEach(() => t.cleanup());

  it("retries after a wrong password, then migrates and creates root", async () => {
    const url = new URL(t.url);
    const answers: DatabaseAnswers = {
      dialect: t.dialect as "mysql" | "postgres",
      host: url.hostname,
      port: url.port,
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
    const { prompts, logs } = scriptedPrompts({
      "database.kind": [answers.dialect, answers.dialect],
      "database.host": [answers.host, answers.host],
      "database.port": [answers.port, answers.port],
      "database.name": [answers.database, answers.database],
      "database.user": [answers.user, answers.user],
      "database.password": ["definitely-wrong", answers.password],
      public_url: "https://ronne.example.test",
      ...rootAnswers,
    });

    const result = await runSetup({ appDir, envPath, prompts });

    expect(result.rootCreated).toBe(true);
    expect(logs.filter((l) => l.level === "error")[0]?.message).toMatch(
      /refused the user name or password/,
    );
    expect(await t.db.selectFrom("user").select("role").execute()).toEqual([{ role: "root" }]);
  });
});
