import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CreatedDb, createDb } from "@/server/db/create-db";
import { listAuditEvents } from "@/server/domains/audit/actions/audit";
import { createLogger } from "@/server/log/logger";
import { ensureSetupCode } from "@/server/setup/setup-code";
import { createSetupCodeLimiter } from "@/server/setup/setup-code-limit";
import { getSetupState, resetSetupState } from "@/server/setup/state";
import {
  installAllWith,
  installMigrationsWith,
  installRootWith,
  installSettingsWith,
  type SetupContext,
  testDatabaseWith,
} from "./install";
import { DEFAULT_VALUES, type InstallState, PENDING_STEPS } from "./types";

let appDir: string;
let context: SetupContext;
let code: string;
const opened = new Map<string, CreatedDb>();

beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-install-"));
  resetSetupState();
  const envPath = join(appDir, ".env");
  context = {
    appDir,
    envPath,
    env: { RONNE_ENV_FILE: envPath },
    getDb: (url) => {
      let db = opened.get(url);
      if (!db) {
        db = createDb(url, { baseDir: appDir });
        opened.set(url, db);
      }
      return db;
    },
    origin: { via: "web", ipAddress: "203.0.113.9" },
    setupCode: { path: join(appDir, "data", "setup-code"), limiter: createSetupCodeLimiter() },
    log: silent,
  };
  // The server made the code at its start (161); every step's form carries it unless a test says.
  code = ensureSetupCode(context.setupCode.path).code;
});
afterEach(async () => {
  for (const { db } of opened.values()) await db.destroy();
  opened.clear();
  rmSync(appDir, { recursive: true, force: true });
});

/** A form as the page sends it: with the setup code, unless `entries` sets its own (or none). */
const form = (entries: Record<string, string | undefined>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ "setup.code": code, ...entries }))
    if (value !== undefined) data.set(key, value);
  return data;
};
const silent = createLogger({ level: "error", format: "json", write: () => {} });
const sqlite = {
  "database.kind": "sqlite",
  "database.path": "./data/ronne.db",
  public_url: "http://localhost:3000/",
};
const root = {
  "root.email": "Root@Example.com",
  "root.name": "Root",
  "root.password": "correct horse battery",
  "root.password_again": "correct horse battery",
};
const initial: InstallState = { steps: { ...PENDING_STEPS }, notices: [], values: DEFAULT_VALUES };

