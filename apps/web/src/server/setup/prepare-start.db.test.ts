import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { migrateToLatest } from "../db/migrate";
import { migrations } from "../db/migrations";
import { createLogger } from "../log/logger";
import { resetSetupCodeShown, setupCodeShown } from "./announce-setup-code";
import { prepareStart, StartError } from "./prepare-start";
import { readSetupCode } from "./setup-code";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-start-"));
});
afterEach(() => {
  resetSetupCodeShown();
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const silent = createLogger({ level: "error", format: "json", write: () => {} });
const collect = (lines: Record<string, unknown>[]) =>
  createLogger({ level: "debug", format: "json", write: (line) => lines.push(JSON.parse(line)) });
const configured = () => ({
  DATABASE_URL: `file:${join(dir, "ronne.db")}`,
  AUTH_SECRET: "s".repeat(44),
  RONNE_ENV_FILE: join(dir, "none.env"),
});

/** The settings' database, migrated, with a root account (or an erased one). */
const withRoot = async (erased = false) => {
  const { db, dialect } = createDb(configured().DATABASE_URL);
  await migrateToLatest(db, dialect);
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
      erased_at: erased ? at : null,
    } as never)
    .execute();
  await db.destroy();
};

const notSetUp = () => ({ RONNE_ENV_FILE: join(dir, "none.env") });
const codeLines = (lines: Record<string, unknown>[]) =>
  lines.filter((line) => line.event === "server.setup_code");
const CODE = /^[0-7][0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{5}){4}-[0-9A-HJKMNP-TV-Z]$/;

describe("the setup code (161)", () => {
  it("is made at a fresh start, written 0600 in the data folder, and logged with the address", async () => {
    const lines: Record<string, unknown>[] = [];
    await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: { ...notSetUp(), PUBLIC_URL: "https://ronne.example.com" },
      log: collect(lines),
    });
    const stored = readSetupCode(join(dir, "setup-code"));
    expect(stored).not.toBeNull();
    expect(statSync(join(dir, "setup-code")).mode & 0o777).toBe(0o600);
    expect(lines.filter((line) => line.event === "setup.code_created")).toEqual([
      expect.objectContaining({ level: "info", msg: "Setup code made" }),
    ]);
    // setup.code_created never carries the code; server.setup_code is the one line that does.
    expect(
      JSON.stringify(lines.filter((line) => line.event !== "server.setup_code")),
    ).not.toContain(String(stored).slice(0, 5));
    const [line] = codeLines(lines);
    expect(line).toMatchObject({ level: "info", url: "https://ronne.example.com" });
    expect(line?.code).toMatch(CODE);
    expect(String(line?.code).replaceAll("-", "")).toBe(stored);
  });

  it("is the same code at a restart, logged again but not made again", async () => {
    const first: Record<string, unknown>[] = [];
    await prepareStart({ appDir: dir, dataDir: dir, env: notSetUp(), log: collect(first) });
    resetSetupCodeShown();
    const again: Record<string, unknown>[] = [];
    await prepareStart({ appDir: dir, dataDir: dir, env: notSetUp(), log: collect(again) });
    expect(codeLines(again)).toHaveLength(1);
    expect(codeLines(again)[0]?.code).toBe(codeLines(first)[0]?.code);
    expect(again.filter((line) => line.event === "setup.code_created")).toEqual([]);
  });

  it("is asked for when the settings exist but root doesn't (an interrupted setup)", async () => {
    const lines: Record<string, unknown>[] = [];
    const plan = await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: configured(),
      log: collect(lines),
    });
    expect(plan).toMatchObject({ mode: "ready", dialect: "sqlite", incomplete: true });
    expect(codeLines(lines)).toHaveLength(1);
    expect(readSetupCode(join(dir, "setup-code"))).not.toBeNull();
  });

  it("isn't made, nor logged, once root exists", async () => {
    await withRoot();
    resetSetupCodeShown();
    const lines: Record<string, unknown>[] = [];
    const plan = await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: configured(),
      log: collect(lines),
    });
    expect(plan).toEqual({ mode: "ready", applied: [], dialect: "sqlite" });
    expect(existsSync(join(dir, "setup-code"))).toBe(false);
    expect(lines.filter((line) => String(line.event).includes("setup"))).toEqual([]);
    // The server it starts doesn't check the setup state again (instrumentation.ts).
    expect(setupCodeShown()).toBe(true);
  });

  it("is asked for when the only root was erased (103)", async () => {
    await withRoot(true);
    const plan = await prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: silent });
    expect(plan).toMatchObject({ incomplete: true });
  });

  it("logs setup.code_invalid when the file holds no code, leaves it, and starts anyway", async () => {
    writeFileSync(join(dir, "setup-code"), "");
    const lines: Record<string, unknown>[] = [];
    const plan = await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: notSetUp(),
      log: collect(lines),
    });
    expect(plan).toEqual({ mode: "setup-required" });
    expect(lines).toContainEqual(
      expect.objectContaining({ level: "error", event: "setup.code_invalid" }),
    );
    expect(codeLines(lines)).toEqual([]);
    expect(readFileSync(join(dir, "setup-code"), "utf8")).toBe("");
  });

  it("logs setup.code_unwritable when the file can't be written, and starts anyway", async () => {
    // A folder where the file goes: the data folder is writable, the file isn't.
    mkdirSync(join(dir, "setup-code"));
    const lines: Record<string, unknown>[] = [];
    const plan = await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: notSetUp(),
      log: collect(lines),
    });
    expect(plan).toEqual({ mode: "setup-required" });
    expect(lines).toContainEqual(
      expect.objectContaining({ level: "error", event: "setup.code_unwritable" }),
    );
    expect(codeLines(lines)).toEqual([]);
  });
});

