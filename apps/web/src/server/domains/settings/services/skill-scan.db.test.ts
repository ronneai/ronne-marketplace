import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import {
  InvalidSkillScanAnalysisError,
  InvalidSkillScanBlockScoreError,
  InvalidSkillScanTypesError,
  SkillScanNoProviderError,
  SkillScanNotConfiguredError,
} from "../exceptions/errors";
import {
  SKILL_SCAN_BLOCK_SCORE_KEY,
  SKILL_SCAN_LAST_ERROR_KEY,
  SKILL_SCAN_LAST_VERSION_KEY,
  type SkillScanner,
} from "../models/skill-scan-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import {
  type SettingsDeps,
  setSkillScanPolicy,
  skillScanBlockScore,
  skillScanPolicy,
  skillScanSettings,
} from "./settings";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let deps: SettingsDeps;
const at = new Date("2026-10-28T12:00:00.000Z");
const IP = "203.0.113.7";

const none: SkillScanner = { configured: false, provider: null };
const command: SkillScanner = { configured: true, provider: null };
const ollama: SkillScanner = {
  configured: true,
  provider: { name: "ollama", model: "qwen3-coder:30b", host: "10.0.0.5:11434" },
};

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

const asRoot = { user: () => root, ip: IP };
const set = (
  value: { enabled: unknown; types: unknown; analysis: unknown; blockScore?: unknown },
  scanner = command,
) => setSkillScanPolicy(deps, { user: asRoot.user(), ip: IP }, value, scanner);

