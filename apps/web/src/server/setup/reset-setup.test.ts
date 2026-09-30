import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyReset, planReset, ResetRefusedError } from "./reset-setup";

let appDir: string;
beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-reset-"));
});
afterEach(() => rmSync(appDir, { recursive: true, force: true }));

const settings = (lines: string[]) => writeFileSync(join(appDir, ".env"), `${lines.join("\n")}\n`);
const touch = (path: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "");
};

describe("planReset", () => {
  it("refuses in production and in Docker, before reading anything", () => {
    expect(() => planReset({ appDir, env: { NODE_ENV: "production" } })).toThrowError(
      ResetRefusedError,
    );
    expect(() => planReset({ appDir, env: { RONNE_RUNTIME: "docker" } })).toThrowError(
      /not in Docker/,
    );
  });

  it("lists the settings file, the SQLite database with its journal files, and the storage folder", () => {
    settings(["DATABASE_URL=file:./data/ronne.db", "AUTH_SECRET=x", "STORAGE_PATH=./data/storage"]);
    touch(join(appDir, "data/ronne.db"));
    touch(join(appDir, "data/ronne.db-wal"));
    touch(join(appDir, "data/storage/keep.txt"));

    const plan = planReset({ appDir, env: {} });
    expect(plan.items).toEqual([
      { kind: "settings", path: join(appDir, ".env") },
      { kind: "database", path: join(appDir, "data/ronne.db") },
      { kind: "database", path: join(appDir, "data/ronne.db-wal") },
      { kind: "storage", path: join(appDir, "data/storage") },
    ]);
    expect(plan.notes).toEqual([]);

    expect(applyReset(plan)).toHaveLength(4);
    for (const item of plan.items) expect(existsSync(item.path)).toBe(false);
    expect(existsSync(join(appDir, "data"))).toBe(true);
  });

  it("leaves a SQLite file outside the app folder, and a storage folder outside data/, alone", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "ronne-elsewhere-"));
    try {
      touch(join(elsewhere, "ronne.db"));
      mkdirSync(join(elsewhere, "storage"));
      settings([
        `DATABASE_URL=file:${join(elsewhere, "ronne.db")}`,
        "AUTH_SECRET=x",
        `STORAGE_PATH=${join(elsewhere, "storage")}`,
      ]);
      const plan = planReset({ appDir, env: {} });
      expect(plan.items).toEqual([{ kind: "settings", path: join(appDir, ".env") }]);
      expect(plan.notes).toEqual([
        expect.stringContaining("outside the app folder"),
        expect.stringContaining("outside the app's data folder"),
      ]);
      applyReset(plan);
      expect(existsSync(join(elsewhere, "ronne.db"))).toBe(true);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("removes only the settings file for a server database, and says so without the password", () => {
    settings(["DATABASE_URL=postgres://ronne:hunter2@db:5432/ronne", "AUTH_SECRET=x"]);
    const plan = planReset({ appDir, env: {} });
    expect(plan.items).toEqual([{ kind: "settings", path: join(appDir, ".env") }]);
    expect(plan.notes).toEqual([expect.stringContaining("PostgreSQL database")]);
    expect(plan.notes[0]).not.toContain("hunter2");
  });

  it("follows RONNE_ENV_FILE and the environment, as the app does", () => {
    const envPath = join(appDir, "elsewhere.env");
    writeFileSync(envPath, "AUTH_SECRET=x\n");
    touch(join(appDir, "data/env.db"));
    const plan = planReset({
      appDir,
      env: { RONNE_ENV_FILE: envPath, DATABASE_URL: "file:./data/env.db" },
    });
    expect(plan.items).toEqual([
      { kind: "settings", path: envPath },
      { kind: "database", path: join(appDir, "data/env.db") },
    ]);
  });

  it("has nothing to do on a fresh clone", () => {
    expect(planReset({ appDir, env: {} })).toEqual({ items: [], notes: [] });
  });
});
