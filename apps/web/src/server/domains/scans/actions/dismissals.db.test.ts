import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { kyselyUserDataRepository } from "../../identity/repositories/kysely-user-data-repository";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  SKILL_SCAN_ENABLED_KEY,
  SKILL_SCAN_TYPES_KEY,
} from "../../settings/models/skill-scan-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import {
  restoreSubmission,
  submitDraft,
  withdrawSubmission,
} from "../../submissions/actions/submissions";
import {
  DismissalReasonError,
  FindingDismissedError,
  FindingNotFoundError,
  NotScanReviewerError,
} from "../exceptions/errors";
import { dismissFinding, restoreFinding, reviewScan } from "./scans";

/**
 * False positives (137): a reviewer of the submission marks a finding of a finished scan with a
 * reason, and restores it; the author and outsiders can't; both are audited; the author sees them.
 */

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAuthor: Headers;
let asModerator: Headers;
let asOutsider: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  vi.stubEnv("RONNE_SKILL_SCANNER", '["/opt/skillspector/venv/bin/skillspector"]');
  vi.stubEnv("RONNE_JOBS", "off");
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, name: "Mo", role: "moderator" });
  await createTestUser(app, { email: "out@example.com", password });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  asOutsider = await signedIn("out@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
  const settings = kyselySettingsRepository(t.db, t.dialect);
  await settings.set(SKILL_SCAN_ENABLED_KEY, "true", null, new Date());
  await settings.set(SKILL_SCAN_TYPES_KEY, "rule", null, new Date());
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

const FINDINGS = [
  {
    rule: "P2",
    category: "Prompt Injection",
    severity: "HIGH",
    confidence: 0.9,
    title: "Hidden Instructions",
    explanation: "Hidden text.",
    remediation: "Remove it.",
    file: "rule.md",
    line: 3,
  },
  {
    rule: "SC2",
    category: "Supply Chain",
    severity: "MEDIUM",
    confidence: 0.7,
    title: "External Script",
    explanation: null,
    remediation: null,
    file: null,
    line: null,
  },
];

/** A rule sent for review by the author, its scan finished with two findings; the scan's id. */
const scanned = async (
  status: "done" | "failed" | "queued" = "done",
  author = asAuthor,
  name = "style",
) => {
  const draft = await createDraft(author, { scope: "team", name, type: "rule" }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    author,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace('description: ""', "description: Style."),
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(author, draft.id, app);
  if (status !== "queued")
    await t.db
      .updateTable("content_scans")
      .set(
        status === "done"
          ? {
              status: "done",
              score: 80,
              severity: "HIGH",
              recommendation: "CAUTION",
              scanner_version: "2.13.2",
              findings: JSON.stringify(FINDINGS),
            }
          : { status: "failed", error: "timeout" },
      )
      .where(
        "revision_id",
        "in",
        t.db.selectFrom("submission_revisions").select("id").where("submission_id", "=", draft.id),
      )
      .execute();
  const scan = await t.db
    .selectFrom("content_scans")
    .innerJoin("submission_revisions", "submission_revisions.id", "content_scans.revision_id")
    .select(["content_scans.id", "content_scans.revision_id"])
    .where("submission_revisions.submission_id", "=", draft.id)
    .executeTakeFirstOrThrow();
  return { scanId: scan.id, revisionId: scan.revision_id, submissionId: draft.id };
};

const audited = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("marking a finding a false positive (137)", () => {
  it("lets a moderator mark one with a reason and restore it, both audited", async () => {
    const { scanId, revisionId, submissionId } = await scanned();
    await dismissFinding(asModerator, { scanId, finding: 0, reason: "  Docs only.  " }, app);
    const view = await reviewScan(asModerator, revisionId, app);
    expect(view.canDismiss).toBe(true);
    expect(view.dismissals).toEqual([
      {
        finding: 0,
        reason: "Docs only.",
        by: { id: expect.any(String), name: "Mo" },
        at: expect.any(Date),
      },
    ]);
    const [dismissed] = await audited("scan.finding_dismissed");
    expect(dismissed).toMatchObject({
      targetType: "submission",
      targetId: submissionId,
      metadata: {
        name: "@team/style",
        revision: 1,
        finding: 0,
        rule: "P2",
        file: "rule.md",
        reason: "Docs only.",
      },
    });
    // Never the finding's text.
    expect(JSON.stringify(dismissed?.metadata)).not.toContain("Hidden");

    await restoreFinding(asModerator, { scanId, finding: 0 }, app);
    expect((await reviewScan(asModerator, revisionId, app)).dismissals).toEqual([]);
    const [restored] = await audited("scan.finding_restored");
    expect(restored?.metadata).toEqual({
      name: "@team/style",
      revision: 1,
      finding: 0,
      rule: "P2",
      file: "rule.md",
    });
  });

  it("lets root mark one, and leaves out the file of a finding that names none", async () => {
    const { scanId } = await scanned();
    await dismissFinding(asRoot, { scanId, finding: 1, reason: "Pinned upstream." }, app);
    const [event] = await audited("scan.finding_dismissed");
    expect(event?.metadata).not.toHaveProperty("file");
  });

  it("marks a finding once", async () => {
    const { scanId } = await scanned();
    await dismissFinding(asModerator, { scanId, finding: 0, reason: "Fine." }, app);
    await expect(
      dismissFinding(asRoot, { scanId, finding: 0, reason: "Also fine." }, app),
    ).rejects.toThrow(FindingDismissedError);
    expect(await audited("scan.finding_dismissed")).toHaveLength(1);
  });

  it("needs a reason that says something, and a short one", async () => {
    const { scanId } = await scanned();
    for (const reason of ["", "   ", "\u200b\u200e", "\u3164", "\u200d", "\u00a0\u2028", null, 42])
      await expect(
        dismissFinding(asModerator, { scanId, finding: 0, reason }, app),
      ).rejects.toMatchObject({ name: "DismissalReasonError", reason: "required" });
    await expect(
      dismissFinding(asModerator, { scanId, finding: 0, reason: "x".repeat(501) }, app),
    ).rejects.toThrow(DismissalReasonError);
    // A joiner stays, so an emoji sequence is kept whole.
    const family = "Fine 👨\u200d👩\u200d👧";
    await dismissFinding(asModerator, { scanId, finding: 0, reason: family }, app);
    const [kept] = await t.db.selectFrom("scan_dismissals").select("reason").execute();
    expect(kept?.reason).toBe(family);
    await dismissFinding(asModerator, { scanId, finding: 1, reason: "😀".repeat(500) }, app);
  });

  it("refuses a finding that isn't there, or a scan that didn't finish", async () => {
    const { scanId } = await scanned();
    for (const finding of [2, -1, 0.5, "0", null])
      await expect(
        dismissFinding(asModerator, { scanId, finding, reason: "No." }, app),
      ).rejects.toThrow(FindingNotFoundError);
    await expect(
      dismissFinding(
        asModerator,
        { scanId: "01JZZZZZZZZZZZZZZZZZZZZZZZ", finding: 0, reason: "No." },
        app,
      ),
    ).rejects.toThrow(FindingNotFoundError);
    await expect(restoreFinding(asModerator, { scanId, finding: 0 }, app)).rejects.toThrow(
      FindingNotFoundError,
    );
  });

  it("refuses a scan id that isn't one before it reaches the database", async () => {
    const { scanId } = await scanned();
    for (const bad of [1, true, {}, null, `${scanId}\u0000`, scanId.toLowerCase(), ""]) {
      await expect(
        dismissFinding(asModerator, { scanId: bad, finding: 0, reason: "No." }, app),
      ).rejects.toThrow(FindingNotFoundError);
      await expect(restoreFinding(asModerator, { scanId: bad, finding: 0 }, app)).rejects.toThrow(
        FindingNotFoundError,
      );
    }
    expect(await t.db.selectFrom("scan_dismissals").select("id").execute()).toEqual([]);
  });

  it("refuses a failed scan's findings", async () => {
    const { scanId } = await scanned("failed");
    await expect(
      dismissFinding(asModerator, { scanId, finding: 0, reason: "No." }, app),
    ).rejects.toThrow(FindingNotFoundError);
  });

  it("is never the author's, and an outsider can't even find it", async () => {
    const { scanId, revisionId } = await scanned();
    await expect(
      dismissFinding(asAuthor, { scanId, finding: 0, reason: "Mine is fine." }, app),
    ).rejects.toThrow(NotScanReviewerError);
    await expect(
      dismissFinding(asOutsider, { scanId, finding: 0, reason: "Hm." }, app),
    ).rejects.toThrow(FindingNotFoundError);
    await expect(
      dismissFinding(new Headers(), { scanId, finding: 0, reason: "Hm." }, app),
    ).rejects.toThrow(ForbiddenError);
    expect((await reviewScan(asAuthor, revisionId, app)).canDismiss).toBe(false);
  });
});

describe("racing marks and restores (137)", () => {
  it("gives every caller success or its own error, and keeps rows and audit in step", async () => {
    const { scanId } = await scanned();
    const allowed = new Set(["FindingDismissedError", "FindingNotFoundError"]);
    for (let round = 0; round < 8; round++) {
      const calls = [0, 1].flatMap((finding) => [
        dismissFinding(asModerator, { scanId, finding, reason: "A." }, app),
        dismissFinding(asRoot, { scanId, finding, reason: "B." }, app),
        restoreFinding(asRoot, { scanId, finding }, app),
        restoreFinding(asModerator, { scanId, finding }, app),
        dismissFinding(asRoot, { scanId, finding, reason: "C." }, app),
        restoreFinding(asRoot, { scanId, finding }, app),
      ]);
      for (const outcome of await Promise.allSettled(calls))
        if (outcome.status === "rejected")
          expect(allowed, String(outcome.reason)).toContain((outcome.reason as Error).name);
    }
    const rows = await t.db.selectFrom("scan_dismissals").select("id").execute();
    // Counted in the table: the audit page's list is one page long.
    const count = async (action: string) =>
      (await t.db.selectFrom("audit_log").select("id").where("action", "=", action).execute())
        .length;
    const dismissed = await count("scan.finding_dismissed");
    const restored = await count("scan.finding_restored");
    expect(rows).toHaveLength(dismissed - restored);
  });
});

describe("marks racing the scan's deletion (137)", () => {
  it("gives success or not found, never a database error, and leaves no rows behind", async () => {
    const allowed = new Set(["FindingDismissedError", "FindingNotFoundError"]);
    for (let round = 0; round < 12; round++) {
      const { scanId, submissionId } = await scanned("done", asAuthor, `race-${round}`);
      await dismissFinding(asRoot, { scanId, finding: 1, reason: "Before." }, app);
      const calls: Promise<unknown>[] = [0, 1].flatMap((finding) => [
        dismissFinding(asModerator, { scanId, finding, reason: "A." }, app),
        restoreFinding(asRoot, { scanId, finding }, app),
      ]);
      // The submission, or only its scan, goes while they run: without the scan's lock, a mark
      // could reach the insert after the scan went (a raw foreign-key error).
      calls.splice(
        2,
        0,
        new Promise((done) => setTimeout(done, (round % 4) * 5)).then(() =>
          round % 2 === 0
            ? t.db.deleteFrom("submissions").where("id", "=", submissionId).execute()
            : t.db.deleteFrom("content_scans").where("id", "=", scanId).execute(),
        ),
      );
      for (const outcome of await Promise.allSettled(calls))
        if (outcome.status === "rejected")
          expect(allowed, String(outcome.reason)).toContain((outcome.reason as Error).name);
      const left = await t.db
        .selectFrom("scan_dismissals")
        .select("id")
        .where("scan_id", "=", scanId)
        .execute();
      expect(left).toEqual([]);
    }
  });
});

describe("a scan a reviewer can't see (137)", () => {
  it("hides a draft's scan from its reviewers, as the review page does", async () => {
    const { scanId, revisionId, submissionId } = await scanned();
    // Archived, then restored as a draft: its author's alone again.
    await withdrawSubmission(asAuthor, submissionId, app);
    await restoreSubmission(asAuthor, submissionId, app);
    expect((await reviewScan(asModerator, revisionId, app)).scan).toBeNull();
    await expect(
      dismissFinding(asModerator, { scanId, finding: 0, reason: "Draft." }, app),
    ).rejects.toThrow(FindingNotFoundError);
    // Its author still sees it, and still can't mark it.
    expect((await reviewScan(asAuthor, revisionId, app)).scan?.id).toBe(scanId);
  });

  it("only marks a finished scan's findings, even if another kept some", async () => {
    const { scanId } = await scanned();
    await t.db.updateTable("content_scans").set({ status: "failed", error: "timeout" }).execute();
    await expect(
      dismissFinding(asModerator, { scanId, finding: 0, reason: "No." }, app),
    ).rejects.toThrow(FindingNotFoundError);
  });
});

describe("an author who reviews (137)", () => {
  it("never lets a moderator mark their own submission's findings, while root still can", async () => {
    const { scanId, revisionId } = await scanned("done", asModerator);
    await expect(
      dismissFinding(asModerator, { scanId, finding: 0, reason: "Mine is fine." }, app),
    ).rejects.toThrow(NotScanReviewerError);
    expect((await reviewScan(asModerator, revisionId, app)).canDismiss).toBe(false);
    await dismissFinding(asRoot, { scanId, finding: 0, reason: "Checked." }, app);
    await expect(restoreFinding(asModerator, { scanId, finding: 0 }, app)).rejects.toThrow(
      NotScanReviewerError,
    );
  });
});

describe("who sees a scan and its false positives (137)", () => {
  it("shows the author their own scan and the marks, read-only; an outsider sees nothing", async () => {
    const { scanId, revisionId } = await scanned();
    await dismissFinding(asModerator, { scanId, finding: 1, reason: "Pinned." }, app);
    expect(await reviewScan(asAuthor, revisionId, app)).toMatchObject({
      scan: { id: scanId, status: "done" },
      canDismiss: false,
      dismissals: [{ finding: 1, reason: "Pinned." }],
    });
    expect(await reviewScan(asOutsider, revisionId, app)).toEqual({
      scan: null,
      canRequest: false,
      dismissals: [],
      canDismiss: false,
    });
  });

  it("reads no scan for a revision id that isn't one, before any query", async () => {
    const { revisionId } = await scanned();
    for (const bad of ["\u0000", `${revisionId}\u0000`, revisionId.toLowerCase(), "x"])
      expect(await reviewScan(asModerator, bad, app)).toEqual({
        scan: null,
        canRequest: false,
        dismissals: [],
        canDismiss: false,
      });
  });

  it("can't mark a waiting scan's findings, and says so", async () => {
    const { revisionId } = await scanned("queued");
    expect((await reviewScan(asModerator, revisionId, app)).canDismiss).toBe(false);
  });

  it("puts the reviewer's reasons in their data download (104)", async () => {
    const { scanId } = await scanned();
    await dismissFinding(asModerator, { scanId, finding: 0, reason: "Docs only." }, app);
    // Someone else's reason isn't theirs to download.
    await dismissFinding(asRoot, { scanId, finding: 1, reason: "Root's own reason." }, app);
    const moderator = await getCurrentUser(asModerator, app);
    const comments = await kyselyUserDataRepository(t.db, t.dialect).comments(
      moderator?.id ?? "",
      100,
    );
    expect(comments.map((c) => c.body)).not.toContain("Root's own reason.");
    expect(comments).toContainEqual(
      expect.objectContaining({
        submission: "@team/style",
        kind: "false_positive",
        body: "Docs only.",
      }),
    );
  });
});
