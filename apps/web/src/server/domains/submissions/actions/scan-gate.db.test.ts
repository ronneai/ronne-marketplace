import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersonalWorkspace } from "../../../db/personal-workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyContentScanRepository } from "../../scans/repositories/kysely-content-scan-repository";
import {
  SKILL_SCAN_BLOCK_SCORE_KEY,
  SKILL_SCAN_ENABLED_KEY,
  SKILL_SCAN_TYPES_KEY,
} from "../../settings/models/skill-scan-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import {
  ReviewMessageError,
  ScanBlockedError,
  ScanOverrideNotNeededError,
} from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, saveDraftFiles } from "./drafts";
import { approveMany, decide, getReview, listQueue } from "./reviews";
import { submitDraft } from "./submissions";

/**
 * The security scan's gate on approval (137): with scanning on and a threshold, the latest
 * revision's newest scan must have finished under it, on every path that approves. Root's scan
 * override is the way past it.
 */

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAuthor: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  // A scanner command, so sending queues a scan; jobs off, so nothing runs one.
  vi.stubEnv("RONNE_SKILL_SCANNER", '["/opt/skillspector/venv/bin/skillspector"]');
  vi.stubEnv("RONNE_JOBS", "off");
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

const setting = (key: string, value: string) =>
  kyselySettingsRepository(t.db, t.dialect).set(key, value, null, new Date());

/** Scanning on for rules, with `threshold` (empty: none). */
const gateOn = async (threshold = "70") => {
  await setting(SKILL_SCAN_ENABLED_KEY, "true");
  await setting(SKILL_SCAN_TYPES_KEY, "rule");
  await setting(SKILL_SCAN_BLOCK_SCORE_KEY, threshold);
};

/** A rule submitted for review by `headers`. */
const submitted = async (headers = asAuthor, name = "style") => {
  const draft = await createDraft(headers, { scope: "team", name, type: "rule" }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace(
            'description: ""',
            "description: House style.",
          ),
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(headers, draft.id, app);
  return draft.id;
};

/** Finishes or fails every scan of the submission's revisions, as the job would. */
const scanned = async (id: string, outcome: { score: number } | "failed" | "running") => {
  const revisions = t.db
    .selectFrom("submission_revisions")
    .select("id")
    .where("submission_id", "=", id);
  await t.db
    .updateTable("content_scans")
    .set(
      outcome === "failed"
        ? { status: "failed", error: "timeout" }
        : outcome === "running"
          ? { status: "running" }
          : {
              status: "done",
              score: outcome.score,
              severity: "HIGH",
              recommendation: "CAUTION",
              scanner_version: "2.13.2",
              findings: "[]",
            },
    )
    .where("revision_id", "in", revisions)
    .execute();
};

const status = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;
const audited = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("the gate on decide (137)", () => {
  it("leaves approval alone with no threshold, scanned or not", async () => {
    await gateOn("");
    const id = await submitted();
    await decide(asModerator, id, { decision: "approve" }, app);
    expect(await status(id)).toBe("approved");
  });

  it("blocks while the scan waits or runs, then lets a score under the threshold through", async () => {
    await gateOn();
    const id = await submitted();
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toMatchObject({
      name: "ScanBlockedError",
      by: "pending",
      threshold: 70,
    });
    await scanned(id, "running");
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toThrow(
      ScanBlockedError,
    );
    await scanned(id, { score: 69 });
    await decide(asModerator, id, { decision: "approve" }, app);
    expect(await status(id)).toBe("approved");
  });

  it("blocks a score at or above the threshold, and a failed scan", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 70 });
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toMatchObject({
      by: "score",
      score: 70,
      threshold: 70,
    });
    await scanned(id, "failed");
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toMatchObject({
      by: "failed",
    });
    expect(await status(id)).toBe("submitted");
  });

  it("blocks a revision sent before scanning was on: it has no scan", async () => {
    const id = await submitted();
    await gateOn();
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toMatchObject({
      by: "none",
    });
  });

  it("reads the threshold when the decision is made", async () => {
    await gateOn("90");
    const id = await submitted();
    await scanned(id, { score: 80 });
    await setting(SKILL_SCAN_BLOCK_SCORE_KEY, "75");
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toThrow(
      ScanBlockedError,
    );
    await setting(SKILL_SCAN_BLOCK_SCORE_KEY, "85");
    await decide(asModerator, id, { decision: "approve" }, app);
    expect(await status(id)).toBe("approved");
  });

  it("only gates the types root scans", async () => {
    await gateOn();
    await setting(SKILL_SCAN_TYPES_KEY, "skill");
    const id = await submitted();
    await decide(asModerator, id, { decision: "approve" }, app);
    expect(await status(id)).toBe("approved");
  });

  it("leaves request changes and reject alone", async () => {
    await gateOn();
    const id = await submitted();
    await decide(asModerator, id, { decision: "request_changes", message: "Fix it." }, app);
    expect(await status(id)).toBe("changes_requested");
  });
});

