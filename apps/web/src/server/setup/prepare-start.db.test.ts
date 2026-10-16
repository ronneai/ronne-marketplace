import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import { migrations } from "../db/migrations";
import { createLogger } from "../log/logger";
import { prepareStart, StartError } from "./prepare-start";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-start-"));
});
afterEach(() => {
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
    expect(lines).toEqual([
      expect.objectContaining({
        level: "info",
        url: "http://localhost:7650",
        command: "pnpm run setup",
      }),
    ]);
  });

  it("from the npm package, names its port and rmk-server's setup (082)", async () => {
    const lines: Record<string, unknown>[] = [];
    await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: { RONNE_ENV_FILE: join(dir, "none.env"), RONNE_RUNTIME: "npm", PORT: "7650" },
      log: collect(lines),
    });
    expect(lines).toEqual([
      expect.objectContaining({ url: "http://localhost:7650", command: "rmk-server setup" }),
    ]);
  });

  it("applies pending migrations when set up, and has nothing to do next time", async () => {
    const lines: Record<string, unknown>[] = [];
    expect(
      await prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: collect(lines) }),
    ).toEqual({ mode: "ready", applied: Object.keys(migrations), dialect: "sqlite" });
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "info",
        event: "server.migrations_applied",
        count: Object.keys(migrations).length,
        latest: Object.keys(migrations).at(-1),
      }),
    );
    lines.length = 0;
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
