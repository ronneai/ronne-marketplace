import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { foreignKeys } from "../../../db/testing/foreign-keys";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import {
  InvalidNoticeError,
  InvalidRetentionError,
  InvalidTwoFactorPolicyError,
  InvalidUsageMinimumError,
  InvalidUsagePolicyError,
} from "../exceptions/errors";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import {
  instanceSettings,
  notice,
  retentionPolicy,
  type SettingsDeps,
  setNotice,
  setRetention,
  setTwoFactorPolicy,
  setUsageMinimum,
  setUsagePolicy,
  twoFactorPolicy,
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
      twoFactorPolicy: "optional",
      passwordSignInPolicy: "everyone",
      retention: { ipDays: 90, sessionsDays: 90, feedbackDays: 365 },
      notice: {
        message: "",
        tone: "info",
        shown: false,
        revision: 0,
        changedAt: null,
        changedBy: null,
        changedByName: null,
      },
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
      twoFactorPolicy: "optional",
      passwordSignInPolicy: "everyone",
      retention: { ipDays: 90, sessionsDays: 90, feedbackDays: 365 },
      notice: expect.objectContaining({ shown: false, changedByName: null }),
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

describe("the two-factor requirement (105)", () => {
  it("is optional until root sets it; a change is audited with the old and new value", async () => {
    expect(await twoFactorPolicy(deps)).toBe("optional");
    expect(await setTwoFactorPolicy(deps, { user: root, ip: IP }, "reviewers")).toEqual({
      changed: true,
    });
    expect(await twoFactorPolicy(deps)).toBe("reviewers");
    expect(await setTwoFactorPolicy(deps, { user: root, ip: IP }, "reviewers")).toEqual({
      changed: false,
    });
    await setTwoFactorPolicy(deps, { user: root, ip: IP }, "everyone");
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.two_factor_policy",
    );
    expect(events.map((e) => [e.actorId, e.ipAddress, e.metadata])).toEqual([
      [root.id, IP, { from: "reviewers", to: "everyone" }],
      [root.id, IP, { from: "optional", to: "reviewers" }],
    ]);
  });

  it("is changed only by root, and only to a known requirement", async () => {
    const someone: CurrentUser = {
      id: "x",
      email: "x@example.com",
      name: "X",
      role: "user",
      workspaces: {},
    };
    await expect(setTwoFactorPolicy(deps, { user: someone, ip: null }, "everyone")).rejects.toThrow(
      ForbiddenError,
    );
    await expect(setTwoFactorPolicy(deps, { user: null, ip: null }, "everyone")).rejects.toThrow(
      ForbiddenError,
    );
    for (const value of ["required", "", null, 1, "Everyone"])
      await expect(setTwoFactorPolicy(deps, { user: root, ip: null }, value)).rejects.toThrow(
        InvalidTwoFactorPolicyError,
      );
    expect(await twoFactorPolicy(deps)).toBe("optional");
  });

  it("reads a value it doesn't know as optional", async () => {
    await deps.repo.set("two_factor_policy", "nonsense", null, at);
    expect(await twoFactorPolicy(deps)).toBe("optional");
  });
});

