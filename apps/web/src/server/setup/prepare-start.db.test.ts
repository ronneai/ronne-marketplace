import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import { migrations } from "../db/migrations";
import { prepareStart, StartError } from "./prepare-start";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-start-"));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

const silent = () => {};
const configured = () => ({
  DATABASE_URL: `file:${join(dir, "ronne.db")}`,
  AUTH_SECRET: "s".repeat(44),
  RONNE_ENV_FILE: join(dir, "none.env"),
});

describe("prepareStart", () => {
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
    const lines: string[] = [];
    await prepareStart({
      appDir: dir,
      dataDir: dir,
      env: { RONNE_ENV_FILE: join(dir, "none.env"), PUBLIC_URL: "http://localhost:7650" },
      log: (line) => lines.push(line),
    });
    expect(lines.join("\n")).toContain("Open http://localhost:7650 in a browser");
  });

  it("applies pending migrations when set up, and has nothing to do next time", async () => {
    expect(
      await prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: silent }),
    ).toEqual({
      mode: "ready",
      applied: Object.keys(migrations),
    });
    expect(
      await prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: silent }),
    ).toEqual({ mode: "ready", applied: [] });
  });

  it("refuses to start on a database migrated by a newer version", async () => {
    const { db, dialect } = createDb(configured().DATABASE_URL);
    await migrateToLatest(db, dialect, {
      "0001_identity": () => ({ up: async () => {} }),
      "0099_future": () => ({ up: async () => {} }),
    });
    await db.destroy();

    await expect(
      prepareStart({ appDir: dir, dataDir: dir, env: configured(), log: silent }),
    ).rejects.toThrowError(StartError);
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