describe("the gate in personal workspaces (137)", () => {
  it("gates someone else's submission whose scope was moved into a personal workspace (115)", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 99 });
    // The moderator's own personal workspace now holds the team scope, as a scope move would.
    const moderator = (await getCurrentUser(asModerator, app)) as CurrentUser;
    // The test users have none; Create user (008) makes one (114).
    const personal = await createPersonalWorkspace(
      t.db,
      t.dialect,
      { id: moderator.id, email: "mod@example.com" },
      new Date(),
    );
    await t.db
      .updateTable("scopes")
      .set({ workspace_id: personal.id })
      .where("name", "=", "team")
      .execute();
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toMatchObject({
      by: "score",
    });
    expect(await status(id)).toBe("submitted");
  });
});

describe("root's scan override (137)", () => {
  it("approves a blocked submission with a reason, in the thread and the audit log", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 95 });
    await expect(
      decide(asRoot, id, { decision: "scan_override", message: " " }, app),
    ).rejects.toThrow(ReviewMessageError);
    await decide(
      asRoot,
      id,
      { decision: "scan_override", message: "False alarm: docs only." },
      app,
    );
    expect(await status(id)).toBe("approved");
    const events = await kyselySubmissionRepository(t.db, t.dialect, UNFILTERED).events(id);
    expect(events.at(-1)).toMatchObject({ kind: "scan_override", body: "False alarm: docs only." });
    // The author hears of an override of someone else's blocked submission (139).
    const [told] = await t.db
      .selectFrom("notifications")
      .innerJoin("user", "user.id", "notifications.user_id")
      .select(["notifications.kind as kind", "notifications.subject_id as subjectId"])
      .where("user.email", "=", "author@example.com")
      .execute();
    expect(told).toEqual({ kind: "submission.approved_override", subjectId: id });
    const [event] = await audited("submission.scan_override_approved");
    expect(event).toMatchObject({
      targetId: id,
      metadata: {
        name: "@team/style",
        revision: 1,
        message: "False alarm: docs only.",
        scan: { by: "score", score: 95, threshold: 70 },
      },
    });
  });

  it("is root's alone", async () => {
    await gateOn();
    const id = await submitted();
    await expect(
      decide(asModerator, id, { decision: "scan_override", message: "Looks fine." }, app),
    ).rejects.toThrow(ForbiddenError);
    expect(await status(id)).toBe("submitted");
  });

  it("isn't for a submission the gate doesn't block", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 10 });
    await expect(
      decide(asRoot, id, { decision: "scan_override", message: "Why not." }, app),
    ).rejects.toThrow(ScanOverrideNotNeededError);
  });

  it("takes the place of 054's override on root's own blocked submission", async () => {
    await gateOn();
    const id = await submitted(asRoot);
    await expect(
      decide(asRoot, id, { decision: "override", message: "Mine." }, app),
    ).rejects.toThrow(ScanBlockedError);
    await decide(asRoot, id, { decision: "scan_override", message: "Mine, checked by hand." }, app);
    expect(await status(id)).toBe("approved");
  });
});