describe("the retention (102)", () => {
  it("is 90 days each until root sets them; a change is audited with the old and new values", async () => {
    expect(await retentionPolicy(deps)).toEqual({
      ipDays: 90,
      sessionsDays: 90,
      feedbackDays: 365,
    });
    expect((await instanceSettings(deps, { user: root, ip: null })).retention).toEqual({
      ipDays: 90,
      sessionsDays: 90,
      feedbackDays: 365,
    });
    expect(
      await setRetention(deps, { user: root, ip: IP }, { ipDays: "30", sessionsDays: 90 }),
    ).toEqual({ changed: true });
    expect(await retentionPolicy(deps)).toEqual({
      ipDays: 30,
      sessionsDays: 90,
      feedbackDays: 365,
    });
    expect(
      await setRetention(deps, { user: root, ip: IP }, { ipDays: " 30 ", sessionsDays: "90" }),
    ).toEqual({ changed: false });
    await setRetention(deps, { user: root, ip: IP }, { ipDays: 30, sessionsDays: 7 });
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.retention",
    );
    expect(events.map((e) => [e.actorId, e.ipAddress, e.targetType, e.metadata])).toEqual([
      [
        root.id,
        IP,
        "instance",
        {
          from: { ipDays: 30, sessionsDays: 90, feedbackDays: 365 },
          to: { ipDays: 30, sessionsDays: 7, feedbackDays: 365 },
        },
      ],
      [
        root.id,
        IP,
        "instance",
        {
          from: { ipDays: 90, sessionsDays: 90, feedbackDays: 365 },
          to: { ipDays: 30, sessionsDays: 90, feedbackDays: 365 },
        },
      ],
    ]);
  });

  it("keeps handled feedback 365 days until root says otherwise, and audits that change too (127)", async () => {
    const actor = { user: root, ip: IP };
    expect((await retentionPolicy(deps)).feedbackDays).toBe(365);
    // Left out, it stays; given, it changes.
    await setRetention(deps, actor, { ipDays: 90, sessionsDays: 90 });
    expect((await retentionPolicy(deps)).feedbackDays).toBe(365);
    expect(
      await setRetention(deps, actor, { ipDays: 90, sessionsDays: 90, feedbackDays: "30" }),
    ).toEqual({
      changed: true,
    });
    expect((await retentionPolicy(deps)).feedbackDays).toBe(30);
    expect(
      await setRetention(deps, actor, { ipDays: 90, sessionsDays: 90, feedbackDays: 30 }),
    ).toEqual({
      changed: false,
    });
    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.retention",
    );
    expect(event?.metadata).toEqual({
      from: { ipDays: 90, sessionsDays: 90, feedbackDays: 365 },
      to: { ipDays: 90, sessionsDays: 90, feedbackDays: 30 },
    });
    for (const bad of [0, 3651, "x", "", null, 1.5])
      await expect(
        setRetention(deps, actor, { ipDays: 90, sessionsDays: 90, feedbackDays: bad }),
      ).rejects.toThrow(/Handled feedback is kept|Handled feedback are kept/);
    expect((await retentionPolicy(deps)).feedbackDays).toBe(30);
  });

  it("takes whole numbers of days from 1 to 3,650, and saves nothing when one is wrong", async () => {
    const actor = { user: root, ip: null };
    for (const [ipDays, sessionsDays] of [
      [1, 3650],
      [3650, 1],
      ["00001", "03650"],
      ["00000000000000000002", "3650"],
    ])
      expect(await setRetention(deps, actor, { ipDays, sessionsDays })).toEqual({ changed: true });
    expect(await retentionPolicy(deps)).toEqual({
      ipDays: 2,
      sessionsDays: 3650,
      feedbackDays: 365,
    });
    for (const bad of [
      0,
      "0000",
      3651,
      -1,
      1.5,
      "1.0",
      "",
      " ",
      null,
      undefined,
      "30 days",
      "1e2",
      "+5",
      "000000000000000000001",
      `1${"0".repeat(100_000)}`,
      true,
    ])
      await expect(setRetention(deps, actor, { ipDays: bad, sessionsDays: 10 })).rejects.toThrow(
        InvalidRetentionError,
      );
    for (const bad of [0, 3651, "x"])
      await expect(setRetention(deps, actor, { ipDays: 10, sessionsDays: bad })).rejects.toThrow(
        /Expired sessions are kept/,
      );
    await expect(setRetention(deps, actor, { ipDays: 0, sessionsDays: 10 })).rejects.toThrow(
      /IP addresses are kept/,
    );
    expect(await retentionPolicy(deps)).toEqual({
      ipDays: 2,
      sessionsDays: 3650,
      feedbackDays: 365,
    });
    expect(
      (await listAuditEvents(t.db, t.dialect, {})).events.filter(
        (e) => e.action === "settings.retention",
      ),
    ).toHaveLength(4);
  });

  it("is read and changed by root only", async () => {
    const someone: CurrentUser = {
      id: "x",
      email: "x@example.com",
      name: "X",
      role: "user",
      workspaces: {},
    };
    for (const user of [someone, null]) {
      await expect(
        setRetention(deps, { user, ip: null }, { ipDays: 10, sessionsDays: 10 }),
      ).rejects.toThrow(ForbiddenError);
      await expect(instanceSettings(deps, { user, ip: null })).rejects.toThrow(ForbiddenError);
    }
    expect(await retentionPolicy(deps)).toEqual({
      ipDays: 90,
      sessionsDays: 90,
      feedbackDays: 365,
    });
  });

  it("reads a stored value outside the range as the default", async () => {
    await deps.repo.set("retention_ip_days", "0", null, at);
    await deps.repo.set("retention_sessions_days", "nonsense", null, at);
    await deps.repo.set("retention_feedback_days", "99999", null, at);
    expect(await retentionPolicy(deps)).toEqual({
      ipDays: 90,
      sessionsDays: 90,
      feedbackDays: 365,
    });
  });
});

