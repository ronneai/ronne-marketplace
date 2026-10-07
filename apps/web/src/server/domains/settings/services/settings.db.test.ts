import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { foreignKeys } from "../../../db/testing/foreign-keys";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { InvalidUsageMinimumError, InvalidUsagePolicyError } from "../exceptions/errors";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import {
  instanceSettings,
  type SettingsDeps,
  setUsageMinimum,
  setUsagePolicy,
  usageMinimum,
  usagePolicy,
} from "./settings";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let deps: SettingsDeps;
const at = new Date("2026-10-05T12:00:00.000Z");

beforeEach(async () => {
  t = await createTestDb();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  deps = { repo: kyselySettingsRepository(t.db, t.dialect), now: () => at };
});
afterEach(() => t.cleanup());

const IP = "203.0.113.7";

describe("the usage policy", () => {
  it("is off on a new instance", async () => {
    expect(await usagePolicy(deps)).toBe("off");
    expect(await instanceSettings(deps, { user: root, ip: null })).toEqual({
      usagePolicy: "off",
      usagePolicyChangedAt: null,
      usageMinimum: 0,
    });
  });

  it("is changed by root, takes effect at once, and is audited with the old and new value", async () => {
    expect(await setUsagePolicy(deps, { user: root, ip: IP }, "choice")).toEqual({
      changed: true,
    });
    expect(await usagePolicy(deps)).toBe("choice");
    expect(await setUsagePolicy(deps, { user: root, ip: null }, "required")).toEqual({
      changed: true,
    });
    expect(await setUsagePolicy(deps, { user: root, ip: null }, "required")).toEqual({
      changed: false,
    });
    expect(await instanceSettings(deps, { user: root, ip: null })).toEqual({
      usagePolicy: "required",
      usagePolicyChangedAt: at,
      usageMinimum: 0,
    });
    const { events } = await listAuditEvents(t.db, t.dialect, { group: "settings" });
    expect(
      events.map((e) => ({ action: e.action, actor: e.actorId, ip: e.ipAddress, ...e.metadata })),
    ).toEqual([
      { action: "settings.usage_policy", actor: root.id, ip: null, from: "choice", to: "required" },
      { action: "settings.usage_policy", actor: root.id, ip: IP, from: "off", to: "choice" },
    ]);
  });

  it("can only be read and changed by root, and only to a known policy", async () => {
    for (const workspaceRole of ["user", "moderator"] as const) {
      const someone = {
        user: { ...root, id: "x", role: "user" as const, workspaces: { g: workspaceRole } },
        ip: null,
      };
      await expect(setUsagePolicy(deps, someone, "required")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(instanceSettings(deps, someone)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(
      setUsagePolicy(deps, { user: root, ip: null }, "sometimes"),
    ).rejects.toBeInstanceOf(InvalidUsagePolicyError);
    expect(await usagePolicy(deps)).toBe("off");
  });

  it("reads a value it doesn't know as off", async () => {
    await deps.repo.set("usage_policy", "maybe", root.id, at);
    expect(await usagePolicy(deps)).toBe("off");
  });
});

describe("the usage minimum", () => {
  it("is 0 until root sets one, which is audited", async () => {
    expect(await usageMinimum(deps)).toBe(0);
    expect(await setUsageMinimum(deps, { user: root, ip: null }, "20")).toEqual({ changed: true });
    expect(await usageMinimum(deps)).toBe(20);
    expect(await setUsageMinimum(deps, { user: root, ip: null }, 20)).toEqual({ changed: false });
    expect(await setUsageMinimum(deps, { user: root, ip: null }, "0")).toEqual({ changed: true });
    const { events } = await listAuditEvents(t.db, t.dialect, { group: "settings" });
    expect(events.map((e) => [e.action, e.metadata])).toEqual([
      ["settings.usage_minimum", { from: 20, to: 0 }],
      ["settings.usage_minimum", { from: 0, to: 20 }],
    ]);
  });

  it("takes whole numbers from 0 to 10,000, from root only", async () => {
    for (const bad of ["-1", "2.5", "10001", "", "many", null])
      await expect(
        setUsageMinimum(deps, { user: root, ip: null }, bad),
        String(bad),
      ).rejects.toBeInstanceOf(InvalidUsageMinimumError);
    await expect(
      setUsageMinimum(
        deps,
        { user: { ...root, role: "user", workspaces: { g: "moderator" } }, ip: null },
        "5",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await usageMinimum(deps)).toBe(0);
  });
});

describe("instance_settings", () => {
  it("keeps the setting when the user who changed it goes", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["instance_settings"])).toEqual([
      { table: "instance_settings", references: "user", onDelete: "SET NULL" },
    ]);
  });
});