describe("prepareStart", () => {
  it("refuses to start with BETTER_AUTH_SECRETS set, before anything else (105)", async () => {
    for (const env of [configured(), { RONNE_ENV_FILE: join(dir, "none.env") }])
      await expect(
        prepareStart({
          appDir: dir,
          dataDir: dir,
          env: { ...env, BETTER_AUTH_SECRETS: "1:another-secret-another-secret-00" },
          log: silent,
        }),
      ).rejects.toThrowError(/BETTER_AUTH_SECRETS is set.*AUTH_SECRET alone/);
    expect(existsSync(join(dir, "ronne.db"))).toBe(false);
  });

  it("starts in setup mode before setup", async () => {
    const plan = await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: { RONNE_ENV_FILE: join(dir, "none.env") },
      log: silent,
    });
    expect(plan).toEqual({ mode: "setup-required" });
  });

  it("names the address to open in setup mode: PUBLIC_URL, as compose.yaml sets it (080)", async () => {
    const lines: Record<string, unknown>[] = [];
    await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: { RONNE_ENV_FILE: join(dir, "none.env"), PUBLIC_URL: "http://localhost:7650" },
      log: collect(lines),
    });
    expect(lines[0]).toEqual(
      expect.objectContaining({
        level: "info",
        url: "http://localhost:7650",
        command: "pnpm run setup",
      }),
    );
    expect(lines.find((line) => line.event === "server.setup_code")).toMatchObject({
      url: "http://localhost:7650",
    });
  });

  it("from the npm package, names its port and rmk-server's setup (082)", async () => {
    const lines: Record<string, unknown>[] = [];
    await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: { RONNE_ENV_FILE: join(dir, "none.env"), RONNE_RUNTIME: "npm", PORT: "7650" },
      log: collect(lines),
    });
    expect(lines[0]).toEqual(
      expect.objectContaining({ url: "http://localhost:7650", command: "rmk-server setup" }),
    );
  });

  it("applies pending migrations when set up, and has nothing to do next time", async () => {
    const lines: Record<string, unknown>[] = [];
    // No root yet on a new database: the setup code is asked for (161).
    expect(
      await prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: collect(lines) }),
    ).toEqual({
      mode: "ready",
      applied: Object.keys(migrations),
      dialect: "sqlite",
      incomplete: true,
    });
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "info",
        event: "server.migrations_applied",
        count: Object.keys(migrations).length,
        latest: Object.keys(migrations).at(-1),
      }),
    );
    lines.length = 0;
    await withRoot();
    expect(
      await prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: collect(lines) }),
    ).toEqual({ mode: "ready", applied: [], dialect: "sqlite" });
    expect(lines.filter((line) => line.event === "server.migrations_applied")).toEqual([]);
    expect(lines).toContainEqual(expect.objectContaining({ msg: "Database up to date" }));
    // The database's address isn't in any line.
    expect(JSON.stringify(lines)).not.toContain("ronne.db");
  });

  it("refuses to start on a database migrated by a newer version", async () => {
    const { db, dialect } = createDb(configured().DATABASE_URL);
    await migrateToLatest(db, dialect, {
      "0001_identity": () => ({ up: async () => {} }),
      "0099_future": () => ({ up: async () => {} }),
    });
    await db.destroy();

    const lines: Record<string, unknown>[] = [];
    await expect(
      prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: collect(lines) }),
    ).rejects.toThrowError(StartError);
    expect(lines.at(-1)).toMatchObject({
      level: "error",
      msg: "Migrations failed, so the server wasn't started",
      dialect: "sqlite",
      err: expect.objectContaining({ stack: expect.any(String) }),
    });
  });

  it("refuses to start when the data folder isn't writable, and says how to fix it", async () => {
    const data = join(dir, "data");
    await prepareStart({
      appDir: dir,
      dataDir: data,
      env: { RONNE_ENV_FILE: join(dir, "none.env") },
      log: silent,
    });
    chmodSync(data, 0o555);
    const error = await prepareStart({ appDir: dir, dataDir: data, env: {}, log: silent }).catch(
      (e: unknown) => e,
    );
    chmodSync(data, 0o755);
    expect(error).toBeInstanceOf(StartError);
    expect((error as Error).message).toContain("chown -R 1000:1000 /app/data");
  });
});
