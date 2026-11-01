import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { checkedTooRecently, isNewerRelease, UPDATE_KEYS } from "../models/update-check";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import {
  type SettingsDeps,
  setUpdateCheck,
  updateCheckSettings,
  updateCheckState,
} from "./settings";

// The upgrade check's switch and what the Updates tab reads (140).
let t: TestDb;
let root: CurrentUser;
let deps: SettingsDeps;
const at = new Date("2026-11-01T12:00:00.000Z");
const IP = "203.0.113.7";

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

const events = async () =>
  (await listAuditEvents(t.db, t.dialect, { group: "settings" })).events.filter(
    (e) => e.action === "settings.update_check",
  );

describe("the upgrade check's settings (140)", () => {
  it("is on, with nothing seen, on a new instance", async () => {
    expect(await updateCheckSettings(deps, { user: root, ip: null })).toEqual({
      enabled: true,
      latest: null,
      url: null,
      checkedAt: null,
      error: null,
    });
  });

  it("reads what the check stored, and ignores a reason it doesn't know", async () => {
    await deps.repo.set(UPDATE_KEYS.latest, "0.9.0", null, at);
    await deps.repo.set(UPDATE_KEYS.url, "https://example.test/notes", null, at);
    await deps.repo.set(UPDATE_KEYS.at, at.toISOString(), null, at);
    await deps.repo.set(UPDATE_KEYS.error, "rate_limited", null, at);
    expect(await updateCheckState(deps)).toEqual({
      enabled: true,
      latest: "0.9.0",
      url: "https://example.test/notes",
      checkedAt: at,
      error: "rate_limited",
    });
    await deps.repo.set(UPDATE_KEYS.error, "<script>", null, at);
    expect((await updateCheckState(deps)).error).toBeNull();
  });

  it("turns the switch off and on, auditing each change with who and from where", async () => {
    expect(await setUpdateCheck(deps, { user: root, ip: IP }, false)).toEqual({ changed: true });
    expect((await updateCheckState(deps)).enabled).toBe(false);
    expect(await setUpdateCheck(deps, { user: root, ip: IP }, true)).toEqual({ changed: true });
    expect((await updateCheckState(deps)).enabled).toBe(true);
    const found = await events();
    expect(found.map((e) => [e.actorId, e.ipAddress, e.targetType, e.metadata])).toEqual([
      [root.id, IP, "instance", { from: false, to: true }],
      [root.id, IP, "instance", { from: true, to: false }],
    ]);
  });

  it("saves and audits nothing when the switch already has that value", async () => {
    expect(await setUpdateCheck(deps, { user: root, ip: IP }, true)).toEqual({ changed: false });
    await setUpdateCheck(deps, { user: root, ip: IP }, false);
    expect(await setUpdateCheck(deps, { user: root, ip: IP }, false)).toEqual({ changed: false });
    expect(await events()).toHaveLength(1);
  });

  it("is root's alone: anyone else is refused, and nothing is written", async () => {
    const moderator: CurrentUser = { ...root, id: "not-root", role: "user" };
    await expect(setUpdateCheck(deps, { user: moderator, ip: IP }, false)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateCheckSettings(deps, { user: moderator, ip: IP })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(setUpdateCheck(deps, { user: null, ip: null }, false)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect((await updateCheckState(deps)).enabled).toBe(true);
    expect(await events()).toEqual([]);
  });

  it("allows Check now once a minute: a check a minute ago or more is not too recent", () => {
    const now = new Date("2026-11-01T12:01:00.000Z");
    expect(checkedTooRecently(null, now)).toBe(false);
    expect(checkedTooRecently(new Date(now.getTime() - 59_999), now)).toBe(true);
    expect(checkedTooRecently(new Date(now.getTime() - 60_000), now)).toBe(false);
  });

  it("counts only a stable release newer than the running version as an update", () => {
    expect(isNewerRelease("0.9.0", "0.8.2")).toBe(true);
    expect(isNewerRelease("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerRelease("0.8.2", "0.8.2")).toBe(false);
    expect(isNewerRelease("0.8.1", "0.8.2")).toBe(false);
    expect(isNewerRelease("1.0.0", "1.0.0-rc.1")).toBe(true);
    expect(isNewerRelease("1.0.0-rc.2", "1.0.0-rc.1")).toBe(false);
    expect(isNewerRelease(null, "0.8.2")).toBe(false);
  });
});