describe("the web setup's steps", () => {
  it("tests a database with the terminal's words", async () => {
    expect(await testDatabaseWith(context, form(sqlite))).toMatchObject({
      ok: true,
      dialect: "sqlite",
    });
    const bad = await testDatabaseWith(
      context,
      form({
        "database.kind": "postgres",
        "database.host": "127.0.0.1",
        "database.port": "1",
        "database.name": "r",
        "database.user": "u",
        "database.password": "hunter2",
      }),
    );
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "database", message: expect.stringContaining("Couldn't reach") },
    });
    expect(JSON.stringify(bad)).not.toContain("hunter2");
    expect(
      await testDatabaseWith(context, form({ "database.kind": "sqlite", "database.path": "" })),
    ).toMatchObject({
      ok: false,
      error: { field: "database.path" },
    });
  });

  it("installs step by step: settings, migrations, root, then refuses", async () => {
    const settings = await installSettingsWith(context, form(sqlite));
    expect(settings).toMatchObject({
      ok: true,
      detail: `Settings written to ${context.envPath}`,
      notices: [],
    });
    const env = parseEnv(readFileSync(context.envPath, "utf8"));
    expect(env).toMatchObject({
      DATABASE_URL: "file:./data/ronne.db",
      PUBLIC_URL: "http://localhost:3000",
    });
    expect(existsSync(join(appDir, "data/storage"))).toBe(true);
    expect(await getSetupStateOf(context)).toBe("incomplete");

    expect(await installMigrationsWith(context, form({}))).toMatchObject({
      ok: true,
      detail: expect.stringMatching(/^Migrations applied \(\d+\)$/),
    });
    expect(await installMigrationsWith(context, form({}))).toMatchObject({
      ok: true,
      detail: "Database up to date",
    });
    expect(await getSetupStateOf(context)).toBe("incomplete");

    const created = await installRootWith(context, form(root));
    expect(created).toMatchObject({ ok: true, email: "root@example.com" });
    expect(await getSetupStateOf(context)).toBe("ready");
    const { db, dialect } = context.getDb(env.DATABASE_URL as string);
    const events = (await listAuditEvents(db, dialect, {})).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "instance.root_created",
      metadata: { via: "web" },
      ipAddress: "203.0.113.9",
    });

    for (const again of [
      testDatabaseWith(context, form(sqlite)),
      installSettingsWith(context, form(sqlite)),
      installMigrationsWith(context, form({})),
      installRootWith(context, form({ ...root, "root.email": "other@example.com" })),
    ])
      expect(await again).toMatchObject({ ok: false, error: { code: "already_set_up" } });
  });

  it("never runs on a configured instance whose database doesn't answer (security audit AUTHZ-1)", async () => {
    // A configured instance: its settings name a database that doesn't answer (a closed port), as
    // when the server is down, restarting, or overloaded. Anyone could otherwise point it at their
    // own database and become root.
    const settings = [
      "DATABASE_URL=postgres://ronne:secret@127.0.0.1:1/ronne",
      "AUTH_SECRET=an-existing-secret-of-at-least-32-characters",
      "PUBLIC_URL=https://ronne.example.com",
      "",
    ].join("\n");
    writeFileSync(context.envPath, settings);
    const attacker = {
      "database.kind": "sqlite",
      "database.path": "./attacker.db",
      public_url: "https://ronne.example.com/",
    };
    const steps = (ctx: SetupContext) => [
      testDatabaseWith(ctx, form(attacker)),
      installSettingsWith(ctx, form(attacker)),
      installMigrationsWith(ctx, form({})),
      installRootWith(ctx, form({ ...root, "root.email": "attacker@example.com" })),
    ];
    for (const step of steps(context))
      expect(await step).toMatchObject({ ok: false, error: { code: "database_unavailable" } });
    // A database whose connection fails outright (MySQL or PostgreSQL refusing it) is refused too.
    const failing: SetupContext = {
      ...context,
      getDb: () => {
        throw new Error("too many clients already");
      },
    };
    for (const step of steps(failing))
      expect(await step).toMatchObject({ ok: false, error: { code: "database_unavailable" } });
    // Nothing changed: the same settings, and no database of the attacker's.
    expect(readFileSync(context.envPath, "utf8")).toBe(settings);
    expect(existsSync(join(appDir, "attacker.db"))).toBe(false);
  });

  it("refuses the later steps before the settings exist, and a password that doesn't match", async () => {
    expect(await installMigrationsWith(context, form({}))).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
    expect(await installRootWith(context, form(root))).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
    await installSettingsWith(context, form(sqlite));
    await installMigrationsWith(context, form({}));
    expect(
      await installRootWith(context, form({ ...root, "root.password_again": "something else" })),
    ).toMatchObject({
      ok: false,
      error: { code: "mismatch", field: "root.password_again" },
    });
    expect(
      await installRootWith(
        context,
        form({ ...root, "root.password": "short", "root.password_again": "short" }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid", field: "root.password" },
    });
    expect(
      await installRootWith(context, form({ ...root, "root.email": "not an email" })),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid", field: "root.email" },
    });
  });

  it("keeps the database already in the settings when asked, and uses PUBLIC_URL from the environment", async () => {
    await installSettingsWith(context, form(sqlite));
    context.env.PUBLIC_URL = "https://ronne.example";
    const kept = await installSettingsWith(
      context,
      form({ "database.keep": "on", public_url: "http://ignored" }),
    );
    expect(kept).toMatchObject({ ok: true, notices: [] });
    expect(parseEnv(readFileSync(context.envPath, "utf8"))).toMatchObject({
      DATABASE_URL: "file:./data/ronne.db",
      PUBLIC_URL: "https://ronne.example",
    });
  });

  it("does the whole install in one go, and echoes the non-secret values with the progress", async () => {
    const state = await installAllWith(context, initial, form({ ...sqlite, ...root }));
    expect(state.steps).toEqual({
      settings: {
        status: "done",
        detail: `Settings written to ${context.envPath}`,
        say: { key: "detail.settings", values: { path: context.envPath } },
      },
      migrations: {
        status: "done",
        detail: expect.stringMatching(/^Migrations applied/),
        say: { key: "detail.migrations", values: { count: expect.any(Number) } },
      },
      root: {
        status: "done",
        detail: "Root account created (root@example.com)",
        say: { key: "detail.root", values: { email: "root@example.com" } },
      },
    });
    expect(state.done).toEqual({ email: "root@example.com" });
    expect(state.values).toMatchObject({ kind: "sqlite", rootEmail: "Root@Example.com" });
    expect(JSON.stringify(state)).not.toContain("correct horse");

    const failed = await installAllWith(context, initial, form({ ...sqlite, ...root }));
    expect(failed.steps.settings.status).toBe("failed");
    expect(failed.error).toMatchObject({ code: "already_set_up" });
  });

  it("stops at the settings when the database check fails, with the field or the explanation", async () => {
    const state = await installAllWith(
      context,
      initial,
      form({
        ...root,
        "database.kind": "mysql",
        "database.host": "127.0.0.1",
        "database.port": "1",
        "database.name": "r",
        "database.user": "u",
      }),
    );
    expect(state.steps.settings.status).toBe("failed");
    expect(state.steps.migrations.status).toBe("pending");
    expect(state.error).toMatchObject({ code: "database", section: "database" });
    expect(existsSync(context.envPath)).toBe(false);
  });
});

