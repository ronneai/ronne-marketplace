import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nonInteractivePrompts } from "./non-interactive-prompts";
import { runRotateSecret } from "./rotate-secret";

// The database side is mocked: these tests are about the settings file and what the command says
// (098). The real transaction is tested in instance-access.db.test.ts.
const database = vi.hoisted(() => ({
  fails: false,
  inPlaceFails: false,
  inPlaceComplete: false,
  writeFails: undefined as string | undefined,
  url: undefined as string | undefined,
}));
vi.mock("../db/create-db", () => ({
  createDb: (url: string) => {
    database.url = url;
    return { db: { destroy: async () => {} }, dialect: "sqlite" };
  },
}));
vi.mock("./env-file", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env-file")>();
  return {
    ...actual,
    writeEnvFile: (...args: Parameters<typeof actual.writeEnvFile>) => {
      if (database.writeFails)
        throw Object.assign(new Error(`${database.writeFails}: /secret/path/.env`), {
          code: database.writeFails,
        });
      if (database.inPlaceFails)
        throw new actual.InPlaceWriteError(
          Object.assign(new Error("full"), { code: "ENOSPC" }),
          database.inPlaceComplete,
        );
      return actual.writeEnvFile(...args);
    },
  };
});
vi.mock("../domains/identity/actions/instance-access", () => ({
  endSessionsForNewSecret: async (_db: unknown, _dialect: unknown, writeSecret: () => void) => {
    writeSecret();
    if (database.fails) throw new Error("the commit failed");
    return 3;
  },
}));

