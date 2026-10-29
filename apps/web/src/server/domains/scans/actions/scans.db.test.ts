import type { SkillScanResult } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  SKILL_SCAN_ENABLED_KEY,
  SKILL_SCAN_LAST_ERROR_KEY,
  SKILL_SCAN_LAST_VERSION_KEY,
  SKILL_SCAN_TYPES_KEY,
} from "../../settings/models/skill-scan-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import {
  submitDraft,
  submitManyDrafts,
  withdrawSubmission,
} from "../../submissions/actions/submissions";
import type { ScanFile, ScanOutcome, ScanProvider, SkillScanner } from "../models/scan";
import { kyselyContentScanRepository } from "../repositories/kysely-content-scan-repository";
import { commandSkillScanner } from "../services/command-scanner";
import { MAX_SCAN_ATTEMPTS, runQueuedScans } from "../services/scans";
import { requestScan, reviewScan, sendingWithScans } from "./scans";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAna: Headers;
let ana: CurrentUser;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  // A scanner command, so sending can queue; jobs off, so nothing starts a real run.
  vi.stubEnv("RONNE_SKILL_SCANNER", '["/opt/skillspector/venv/bin/skillspector"]');
  vi.stubEnv("RONNE_JOBS", "off");
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  asRoot = await signedIn("root@example.com");
  await adminCreateUser(
    asRoot,
    { email: "ana@example.com", name: "Ana", role: "user", password },
    app,
  );
  asAna = await signedIn("ana@example.com");
  ana = (await getCurrentUser(asAna, app)) as CurrentUser;
  await createScope(asRoot, { name: "team", description: "A team." }, app);
  await createScope(
    asAna,
    { name: "tools", description: "Ana's tools.", workspaceId: ana.personal ?? "" },
    app,
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

const setting = (key: string, value: string) =>
  kyselySettingsRepository(t.db, t.dialect).set(key, value, null, new Date());
const turnOn = async (types = "rule") => {
  await setting(SKILL_SCAN_ENABLED_KEY, "true");
  await setting(SKILL_SCAN_TYPES_KEY, types);
};

/** A rule draft by Ana, ready to submit. */
const drafted = async (scope = "team", name = "style") => {
  const draft = await createDraft(asAna, { scope, name, type: "rule" }, app);
  const full = scope.startsWith("@") ? `${scope}/${name}` : `@${scope}/${name}`;
  await saveDraftFiles(
    asAna,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${full}"\ntype: rule\ndescription: A rule.\nrule:\n  body: rule.md\n  activation: always\n`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
        {
          path: "rule.md",
          encoding: "utf8",
          content: "Be kind.\n",
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "rule.md")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft;
};

const scans = () =>
  t.db
    .selectFrom("content_scans")
    .innerJoin("submission_revisions", "submission_revisions.id", "content_scans.revision_id")
    .select(["content_scans.id", "content_scans.status", "submission_revisions.submission_id"])
    .execute();

const repo = () => kyselyContentScanRepository(t.db, t.dialect);

const result = (overrides: Partial<SkillScanResult> = {}): SkillScanResult => ({
  scanner: "skillspector",
  scannerVersion: "2.13.2",
  analysis: "static",
  llmUnavailable: false,
  score: 75,
  severity: "HIGH",
  recommendation: "DO_NOT_INSTALL",
  complete: true,
  findings: [
    {
      rule: "P2",
      category: "Prompt Injection",
      severity: "HIGH",
      confidence: 0.9,
      title: "Hidden Instructions",
      explanation: null,
      remediation: null,
      file: "rule.md",
      line: 1,
    },
  ],
  findingsOmitted: 0,
  ...overrides,
});

/** A scanner that answers `outcome` and records what it was given. */
const fakeScanner = (outcome: ScanOutcome | (() => Promise<ScanOutcome>)) => {
  const calls: { files: readonly ScanFile[]; semantic: boolean }[] = [];
  const scanner: SkillScanner = {
    scan: async (files, options) => {
      calls.push({ files, semantic: options?.semantic === true });
      return typeof outcome === "function" ? outcome() : outcome;
    },
  };
  return { scanner, calls };
};

const run = (
  scanner: SkillScanner,
  extra: { semantic?: boolean; provider?: ScanProvider | null } = {},
) =>
  runQueuedScans({
    repo: repo(),
    scanner,
    semantic: extra.semantic ?? false,
    provider: extra.provider ?? null,
    timeoutSeconds: 300,
  });

describe("queuing a scan when a submission is sent (135)", () => {
  it("queues nothing while scanning is off, even for a type root picked", async () => {
    await setting(SKILL_SCAN_TYPES_KEY, "rule");
    await submitDraft(asAna, (await drafted()).id, app);
    await setting(SKILL_SCAN_ENABLED_KEY, "false");
    await submitDraft(asAna, (await drafted("team", "other")).id, app);
    expect(await scans()).toEqual([]);
  });

  it("queues nothing without a scanner command, even with scanning on", async () => {
    vi.stubEnv("RONNE_SKILL_SCANNER", "");
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    expect(await scans()).toEqual([]);
  });

  it("starts the scan job after a send that could have queued, and not otherwise", async () => {
    let kicks = 0;
    const kick = () => {
      kicks++;
    };
    await sendingWithScans(app, async () => "sent", kick);
    expect(kicks).toBe(0);
    await turnOn();
    expect(await sendingWithScans(app, async (types) => types, kick)).toEqual(["rule"]);
    expect(kicks).toBe(1);
  });

  it("queues one scan of the new revision, for a scanned type", async () => {
    await turnOn();
    const draft = await drafted();
    await submitDraft(asAna, draft.id, app);
    expect(await scans()).toEqual([
      { id: expect.any(String), status: "queued", submission_id: draft.id },
    ]);
  });

  it("leaves out types root didn't pick", async () => {
    await turnOn("skill");
    await submitDraft(asAna, (await drafted()).id, app);
    expect(await scans()).toEqual([]);
  });

  it("queues from the bulk submit too", async () => {
    await turnOn();
    const one = await drafted("team", "one");
    const two = await drafted("team", "two");
    await submitManyDrafts(asAna, { ids: [one.id, two.id] }, app);
    expect((await scans()).map((s) => s.submission_id).sort()).toEqual([one.id, two.id].sort());
  });

  it("queues in a personal workspace, where the submission is approved as it's sent (114)", async () => {
    await turnOn();
    const mine = (
      await t.db
        .selectFrom("workspaces")
        .select("name")
        .where("id", "=", ana.personal ?? "")
        .executeTakeFirstOrThrow()
    ).name;
    const draft = await drafted(`@${mine}/tools`, "own");
    const sent = await submitDraft(asAna, draft.id, app);
    expect(sent.status).toBe("approved");
    expect(await scans()).toEqual([
      { id: expect.any(String), status: "queued", submission_id: draft.id },
    ]);
  });
});

describe("running the queue (135)", () => {
  it("scans the revision's files and records a done scan and the scanner's version", async () => {
    await turnOn();
    const draft = await drafted();
    await submitDraft(asAna, draft.id, app);
    const { scanner, calls } = fakeScanner({ ok: true, result: result() });

    expect(await run(scanner)).toEqual({ scanned: 1, failed: 0, requeued: 0, skipped: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.files.map((f) => f.path)).toEqual(["ronne.yaml", "rule.md"]);
    expect(new TextDecoder().decode(calls[0]?.files[1]?.bytes)).toBe("Be kind.\n");
    expect(calls[0]?.semantic).toBe(false);

    const [scan] = await scans();
    const latest = await repo().latestFor([
      (await t.db.selectFrom("content_scans").select("revision_id").executeTakeFirstOrThrow())
        .revision_id,
    ]);
    expect(scan?.status).toBe("done");
    expect([...latest.values()][0]).toMatchObject({
      status: "done",
      attempts: 1,
      result: result(),
      error: null,
    });
    const settings = kyselySettingsRepository(t.db, t.dialect);
    expect((await settings.get(SKILL_SCAN_LAST_VERSION_KEY))?.value).toBe("2.13.2");
    expect((await settings.get(SKILL_SCAN_LAST_ERROR_KEY))?.value).toBe("");
  });

  it("reads a scan stored before 137, whose findings kept no remediation, as having none", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    await run(fakeScanner({ ok: true, result: result() }).scanner);
    const old = result().findings.map(({ remediation: _, ...rest }) => rest);
    await t.db
      .updateTable("content_scans")
      .set({ findings: JSON.stringify(old) })
      .execute();
    const { revision_id } = await t.db
      .selectFrom("content_scans")
      .select("revision_id")
      .executeTakeFirstOrThrow();
    const scan = (await repo().latestFor([revision_id])).get(revision_id);
    expect(scan?.result?.findings).toEqual(result().findings);
    expect(scan?.result?.findings[0]?.remediation).toBeNull();
  });

  it("records a failure with its short reason", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    const { scanner } = fakeScanner({ ok: false, error: "timeout" });
    expect(await run(scanner)).toMatchObject({ scanned: 0, failed: 1 });
    const revisionId = (
      await t.db.selectFrom("content_scans").select("revision_id").executeTakeFirstOrThrow()
    ).revision_id;
    expect((await repo().latestFor([revisionId])).get(revisionId)).toMatchObject({
      status: "failed",
      error: "timeout",
      result: null,
    });
    expect(
      (await kyselySettingsRepository(t.db, t.dialect).get(SKILL_SCAN_LAST_ERROR_KEY))?.value,
    ).toBe("timeout");
  });

  it("asks for semantic only when root chose it and a provider is set up, and records the provider", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted("team", "one")).id, app);
    const provider: ScanProvider = {
      name: "ollama",
      model: "qwen3-coder:30b",
      host: "10.0.0.5:11434",
      variables: {},
    };
    const semantic = fakeScanner({ ok: true, result: result({ analysis: "semantic" }) });
    await run(semantic.scanner, { semantic: true, provider });
    expect(semantic.calls[0]?.semantic).toBe(true);
    const row = await t.db.selectFrom("content_scans").selectAll().executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      analysis: "semantic",
      llm_provider: "ollama",
      llm_model: "qwen3-coder:30b",
    });

    await submitDraft(asAna, (await drafted("team", "two")).id, app);
    const noProvider = fakeScanner({ ok: true, result: result() });
    await run(noProvider.scanner, { semantic: true, provider: null });
    expect(noProvider.calls[0]?.semantic).toBe(false);
  });

  it("puts a stuck scan back once, then fails it", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    const stuck = async (attempts: number) =>
      t.db
        .updateTable("content_scans")
        .set({
          status: "running",
          attempts,
          started_at: toDbDate(new Date(Date.now() - 3_600_000), t.dialect),
        })
        .execute();
    await stuck(1);
    // Requeued, then taken again: give it a scanner that answers so the run ends.
    const answers = fakeScanner({ ok: true, result: result() });
    expect(await run(answers.scanner)).toMatchObject({ requeued: 1, scanned: 1 });

    await stuck(MAX_SCAN_ATTEMPTS);
    expect(await run(answers.scanner)).toMatchObject({ requeued: 0, failed: 1, scanned: 0 });
    const row = await t.db
      .selectFrom("content_scans")
      .select(["status", "error"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: "failed", error: "timeout" });
  });

  it("renews the job's lease between scans, however short they are", async () => {
    await turnOn();
    for (const name of ["one", "two", "three"])
      await submitDraft(asAna, (await drafted("team", name)).id, app);
    let renews = 0;
    const { scanner } = fakeScanner({ ok: true, result: result() });
    await runQueuedScans({
      repo: repo(),
      scanner,
      semantic: false,
      provider: null,
      timeoutSeconds: 300,
      renew: async () => {
        renews++;
      },
    });
    // Before the second and the third, and before the look that finds the queue empty.
    expect(renews).toBe(3);
  });

  it("takes the oldest queued scan first, one at a time", async () => {
    await turnOn();
    const names = ["first", "second", "third"];
    for (const name of names) await submitDraft(asAna, (await drafted("team", name)).id, app);
    // The last one sent waited longest.
    await t.db
      .updateTable("content_scans")
      .set({ queued_at: toDbDate(new Date(Date.now() - 86_400_000), t.dialect) })
      .where(
        "revision_id",
        "in",
        t.db
          .selectFrom("submission_revisions")
          .innerJoin("submissions", "submissions.id", "submission_revisions.submission_id")
          .select("submission_revisions.id")
          .where("submissions.name", "=", "third"),
      )
      .execute();
    let inFlight = 0;
    let most = 0;
    const order: string[] = [];
    const scanner: SkillScanner = {
      scan: async (scanned) => {
        inFlight++;
        most = Math.max(most, inFlight);
        const manifest = new TextDecoder().decode(
          scanned.find((f) => f.path === "ronne.yaml")?.bytes,
        );
        order.push(/name: "@team\/(\w+)"/.exec(manifest)?.[1] ?? "?");
        await new Promise((done) => setTimeout(done, 5));
        inFlight--;
        return { ok: true, result: result() };
      },
    };
    await run(scanner);
    expect(order).toEqual(["third", "first", "second"]);
    expect(most).toBe(1);
  });

  it("drops, without scanning, a scan whose submission was withdrawn (archived) while it waited", async () => {
    await turnOn();
    const draft = await drafted();
    await submitDraft(asAna, draft.id, app);
    await withdrawSubmission(asAna, draft.id, app);
    const { scanner, calls } = fakeScanner({ ok: true, result: result() });
    expect(await run(scanner)).toMatchObject({ scanned: 0, skipped: 1 });
    expect(calls).toEqual([]);
    expect(await scans()).toEqual([]);
  });

  it("fails waiting scans `not configured` once the operator removed the command", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    expect(await run(commandSkillScanner({ command: null }))).toMatchObject({ failed: 1 });
    const row = await t.db
      .selectFrom("content_scans")
      .select(["status", "error"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: "failed", error: "not configured" });
    expect(
      (await kyselySettingsRepository(t.db, t.dialect).get(SKILL_SCAN_LAST_ERROR_KEY))?.value,
    ).toBe("not configured");
  });

  it("drops a scan whose submission was deleted while it waited", async () => {
    await turnOn();
    const draft = await drafted();
    await submitDraft(asAna, draft.id, app);
    await withdrawSubmission(asAna, draft.id, app, "delete");
    const { scanner, calls } = fakeScanner({ ok: true, result: result() });
    expect(await run(scanner)).toMatchObject({ scanned: 0 });
    expect(calls).toEqual([]);
    expect(await scans()).toEqual([]);
  });
});