const getSetupStateOf = async (c: SetupContext) => {
  const { loadConfig } = await import("@/server/config");
  return getSetupState(loadConfig({ appDir: c.appDir, env: c.env }), {
    getDb: c.getDb,
    remember: false,
  });
};

describe("the setup code (161)", () => {
  /** Every action, with the form given: the four steps and the whole install in one go. */
  const actions = (entries: Record<string, string | undefined>) =>
    [
      ["testDatabase", () => testDatabaseWith(context, form({ ...sqlite, ...entries }))],
      ["installSettings", () => installSettingsWith(context, form({ ...sqlite, ...entries }))],
      ["installMigrations", () => installMigrationsWith(context, form(entries))],
      ["installRoot", () => installRootWith(context, form({ ...root, ...entries }))],
      [
        "installAll",
        async () => {
          const state = await installAllWith(
            context,
            initial,
            form({ ...sqlite, ...root, ...entries }),
          );
          return state.error ? { ok: false, error: state.error } : { ok: true };
        },
      ],
    ] as const;

  it.each([
    ["no code", undefined],
    ["an empty code", ""],
    ["a wrong code", "0000000000000000000000000"],
    ["a code that isn't one", "hello"],
  ])("refuses every action with %s, and changes nothing", async (_, typed) => {
    for (const [name, action] of actions({ "setup.code": typed }))
      expect(await action(), name).toMatchObject({
        ok: false,
        error: {
          code: "setup_code_wrong",
          section: "code",
          field: "setup.code",
          message: expect.stringContaining("pnpm run setup-code"),
        },
      });
    expect(existsSync(context.envPath)).toBe(false);
    expect(existsSync(join(appDir, "data", "ronne.db"))).toBe(false);
  });

  it("refuses another server's code", async () => {
    const other = join(appDir, "other", "setup-code");
    const theirs = ensureSetupCode(other).code;
    expect(
      await installSettingsWith(context, form({ ...sqlite, "setup.code": theirs })),
    ).toMatchObject({ ok: false, error: { code: "setup_code_wrong" } });
  });

  it("accepts the right code in any case, with spaces or dashes, at every step", async () => {
    const typed = ` ${code.toLowerCase().replace(/(.{5})/g, "$1 - ")} `;
    expect(await testDatabaseWith(context, form({ ...sqlite, "setup.code": typed }))).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      await installSettingsWith(context, form({ ...sqlite, "setup.code": typed })),
    ).toMatchObject({ ok: true });
    expect(await installMigrationsWith(context, form({ "setup.code": typed }))).toMatchObject({
      ok: true,
    });
    expect(await installRootWith(context, form({ ...root, "setup.code": typed }))).toMatchObject({
      ok: true,
    });
  });

  it("refuses every action when there's no code on the server, naming the commands", async () => {
    rmSync(context.setupCode.path);
    for (const [name, action] of actions({}))
      expect(await action(), name).toMatchObject({
        ok: false,
        error: {
          code: "setup_code_missing",
          message: expect.stringMatching(/pnpm run setup-code.*pnpm run setup/),
          say: { key: "errors.setup_code_missing" },
        },
      });
    // The command for the runtime: Docker's, from outside the container.
    const docker = { ...context, env: { ...context.env, RONNE_RUNTIME: "docker" } };
    expect(await installSettingsWith(docker, form(sqlite))).toMatchObject({
      error: { message: expect.stringContaining("docker compose exec web pnpm run setup-code") },
    });
  });

  it("refuses when the file holds no code", async () => {
    writeFileSync(context.setupCode.path, "");
    expect(await installSettingsWith(context, form({ ...sqlite, "setup.code": "" }))).toMatchObject(
      {
        ok: false,
        error: { code: "setup_code_missing" },
      },
    );
  });

  it("checks the state first: a set-up instance is refused as before, without its code file", async () => {
    await installAllWith(context, initial, form({ ...sqlite, ...root }));
    expect(existsSync(context.setupCode.path)).toBe(false);
    for (const [name, action] of actions({ "setup.code": undefined }))
      expect(await action(), name).toMatchObject({
        ok: false,
        error: { code: "already_set_up" },
      });
  });

  it("allows 10 wrong codes per address in 10 minutes, then refuses even the right one", async () => {
    let now = Date.parse("2026-11-01T12:00:00Z");
    context.setupCode.limiter = createSetupCodeLimiter(() => now);
    const wrong = form({ ...sqlite, "setup.code": "1".repeat(26) });
    for (let attempt = 0; attempt < 10; attempt++)
      expect(await testDatabaseWith(context, wrong)).toMatchObject({
        error: { code: "setup_code_wrong" },
      });
    expect(await testDatabaseWith(context, form(sqlite))).toMatchObject({
      ok: false,
      error: {
        code: "setup_code_rate_limited",
        say: { key: "errors.setup_code_rate_limited", values: { minutes: 10 } },
      },
    });
    // Another address still gets in.
    const elsewhere = { ...context, origin: { via: "web" as const, ipAddress: "198.51.100.4" } };
    expect(await testDatabaseWith(elsewhere, form(sqlite))).toMatchObject({ ok: true });
    // After the window, the first address does too.
    now += 10 * 60_000;
    expect(await testDatabaseWith(context, form(sqlite))).toMatchObject({ ok: true });
  });

  it("allows 30 wrong codes in all, from any addresses or none, then refuses everyone", async () => {
    context.setupCode.limiter = createSetupCodeLimiter(() => 0);
    const wrong = form({ ...sqlite, "setup.code": "1".repeat(26) });
    for (let attempt = 0; attempt < 30; attempt++) {
      const from = {
        ...context,
        origin: { via: "web" as const, ipAddress: attempt % 2 ? null : `198.51.100.${attempt}` },
      };
      expect(await testDatabaseWith(from, wrong)).toMatchObject({
        error: { code: "setup_code_wrong" },
      });
    }
    const fresh = { ...context, origin: { via: "web" as const, ipAddress: "192.0.2.200" } };
    expect(await testDatabaseWith(fresh, form(sqlite))).toMatchObject({
      error: { code: "setup_code_rate_limited" },
    });
  });

  it("doesn't count the right code against the limit", async () => {
    context.setupCode.limiter = createSetupCodeLimiter(() => 0);
    for (let attempt = 0; attempt < 40; attempt++)
      expect(await testDatabaseWith(context, form(sqlite))).toMatchObject({ ok: true });
  });

  it("logs refused codes without the code typed", async () => {
    const lines: string[] = [];
    context.log = createLogger({
      level: "debug",
      format: "json",
      write: (line) => lines.push(line),
    });
    const typed = "7ZZZZZZZZZZZZZZZZZZZZZZZZZ";
    await testDatabaseWith(context, form({ ...sqlite, "setup.code": typed }));
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ level: "warn", event: "setup.code_refused", reason: "wrong" }),
    ]);
    expect(lines.join("")).not.toContain(typed);
    expect(lines.join("")).not.toContain(code);
  });

  it.skipIf(process.getuid?.() === 0)(
    "finishes the setup when the code can't be deleted, and logs it",
    async () => {
      // The code in a folder of its own that can be read but not changed (the database is elsewhere).
      const folder = join(appDir, "codes");
      context.setupCode.path = join(folder, "setup-code");
      code = ensureSetupCode(context.setupCode.path).code;
      const lines: string[] = [];
      context.log = createLogger({
        level: "debug",
        format: "json",
        write: (line) => lines.push(line),
      });
      await installSettingsWith(context, form(sqlite));
      await installMigrationsWith(context, form({}));
      chmodSync(folder, 0o500);
      try {
        expect(await installRootWith(context, form(root))).toMatchObject({ ok: true });
      } finally {
        chmodSync(folder, 0o700);
      }
      expect(lines.map((line) => JSON.parse(line))).toContainEqual(
        expect.objectContaining({ level: "warn", event: "setup.code_not_deleted" }),
      );
      expect(lines.join("")).not.toContain(code);
    },
  );

  it("deletes the code once root exists, and keeps it while root can't be created", async () => {
    await installSettingsWith(context, form(sqlite));
    await installMigrationsWith(context, form({}));
    expect(
      await installRootWith(context, form({ ...root, "root.password_again": "something else" })),
    ).toMatchObject({ ok: false });
    expect(existsSync(context.setupCode.path)).toBe(true);
    expect(await installRootWith(context, form(root))).toMatchObject({ ok: true });
    expect(existsSync(context.setupCode.path)).toBe(false);
  });
});
