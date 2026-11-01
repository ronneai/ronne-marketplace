import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { rollbackProbe, throwAfterNotify } from "../../notifications/testing/throw-after-notify";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission, releaseMany } from "./publish";
import { comment, decide, rejectWithDependents } from "./reviews";
import { submitDraft } from "./submissions";

vi.mock("../../notifications/services/notify", async (original) =>
  throwAfterNotify(await original<{ notify: (...a: never[]) => Promise<number> }>()),
);

// Atomicity of what the submission services tell people (139, task 3): when a decision, a comment
// or a release fails right after its notification was written, the notification goes with it, and
// so do the status change, the thread and the audit event. Each case then runs the same call again,
// unarmed, to show it was only the failure that kept it from being written.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asRoot: Headers;
let asAuthor: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  rollbackProbe.armed = false;
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-rollback-"));
  storage = localStorage(storageRoot);
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
  rollbackProbe.armed = false;
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const count = async (table: "notifications" | "audit_log" | "review_events" | "item_versions") =>
  Number(
    (
      await t.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as("n"))
        .executeTakeFirstOrThrow()
    ).n,
  );

const status = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;

/** A rule, or (with `needs`) a bundle, submitted for review by the author. */
const submitted = async (name: string, needs?: string, by = asAuthor) => {
  const draft = await createDraft(
    by,
    { scope: "team", name, type: needs ? "bundle" : "rule" },
    app,
  );
  const manifest = draft.files.find((f) => f.path === "ronne.yaml");
  const content = needs
    ? `name: "@team/${name}"\ntype: bundle\ndescription: A set.\ndependencies:\n  "@team/${needs}": "^1.0.0"\n`
    : (manifest?.content ?? "").replace('description: ""', "description: House style.");
  await saveDraftFiles(
    by,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content,
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(by, draft.id, app, storage);
  return draft.id;
};

/**
 * Runs `change` armed, so it fails after its notification was written: then nothing is left (no
 * notification, audit event, thread entry or version) and `state()` reads as before. Then runs it
 * again, unarmed: it goes through and tells someone.
 */
const rollsBack = async <S>(change: () => Promise<unknown>, state: () => Promise<S>) => {
  const tables = ["audit_log", "review_events", "item_versions"] as const;
  const [before, notified] = [await state(), await count("notifications")];
  const rows = await Promise.all(tables.map(count));
  rollbackProbe.armed = true;
  try {
    await expect(change()).rejects.toThrow("failed after notify");
  } finally {
    rollbackProbe.armed = false;
  }
  expect(await count("notifications")).toBe(notified);
  expect(await Promise.all(tables.map(count))).toEqual(rows);
  expect(await state()).toEqual(before);
  await change();
  expect(await count("notifications")).toBeGreaterThan(notified);
  expect(await state()).not.toEqual(before);
};

describe("decisions and comments", () => {
  it.each([
    ["approve", {}],
    ["request_changes", { message: "Fix it." }],
    ["reject", { message: "No." }],
  ] as const)(
    "%s leaves the status, thread, audit log and notifications as they were",
    async (decision, extra) => {
      const id = await submitted(`rule-${decision}`.replaceAll("_", "-"));
      await rollsBack(
        () => decide(asModerator, id, { decision, ...extra }, app),
        () => status(id),
      );
    },
  );

  it("root's override of its own submission leaves the status, thread and audit log as they were", async () => {
    // It tells nobody (the author is the actor), so only the rollback itself is checked.
    const own = await submitted("rule-override", undefined, asRoot);
    const [before, audits, events] = [
      await status(own),
      await count("audit_log"),
      await count("review_events"),
    ];
    rollbackProbe.armed = true;
    rollbackProbe.fired = 0;
    try {
      await expect(
        decide(asRoot, own, { decision: "override", message: "Urgent." }, app),
      ).rejects.toThrow("failed after notify");
    } finally {
      rollbackProbe.armed = false;
    }
    expect(rollbackProbe.fired).toBe(1);
    expect(await status(own)).toBe(before);
    expect(await count("audit_log")).toBe(audits);
    expect(await count("review_events")).toBe(events);
    expect(await count("notifications")).toBe(0);
    await decide(asRoot, own, { decision: "override", message: "Urgent." }, app);
    expect(await status(own)).not.toBe(before);
    expect(await count("audit_log")).toBe(audits + 1);
  });

  it("sending it back after a request for changes leaves the status, thread and notifications as they were", async () => {
    const id = await submitted("rule-resubmit");
    await decide(asModerator, id, { decision: "request_changes", message: "Fix it." }, app);
    await rollsBack(
      () => submitDraft(asAuthor, id, app, storage),
      () => status(id),
    );
  });

  it("a comment leaves no entry in the thread", async () => {
    const id = await submitted("rule-comment");
    await rollsBack(
      () => comment(asModerator, id, { body: "Why tabs?" }, app),
      () => count("review_events"),
    );
  });

  it("rejecting with its dependents leaves every submission as it was", async () => {
    const style = await submitted("style");
    const kit = await submitted("kit", "style");
    const state = async () => [await status(style), await status(kit)];
    const [before, notified] = [await state(), await count("notifications")];
    const audits = await count("audit_log");
    rollbackProbe.armed = true;
    rollbackProbe.fired = 0;
    try {
      await rejectWithDependents(
        asModerator,
        style,
        { message: "No.", dependents: { message: "Drop it." } },
        app,
      ).catch(() => undefined);
    } finally {
      rollbackProbe.armed = false;
    }
    expect(rollbackProbe.fired).toBeGreaterThan(0);
    // Whatever the call reported, a notification never outlives a decision that did not stand.
    expect(await count("notifications")).toBe(notified);
    expect(await count("audit_log")).toBe(audits);
    expect(await state()).toEqual(before);
    // The control: unarmed, the rejection and the send-back both stand and each is told.
    await rejectWithDependents(
      asModerator,
      style,
      { message: "No.", dependents: { message: "Drop it." } },
      app,
    );
    expect(await state()).toEqual(["rejected", "changes_requested"]);
    expect(
      (await t.db.selectFrom("notifications").select("kind").orderBy("id").execute()).map(
        (n) => n.kind,
      ),
    ).toEqual(["submission.rejected", "submission.dependency_rejected"]);
  });
});

describe("releases", () => {
  const approved = async (name: string) => {
    const id = await submitted(name);
    await decide(asModerator, id, { decision: "approve" }, app);
    return id;
  };

  it("one release leaves the submission approved, with no version, tag or notification", async () => {
    const id = await approved("rule-one");
    await rollsBack(
      () =>
        publishSubmission(asRoot, id, { choice: { kind: "stable", bump: "patch" } }, app, storage),
      () => status(id),
    );
  });

  it("releasing several at once leaves all of them approved: all or none", async () => {
    const [a, b] = [await approved("rule-a"), await approved("rule-b")];
    const state = async () => [await status(a), await status(b)];
    const [before, notified] = [await state(), await count("notifications")];
    const [versions, audits] = [await count("item_versions"), await count("audit_log")];
    rollbackProbe.armed = true;
    rollbackProbe.fired = 0;
    try {
      await releaseMany(
        asRoot,
        { ids: [a, b], settings: { kind: "stable", bump: "suggested" }, notes: "Together." },
        app,
        storage,
      ).catch(() => undefined);
    } finally {
      rollbackProbe.armed = false;
    }
    expect(rollbackProbe.fired).toBeGreaterThan(0);
    expect(await count("notifications")).toBe(notified);
    expect(await count("item_versions")).toBe(versions);
    expect(await count("audit_log")).toBe(audits);
    expect(await state()).toEqual(before);
    // The control: unarmed, both are released and the author is told of each.
    await releaseMany(
      asRoot,
      { ids: [a, b], settings: { kind: "stable", bump: "suggested" }, notes: "Together." },
      app,
      storage,
    );
    expect(await state()).toEqual(["published", "published"]);
    expect(
      (
        await t.db
          .selectFrom("notifications")
          .select("kind")
          .where("kind", "=", "submission.released")
          .execute()
      ).length,
    ).toBe(2);
  });
});