describe("the security scan's settings (135)", () => {
  it("shows the defaults, what the operator set up, and what the scanner said last", async () => {
    expect(await skillScanSettings(deps, { user: root, ip: null }, ollama)).toEqual({
      policy: { enabled: false, types: ["skill"], analysis: "static" },
      blockScore: null,
      scanner: ollama,
      lastVersion: null,
      lastError: null,
      runsStatic: false,
    });
    await deps.repo.set(SKILL_SCAN_LAST_VERSION_KEY, "2.13.2", null, at);
    await deps.repo.set(SKILL_SCAN_LAST_ERROR_KEY, "timeout", null, at);
    expect(await skillScanSettings(deps, { user: root, ip: null }, command)).toMatchObject({
      lastVersion: "2.13.2",
      lastError: "timeout",
    });
  });

  it("is root's alone, to see and to change", async () => {
    const ana: CurrentUser = {
      id: "x",
      email: "ana@example.com",
      name: "Ana",
      role: "user",
      workspaces: {},
    };
    await expect(skillScanSettings(deps, { user: ana, ip: null }, command)).rejects.toThrow(
      ForbiddenError,
    );
    // The scanner service is asked only once root is known to be asking (156).
    let asked = 0;
    const services = async () => {
      asked++;
      return [];
    };
    await expect(
      skillScanSettings(deps, { user: ana, ip: null }, command, services),
    ).rejects.toThrow(ForbiddenError);
    expect(asked).toBe(0);
    expect(
      (await skillScanSettings(deps, { user: root, ip: null }, command, services)).scanner,
    ).toMatchObject({ services: [] });
    expect(asked).toBe(1);
    await expect(
      setSkillScanPolicy(
        deps,
        { user: ana, ip: IP },
        { enabled: "on", types: ["skill"], analysis: "static" },
        command,
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      setSkillScanPolicy(
        deps,
        { user: null, ip: IP },
        { enabled: "on", types: ["skill"], analysis: "static" },
        command,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("saves the policy and audits the change with what it was", async () => {
    expect(
      await set({ enabled: "on", types: ["agent", "skill", "nope"], analysis: "static" }),
    ).toEqual({
      changed: true,
    });
    expect(await skillScanPolicy(deps)).toEqual({
      enabled: true,
      types: ["skill", "agent"],
      analysis: "static",
    });
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.skill_scan",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: root.id,
      ipAddress: IP,
      metadata: {
        from: { enabled: false, types: ["skill"], analysis: "static" },
        to: { enabled: true, types: ["skill", "agent"], analysis: "static" },
      },
    });
  });

  it("records nothing when nothing changed", async () => {
    await set({ enabled: "on", types: ["skill"], analysis: "static" });
    expect(await set({ enabled: "on", types: ["skill"], analysis: "static" })).toEqual({
      changed: false,
    });
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.skill_scan",
    );
    expect(events).toHaveLength(1);
  });

  it("refuses to turn scanning on without the operator's command, but lets root turn it off", async () => {
    await expect(
      set({ enabled: "on", types: ["skill"], analysis: "static" }, none),
    ).rejects.toThrow(SkillScanNotConfiguredError);
    await set({ enabled: "on", types: ["skill"], analysis: "static" });
    // The command went while scanning is on: root can still change the types, and turn it off.
    expect(
      await set({ enabled: "on", types: ["skill", "agent"], analysis: "static" }, none),
    ).toEqual({
      changed: true,
    });
    expect(await set({ enabled: undefined, types: ["skill"], analysis: "static" }, none)).toEqual({
      changed: true,
    });
    await expect(
      set({ enabled: "on", types: ["skill"], analysis: "static" }, none),
    ).rejects.toThrow(SkillScanNotConfiguredError);
    expect((await skillScanPolicy(deps)).enabled).toBe(false);
  });

  it("refuses semantic analysis without a provider, and allows it with one", async () => {
    await expect(
      set({ enabled: "on", types: ["skill"], analysis: "semantic" }, command),
    ).rejects.toThrow(SkillScanNoProviderError);
    await set({ enabled: "on", types: ["skill"], analysis: "semantic" }, ollama);
    expect((await skillScanPolicy(deps)).analysis).toBe("semantic");
    // The provider went: the page says scans run static, and root can still turn scanning off.
    expect((await skillScanSettings(deps, { user: root, ip: null }, command)).runsStatic).toBe(
      true,
    );
    expect(
      await set({ enabled: undefined, types: ["skill"], analysis: "semantic" }, command),
    ).toEqual({ changed: true });
    expect((await skillScanPolicy(deps)).enabled).toBe(false);
  });

  it.each([
    [{ enabled: "on", types: [], analysis: "static" }, InvalidSkillScanTypesError],
    [{ enabled: "on", types: ["plugin"], analysis: "static" }, InvalidSkillScanTypesError],
    [{ enabled: "on", types: "skill", analysis: "static" }, InvalidSkillScanTypesError],
    [{ enabled: "on", types: ["skill"], analysis: "llm" }, InvalidSkillScanAnalysisError],
  ])("refuses %j", async (value, error) => {
    await expect(set(value)).rejects.toThrow(error);
  });
});

describe("the score that blocks approval (137)", () => {
  const audits = async () =>
    (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "settings.skill_scan",
    );
  const policy = { enabled: "on", types: ["skill"], analysis: "static" };

  it("saves a threshold, keeps it when the form leaves it out, and clears it when empty", async () => {
    await set({ ...policy, blockScore: "70" });
    expect(await skillScanBlockScore(deps)).toBe(70);
    expect((await skillScanSettings(deps, { user: root, ip: null }, command)).blockScore).toBe(70);
    await set({ ...policy, analysis: "static" });
    expect(await skillScanBlockScore(deps)).toBe(70);
    await set({ ...policy, blockScore: " " });
    expect(await skillScanBlockScore(deps)).toBeNull();
  });

  it("audits a change of the threshold alone, with what it was", async () => {
    await set(policy);
    expect(await set({ ...policy, blockScore: "60" })).toEqual({ changed: true });
    expect(await set({ ...policy, blockScore: "60" })).toEqual({ changed: false });
    const events = await audits();
    expect(events).toHaveLength(2);
    expect(events[0]?.metadata).toMatchObject({ blockScore: { from: null, to: 60 } });
    expect(events[1]?.metadata).not.toHaveProperty("blockScore");
  });

  it("refuses anything but a whole number from 1 to 100, and changes nothing", async () => {
    for (const blockScore of ["0", "101", "7.5", "1e2", "abc", 50])
      await expect(set({ ...policy, blockScore })).rejects.toThrow(InvalidSkillScanBlockScoreError);
    expect(await skillScanBlockScore(deps)).toBeNull();
    expect(await audits()).toHaveLength(0);
  });

  it("reads a hand-edited threshold that isn't one as none", async () => {
    await deps.repo.set(SKILL_SCAN_BLOCK_SCORE_KEY, "lots", null, at);
    expect(await skillScanBlockScore(deps)).toBeNull();
  });
});
