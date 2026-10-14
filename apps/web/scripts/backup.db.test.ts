import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real `pnpm run setup` and `pnpm run backup` entry points (099), as rmk-server runs
// them (RONNE_RUNTIME=npm, the data folder in RONNE_DATA_DIR), on a SQLite file of their own.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-backup-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (script: string, args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}.ts`, ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      CI: "",
      RONNE_RUNTIME: "npm",
      RONNE_DATA_DIR: dir,
      RONNE_ENV_FILE: join(dir, ".env"),
      ...env,
    },
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

const setUp = () =>
  run("setup", ["--yes"], {
    DATABASE_URL: `file:${join(dir, "ronne.db")}`,
    STORAGE_PATH: join(dir, "storage"),
    PUBLIC_URL: "http://localhost:3000",
    RONNE_ROOT_EMAIL: "root@example.com",
    RONNE_ROOT_NAME: "Root",
    RONNE_ROOT_PASSWORD: "correct horse battery",
  });

const ARCHIVE = /^ronne-backup-\d{8}-\d{6}\.tar$/;

describe("pnpm run backup --encrypt (099)", () => {
  it("takes the passphrase from RONNE_BACKUP_PASSPHRASE, and never prints it", () => {
    expect(setUp().code).toBe(0);
    const secret = "schedules-passphrase-8c1f";
    const made = run("backup", ["--encrypt"], { RONNE_BACKUP_PASSPHRASE: secret });
    expect(made.code, made.stderr).toBe(0);
    const archives = readdirSync(join(dir, "backups"));
    expect(archives[0]).toMatch(/^ronne-backup-\d{8}-\d{6}\.tar\.enc$/);
    expect(`${made.stdout}${made.stderr}`).not.toContain(secret);
    expect(made.stderr).toContain("It's encrypted");
  });

  it("verifies an encrypted archive with the passphrase, and refuses a damaged one (1)", () => {
    expect(setUp().code).toBe(0);
    const env = { RONNE_BACKUP_PASSPHRASE: "verify-me-3d9a" };
    expect(run("backup", ["--encrypt"], env).code).toBe(0);
    const [name] = readdirSync(join(dir, "backups"));
    const archive = join(dir, "backups", name as string);
    const ok = run("backup", ["--verify", archive], env);
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("is complete: every checksum matches");
    expect(ok.stdout).toContain(", encrypted");
    const wrong = run("backup", ["--verify", archive], { RONNE_BACKUP_PASSPHRASE: "a guess" });
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain("damaged, or the passphrase is wrong");
    // Cut short.
    const cut = join(dir, "cut.tar.enc");
    const bytes = readFileSync(archive);
    writeFileSync(cut, bytes.subarray(0, bytes.length - 10));
    expect(run("backup", ["--verify", cut], env).code).toBe(1);
  });

  it("refuses --encrypt with no passphrase and no terminal (2)", () => {
    const none = run("backup", ["--encrypt"]);
    expect(none.code).toBe(2);
    expect(none.stderr).toContain("--passphrase-file or RONNE_BACKUP_PASSPHRASE");
  });
});

describe("pnpm run backup (099)", () => {
  it("refuses bad flags (2) and an instance that isn't set up (1)", () => {
    const bad = run("backup", ["--keep", "0"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("--keep needs a whole number");
    expect(bad.stderr).toContain("Usage: backup");

    const notSetUp = run("backup", []);
    expect(notSetUp.code).toBe(1);
    expect(notSetUp.stderr).toContain("isn't set up yet");
    expect(notSetUp.stderr).toContain("rmk-server setup");
  });

  it("writes the archive in the data folder's backups/, or --out from where it was typed", () => {
    expect(setUp().code).toBe(0);
    const made = run("backup", ["--yes"]);
    expect(made.code, made.stderr).toBe(0);
    const archives = readdirSync(join(dir, "backups"));
    expect(archives).toHaveLength(1);
    expect(archives[0]).toMatch(ARCHIVE);
    expect(made.stdout).toContain(`Wrote ${join(dir, "backups", archives[0] as string)}`);
    expect(made.stderr).toContain("AUTH_SECRET and the database's password");

    // pnpm runs the script in the app's folder; INIT_CWD is the folder of the package it ran for.
    mkdirSync(join(dir, "here"));
    const elsewhere = run("backup", ["--out", "mine", "--no-settings"], {
      INIT_CWD: join(dir, "here"),
    });
    expect(elsewhere.code, elsewhere.stderr).toBe(0);
    expect(readdirSync(join(dir, "here", "mine"))[0]).toMatch(ARCHIVE);
    expect(existsSync(join(dir, "storage", "mine"))).toBe(false);
  });
});
