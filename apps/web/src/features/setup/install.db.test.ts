import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CreatedDb, createDb } from "@/server/db/create-db";
import { listAuditEvents } from "@/server/domains/audit/actions/audit";
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
  };
});
afterEach(async () => {
  for (const { db } of opened.values()) await db.destroy();
  opened.clear();
  rmSync(appDir, { recursive: true, force: true });
});

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};
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

    expect(await installMigrationsWith(context)).toMatchObject({
      ok: true,
      detail: expect.stringMatching(/^Migrations applied \(\d+\)$/),
    });
    expect(await installMigrationsWith(context)).toMatchObject({
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
      installMigrationsWith(context),
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
      installMigrationsWith(ctx),
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
    expect(await installMigrationsWith(context)).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
    expect(await installRootWith(context, form(root))).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
    await installSettingsWith(context, form(sqlite));
    await installMigrationsWith(context);
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
      settings: { status: "done", detail: `Settings written to ${context.envPath}` },
      migrations: { status: "done", detail: expect.stringMatching(/^Migrations applied/) },
      root: { status: "done", detail: "Root account created (root@example.com)" },
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