describe("root asking for a scan (135)", () => {
  it("queues the revision for root only", async () => {
    await submitDraft(asAna, (await drafted()).id, app);
    const revisionId = (
      await t.db.selectFrom("submission_revisions").select("id").executeTakeFirstOrThrow()
    ).id;
    await expect(requestScan(asAna, revisionId, app)).rejects.toThrow();
    expect(await scans()).toEqual([]);
    expect(await requestScan(asRoot, revisionId, app)).toBe(true);
    expect(await scans()).toHaveLength(1);
    expect(await requestScan(asRoot, "01JZZZZZZZZZZZZZZZZZZZZZZZ", app)).toBe(false);
  });

  it("lets root ask again once the newest scan failed or finished, never while one waits (137)", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    const revisionId = (
      await t.db.selectFrom("submission_revisions").select("id").executeTakeFirstOrThrow()
    ).id;
    // One is waiting already.
    expect(await requestScan(asRoot, revisionId, app)).toBe(false);
    await run(fakeScanner({ ok: true, result: result() }).scanner);
    // It finished: since 137, root may scan it again.
    expect(await requestScan(asRoot, revisionId, app)).toBe(true);
    expect(await scans()).toHaveLength(2);
    // The new one waits.
    expect(await requestScan(asRoot, revisionId, app)).toBe(false);
    await t.db.updateTable("content_scans").set({ status: "running" }).execute();
    expect(await requestScan(asRoot, revisionId, app)).toBe(false);
    await t.db.updateTable("content_scans").set({ status: "failed", error: "timeout" }).execute();
    expect(await requestScan(asRoot, revisionId, app)).toBe(true);
    expect(await scans()).toHaveLength(3);
  });

  it("refuses root's request when no scanner command is set: nothing would take it", async () => {
    vi.stubEnv("RONNE_SKILL_SCANNER", "");
    await submitDraft(asAna, (await drafted()).id, app);
    const revisionId = (
      await t.db.selectFrom("submission_revisions").select("id").executeTakeFirstOrThrow()
    ).id;
    expect(await requestScan(asRoot, revisionId, app)).toBe(false);
    expect(await scans()).toEqual([]);
  });
});