describe("the gate on the page, the queue and approving many (137)", () => {
  it("shows the review page's gate, Approve disabled with the reason and root's override", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 88 });
    const asMod = await getReview(asModerator, id, app);
    expect(asMod.gate).toEqual({ blocked: true, by: "score", score: 88, threshold: 70 });
    expect(asMod.decisions.find((o) => o.decision === "approve")).toMatchObject({
      allowed: false,
      why: { code: "scan_blocked", by: "score", score: 88, threshold: 70 },
    });
    expect(asMod.decisions.map((o) => o.decision)).not.toContain("scan_override");
    const asRootView = await getReview(asRoot, id, app);
    expect(asRootView.decisions.find((o) => o.decision === "scan_override")).toMatchObject({
      allowed: true,
    });
    // The author sees the same gate on their page.
    expect((await getReview(asAuthor, id, app)).gate).toMatchObject({ blocked: true });
  });

  it("marks a blocked row not approvable in the queue, and approving many skips it", async () => {
    await gateOn();
    const blocked = await submitted(asAuthor, "style");
    const open = await submitted(asAuthor, "tabs");
    await scanned(blocked, { score: 90 });
    await scanned(open, { score: 5 });
    const rows = (await listQueue(asModerator, { tab: "needs" }, app)).rows;
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row(blocked)?.approvable).toMatchObject({
      approvable: false,
      why: { code: "scan_blocked", by: "score" },
    });
    expect(row(open)?.approvable).toEqual({ approvable: true, override: false });

    const results = await approveMany(
      asModerator,
      {
        items: [
          { id: blocked, revision: 1 },
          { id: open, revision: 1 },
        ],
      },
      app,
    );
    expect(results.map((r) => [r.id, r.result])).toEqual([
      [blocked, "not_approvable"],
      [open, "approved"],
    ]);
    expect(await status(blocked)).toBe("submitted");
  });

  it("counts only the latest revision's scans, never an earlier revision's", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 5 });
    // Revision 2 is sent while scanning is off: it has no scan, whatever revision 1 scored.
    await decide(asModerator, id, { decision: "request_changes", message: "Again." }, app);
    await setting(SKILL_SCAN_ENABLED_KEY, "false");
    await submitDraft(asAuthor, id, app);
    await setting(SKILL_SCAN_ENABLED_KEY, "true");
    await expect(
      decide(asModerator, id, { decision: "approve", revision: 2 }, app),
    ).rejects.toMatchObject({ by: "none" });

    // Revision 3, scanned high: revision 1's low score doesn't count either.
    await decide(asModerator, id, { decision: "request_changes", message: "Once more." }, app);
    await submitDraft(asAuthor, id, app);
    const latest = await t.db
      .selectFrom("submission_revisions")
      .select("id")
      .where("submission_id", "=", id)
      .where("number", "=", 3)
      .executeTakeFirstOrThrow();
    await t.db
      .updateTable("content_scans")
      .set({ status: "done", score: 99, severity: "HIGH", recommendation: "DO_NOT_INSTALL" })
      .where("revision_id", "=", latest.id)
      .execute();
    await expect(
      decide(asModerator, id, { decision: "approve", revision: 3 }, app),
    ).rejects.toMatchObject({ by: "score", score: 99 });
  });

  it("shows an open gate on the review page, with its threshold and Approve allowed", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 10 });
    const view = await getReview(asModerator, id, app);
    expect(view.gate).toEqual({ blocked: false, threshold: 70 });
    expect(view.decisions.find((o) => o.decision === "approve")).toEqual({
      decision: "approve",
      allowed: true,
    });
  });

  it("gates the newest scan of the latest revision only", async () => {
    await gateOn();
    const id = await submitted();
    await scanned(id, { score: 90 });
    // A second scan of the same revision, as Scan again queues: it counts, and it waits.
    const [scan] = await t.db.selectFrom("content_scans").select("revision_id").execute();
    const again = await kyselyContentScanRepository(t.db, t.dialect).queue(
      scan?.revision_id ?? "",
      new Date(Date.now() + 60_000),
    );
    await expect(decide(asModerator, id, { decision: "approve" }, app)).rejects.toMatchObject({
      by: "pending",
    });
    await t.db
      .updateTable("content_scans")
      .set({ status: "done", score: 10, severity: "LOW", recommendation: "SAFE", findings: "[]" })
      .where("id", "=", again)
      .execute();
    await decide(asModerator, id, { decision: "approve" }, app);
    expect(await status(id)).toBe("approved");
  });
});