describe("the instance notice (124)", () => {
  const form = {
    message: "The demo's data is reset on Friday.",
    tone: "warning",
    shown: true,
  };
  const events = async () =>
    (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.notice",
    );

  it("is hidden on a new instance, then saved, hidden and shown again, keeping the text", async () => {
    expect(await notice(deps)).toMatchObject({ shown: false, revision: 0, message: "" });
    expect(await setNotice(deps, { user: root, ip: IP }, form)).toEqual({ changed: true });
    expect(await notice(deps)).toEqual({
      message: "The demo's data is reset on Friday.",
      tone: "warning",
      shown: true,
      revision: 1,
      changedAt: at,
      changedBy: root.id,
    });
    // Hiding keeps the text and the revision: someone who dismissed it needn't see it twice.
    await setNotice(deps, { user: root, ip: IP }, { ...form, shown: false });
    expect(await notice(deps)).toMatchObject({ shown: false, revision: 1, message: form.message });
    await setNotice(deps, { user: root, ip: IP }, form);
    expect(await notice(deps)).toMatchObject({ shown: true, revision: 1 });
    // The words (links included) or the tone raise it.
    await setNotice(deps, { user: root, ip: IP }, { ...form, message: "Maintenance at noon." });
    await setNotice(
      deps,
      { user: root, ip: IP },
      { ...form, message: "Maintenance at noon.", tone: "info" },
    );
    await setNotice(
      deps,
      { user: root, ip: IP },
      {
        ...form,
        message: "Maintenance at noon, see the [status page](https://status.example.com/).",
        tone: "info",
      },
    );
    expect(await notice(deps)).toMatchObject({
      revision: 4,
      message: "Maintenance at noon, see the [status page](https://status.example.com/).",
    });
    expect(await instanceSettings(deps, { user: root, ip: null })).toMatchObject({
      notice: { revision: 4, shown: true, changedByName: "Root" },
    });
  });

  it("saves nothing, and audits nothing, when nothing changed", async () => {
    await setNotice(deps, { user: root, ip: IP }, form);
    expect(
      await setNotice(deps, { user: root, ip: IP }, { ...form, message: `  ${form.message} ` }),
    ).toEqual({
      changed: false,
    });
    expect(await events()).toHaveLength(1);
  });

  it("audits the tone and whether it is shown, and never the text", async () => {
    await setNotice(
      deps,
      { user: root, ip: IP },
      { ...form, message: "SECRET-WORDS [SECRET-LABEL](/secret-path)" },
    );
    await setNotice(
      deps,
      { user: root, ip: IP },
      { ...form, message: "SECRET-WORDS [SECRET-LABEL](/secret-path)", shown: false },
    );
    const found = await events();
    expect(found.map((e) => [e.actorId, e.ipAddress, e.targetType, e.metadata])).toEqual([
      [
        root.id,
        IP,
        "instance",
        {
          from: { tone: "warning", shown: true },
          to: { tone: "warning", shown: false },
          revision: 1,
        },
      ],
      [
        root.id,
        IP,
        "instance",
        { from: { tone: "info", shown: false }, to: { tone: "warning", shown: true }, revision: 1 },
      ],
    ]);
    for (const secret of ["SECRET-WORDS", "SECRET-LABEL", "secret-path"])
      expect(JSON.stringify(found)).not.toContain(secret);
  });

  it("refuses what the form must not hold, saving nothing", async () => {
    const refused = async (change: Partial<typeof form>) =>
      setNotice(deps, { user: root, ip: IP }, { ...form, ...change }).catch((e) => e);
    expect(await refused({ message: "" })).toBeInstanceOf(InvalidNoticeError);
    expect(await refused({ message: "x".repeat(501) })).toMatchObject({ field: "message" });
    expect(await refused({ message: "[](/x)" })).toMatchObject({
      field: "message",
      problem: "link_label",
    });
    expect(await refused({ message: "[Go](javascript:alert)" })).toMatchObject({
      field: "message",
      problem: "link_address",
    });
    expect(await refused({ message: "[a](/1)[b](/2)[c](/3)[d](/4)" })).toMatchObject({
      problem: "too_many_links",
    });
    expect(await refused({ tone: "danger" })).toMatchObject({ field: "tone" });
    expect(await notice(deps)).toMatchObject({ revision: 0, shown: false });
    expect(await events()).toHaveLength(0);
  });

  it("is for root alone", async () => {
    const moderator: CurrentUser = {
      ...root,
      id: "00000000-0000-4000-8000-000000000009",
      role: "user",
    };
    await expect(setNotice(deps, { user: moderator, ip: null }, form)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(setNotice(deps, { user: null, ip: null }, form)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(instanceSettings(deps, { user: moderator, ip: null })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("reads a hand-edited value as hidden", async () => {
    await deps.repo.set("notice", "{not json", null, at);
    expect(await notice(deps)).toMatchObject({ shown: false, revision: 0 });
    await deps.repo.set(
      "notice",
      JSON.stringify({
        message: "x",
        tone: "info",
        shown: true,
        revision: 2,
        link: { label: "a", href: "javascript:x" },
        extra: "ignored",
      }),
      null,
      at,
    );
    // The old separate link is not read: the message is.
    expect(await notice(deps)).toEqual(
      expect.objectContaining({ message: "x", shown: true, revision: 2 }),
    );
    expect(await notice(deps)).not.toHaveProperty("link");
  });
});