describe("the review page's scan (135)", () => {
  it("gives the revision's newest scan, and lets only root ask again once none waits or runs", async () => {
    await turnOn();
    await submitDraft(asAna, (await drafted()).id, app);
    const revisionId = (
      await t.db.selectFrom("submission_revisions").select("id").executeTakeFirstOrThrow()
    ).id;
    expect(await reviewScan(asRoot, revisionId, app)).toMatchObject({
      scan: { status: "queued" },
      canRequest: false,
    });
    await t.db.updateTable("content_scans").set({ status: "done" }).execute();
    expect((await reviewScan(asRoot, revisionId, app)).canRequest).toBe(true);
    await t.db.updateTable("content_scans").set({ status: "running" }).execute();
    expect((await reviewScan(asRoot, revisionId, app)).canRequest).toBe(false);
    await t.db.updateTable("content_scans").set({ status: "failed", error: "timeout" }).execute();
    expect(await reviewScan(asRoot, revisionId, app)).toMatchObject({
      scan: { status: "failed", error: "timeout" },
      canRequest: true,
    });
    expect((await reviewScan(asAna, revisionId, app)).canRequest).toBe(false);
    vi.stubEnv("RONNE_SKILL_SCANNER", "");
    expect((await reviewScan(asRoot, revisionId, app)).canRequest).toBe(false);
    expect(await reviewScan(asRoot, null, app)).toEqual({ scan: null, canRequest: false });
  });
});