const OLD = "old-secret-old-secret-old-secret-0001";
let dir: string;
let envPath: string;
let lines: string[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-rotate-"));
  envPath = join(dir, ".env");
  writeFileSync(envPath, `DATABASE_URL=file:${join(dir, "ronne.db")}\nAUTH_SECRET=${OLD}\n`);
  lines = [];
  database.fails = false;
  database.inPlaceFails = false;
  database.inPlaceComplete = false;
  database.writeFails = undefined;
  database.url = undefined;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const rotate = (env: Record<string, string> = {}) =>
  runRotateSecret({
    appDir: dir,
    envPath,
    env,
    prompts: nonInteractivePrompts(
      {},
      { stdout: (l) => lines.push(l), stderr: (l) => lines.push(l) },
    ),
    yes: true,
  });

const secret = () => parseEnv(readFileSync(envPath, "utf8")).AUTH_SECRET;

describe("runRotateSecret (098)", () => {
  it("says the server uses the new secret at once with Docker and rmk-server, and to restart a clone", async () => {
    await rotate({ RONNE_RUNTIME: "docker" });
    expect(lines.join("\n")).toContain("The server uses the new secret from its next request.");
    expect(secret()).not.toBe(OLD);

    lines = [];
    await rotate({});
    expect(lines.join("\n")).toContain(
      "Restart the server so it reads the new secret: stop the server",
    );
  });

  it("a database failing after the file is written: says so, with the host's commands", async () => {
    database.fails = true;
    await expect(rotate({ RONNE_RUNTIME: "docker" })).rejects.toThrow(
      "The new AUTH_SECRET was written, but ending the sessions failed. Run `docker compose exec web pnpm run revoke-access --everyone --sessions-only`.",
    );
    expect(secret()).not.toBe(OLD);
    await expect(rotate({ RONNE_RUNTIME: "npm", RONNE_SERVICE: "1" })).rejects.toThrow(
      "Run `sudo rmk-server revoke-access --everyone --sessions-only`.",
    );
    await expect(rotate({})).rejects.toThrow(
      "Run `pnpm run revoke-access --everyone --sessions-only`, then restart the server:",
    );
  });

  it("an in-place rewrite that fails once open says the file may be incomplete", async () => {
    database.inPlaceFails = true;
    await expect(rotate()).rejects.toThrow(
      "The settings file was being rewritten in place and that failed (ENOSPC): it may be incomplete. Check it, and restore it from a backup if needed. The sessions weren't ended.",
    );
  });

  it("an in-place rewrite written in full whose chmod failed: the secret is in place", async () => {
    database.inPlaceFails = true;
    database.inPlaceComplete = true;
    await expect(rotate({ RONNE_RUNTIME: "docker" })).rejects.toThrow(
      "The new AUTH_SECRET was written, but ending the sessions failed. Run `docker compose exec web pnpm run revoke-access --everyone --sessions-only`.",
    );
  });

  it.each([
    ["EACCES", "run it as the account that owns the settings file"],
    ["EROFS", "run it as the account that owns the settings file"],
    ["ENOSPC", "fix the cause (a full disk?) and run this again"],
  ])(
    "a write failing with %s says nothing changed, with the advice that fits",
    async (code, advice) => {
      database.writeFails = code;
      const error = await rotate().catch((caught: Error) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        `The settings file couldn't be written (${code}). Nothing was changed: ${advice}.`,
      );
    },
  );

  it("a settings file it can't read: the code, never the path", async () => {
    chmodSync(envPath, 0o000);
    try {
      if (process.getuid?.() === 0) return;
      const error = await rotate().catch((caught: Error) => caught);
      expect((error as Error).message).toContain("couldn't be read (EACCES)");
      expect((error as Error).message).not.toContain(dir);
    } finally {
      chmodSync(envPath, 0o600);
    }
  });

  /** Runs with a question whose answer first changes the files, as someone might meanwhile. */
  const rotateEditing = (edit: () => void, env: Record<string, string> = {}) => {
    const prompts = nonInteractivePrompts({}, { stdout: () => {}, stderr: () => {} });
    return runRotateSecret({
      appDir: dir,
      envPath,
      env,
      prompts: {
        ...prompts,
        confirm: async () => {
          edit();
          return true;
        },
      },
      yes: false,
    });
  };

  it("a plain edit made while the question waits is kept, and its database is the one used", async () => {
    const other = `file:${join(dir, "other.db")}`;
    await rotateEditing(() =>
      writeFileSync(envPath, `DATABASE_URL=${other}\nAUTH_SECRET=${OLD}\nADDED_MEANWHILE=1\n`),
    );
    const after = parseEnv(readFileSync(envPath, "utf8"));
    expect(after.ADDED_MEANWHILE).toBe("1");
    expect(after.AUTH_SECRET).not.toBe(OLD);
    expect(database.url).toBe(other);
  });

  it("setup undone while the question waits (AUTH_SECRET removed): refused as not set up", async () => {
    await expect(
      rotateEditing(() => writeFileSync(envPath, `DATABASE_URL=file:${join(dir, "ronne.db")}\n`)),
    ).rejects.toThrow("This instance isn't set up yet");
    expect(database.url).toBeUndefined();
  });

  it("a file it will refuse is refused before the question is asked", async () => {
    writeFileSync(envPath, `${readFileSync(envPath, "utf8")}B: 2\n`);
    let asked = false;
    const prompts = nonInteractivePrompts({}, { stdout: () => {}, stderr: () => {} });
    await expect(
      runRotateSecret({
        appDir: dir,
        envPath,
        env: {},
        prompts: {
          ...prompts,
          confirm: async () => {
            asked = true;
            return true;
          },
        },
        yes: false,
      }),
    ).rejects.toThrow("isn't a plain KEY=value line");
    expect(asked).toBe(false);
  });

  it("DATABASE_URL from the environment wins over the file's, as for the server", async () => {
    await rotate({ RONNE_RUNTIME: "npm", DATABASE_URL: "postgres://elsewhere/ronne" });
    expect(database.url).toBe("postgres://elsewhere/ronne");
  });

  it("no settings file at all: not set up yet", async () => {
    rmSync(envPath);
    await expect(rotate()).rejects.toThrow("This instance isn't set up yet");
  });

  it("in a clone, an override file written while the question waits is caught", async () => {
    await expect(
      rotateEditing(() =>
        writeFileSync(join(dir, ".env.local"), "AUTH_SECRET=meanwhile-meanwhile-meanwhile-01\n"),
      ),
    ).rejects.toThrow("also set in the app folder's .env.local");
    expect(secret()).toBe(OLD);
  });

  it("an edit made while the question waits is checked too: refused, the edit kept", async () => {
    const prompts = nonInteractivePrompts({}, { stdout: () => {}, stderr: () => {} });
    const edited = `${readFileSync(envPath, "utf8")}AUTH_SECRET: legacy-legacy-legacy-legacy-0001\n`;
    await expect(
      runRotateSecret({
        appDir: dir,
        envPath,
        env: {},
        prompts: {
          ...prompts,
          confirm: async () => {
            writeFileSync(envPath, edited);
            return true;
          },
        },
        yes: false,
      }),
    ).rejects.toThrow("Line 3 of the settings file isn't a plain KEY=value line");
    expect(readFileSync(envPath, "utf8")).toBe(edited);
  });

  it("in a clone whose settings file is .env.local, that file isn't its own override", async () => {
    const local = join(dir, ".env.local");
    writeFileSync(local, readFileSync(envPath, "utf8"));
    writeFileSync(envPath, "");
    await runRotateSecret({
      appDir: dir,
      envPath: local,
      env: {},
      prompts: nonInteractivePrompts({}, { stdout: () => {}, stderr: () => {} }),
      yes: true,
    });
    expect(parseEnv(readFileSync(local, "utf8")).AUTH_SECRET).not.toBe(OLD);
  });

  it("refuses, changing nothing, when an AUTH_SECRET line sits inside another value", async () => {
    const before = `${readFileSync(envPath, "utf8")}CERT="-----BEGIN-----\nAUTH_SECRET=part-of-it\n-----END-----"\n`;
    writeFileSync(envPath, before);
    await expect(rotate()).rejects.toThrow("isn't a plain KEY=value line");
    expect(readFileSync(envPath, "utf8")).toBe(before);
  });

  it("refuses an `AUTH_SECRET: value` line, which Next.js reads and the server's reader skips", async () => {
    const before = `${readFileSync(envPath, "utf8")}AUTH_SECRET: legacy-legacy-legacy-legacy-0001\n`;
    writeFileSync(envPath, before);
    await expect(rotate()).rejects.toThrow(
      "Line 3 of the settings file isn't a plain KEY=value line",
    );
    expect(readFileSync(envPath, "utf8")).toBe(before);
  });

  it("refuses a carriage return that doesn't end a line, which only Next.js reads as a line break", async () => {
    const before = `${readFileSync(envPath, "utf8")}NOTE=x\rAUTH_SECRET=hidden-hidden-hidden-hidden-0001\n`;
    writeFileSync(envPath, before);
    await expect(rotate()).rejects.toThrow(
      "Line 3 of the settings file isn't a plain KEY=value line",
    );
    expect(readFileSync(envPath, "utf8")).toBe(before);
  });

  it.each([
    ["a newline before =", "AUTH_SECRET\n=old-old-old-old-old-old-old-0001\n"],
    ["a Unicode line separator", "X='a'\u2028AUTH_SECRET=old-old-old-old-old-old-0001\n"],
    ["KEY: value", "NOTE:\nAUTH_SECRET=old-old-old-old-old-old-old-0001\n"],
    ["an escaped quote", 'X="a\\"b"\n'],
  ])("refuses a file that isn't plain (%s): the two readers would disagree", async (_, extra) => {
    const before = `${readFileSync(envPath, "utf8")}${extra}`;
    writeFileSync(envPath, before);
    await expect(rotate()).rejects.toThrow("isn't a plain KEY=value line");
    expect(readFileSync(envPath, "utf8")).toBe(before);
  });

  it("in a clone with the settings elsewhere, refuses when the app's own .env sets AUTH_SECRET", async () => {
    // Settings in data/.env; the app folder's .env is loaded by Next.js and wins.
    const settings = join(dir, "data.env");
    writeFileSync(settings, readFileSync(envPath, "utf8"));
    writeFileSync(envPath, "AUTH_SECRET=stale-stale-stale-stale-stale-0001\n");
    await expect(
      runRotateSecret({
        appDir: dir,
        envPath: settings,
        env: {},
        prompts: nonInteractivePrompts({}, { stdout: () => {}, stderr: () => {} }),
        yes: true,
      }),
    ).rejects.toThrow("AUTH_SECRET is also set in the app folder's .env,");
  });

  it("in a clone, refuses when another file Next.js loads sets AUTH_SECRET", async () => {
    writeFileSync(join(dir, ".env.local"), "AUTH_SECRET=local-local-local-local-local-0001\n");
    await expect(rotate({})).rejects.toThrow(
      "AUTH_SECRET is also set in the app folder's .env.local",
    );
    expect(secret()).toBe(OLD);
    // Docker and rmk-server don't load it.
    await rotate({ RONNE_RUNTIME: "npm" });
    expect(secret()).not.toBe(OLD);
  });
});
