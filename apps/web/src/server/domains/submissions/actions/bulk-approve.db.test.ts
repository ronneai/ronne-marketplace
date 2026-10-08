import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { BulkLimitError, ReviewMessageError } from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, getDraft, saveDraftFiles } from "./drafts";
import { proposeChange } from "./proposals";
import { publishSubmission } from "./publish";
import { approveMany, decide } from "./reviews";
import { submitDraft, withdrawSubmission } from "./submissions";

let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asRoot: Headers;
let asAuthor: Headers;
let asModerator: Headers;
let asModerator2: Headers;
let moderatorId: string;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-bulk-approve-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  moderatorId = await createTestUser(app, {
    email: "mod@example.com",
    password,
    role: "moderator",
  });
  await createTestUser(app, { email: "mod2@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  asModerator2 = await signedIn("mod2@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** Writes files over a draft's, as the editor saves them. */
const write = async (headers: Headers, id: string, files: Record<string, string>) => {
  const draft = await getDraft(headers, id, app);
  await saveDraftFiles(
    headers,
    id,
    {
      writes: Object.entries(files).map(([path, content]) => ({
        path,
        encoding: "utf8" as const,
        content,
        executable: false,
        loadedAt: draft.files.find((f) => f.path === path)?.updatedAt ?? null,
      })),
      deletes: [],
    },
    app,
  );
};

/** Each id with its latest revision, as the queue's row shows it (security audit AUTHZ-2). */
const rows = (...ids: string[]) =>
  Promise.all(
    ids.map(async (id) => {
      const last = await t.db
        .selectFrom("submission_revisions")
        .select((eb) => eb.fn.max("number").as("number"))
        .where("submission_id", "=", id)
        .executeTakeFirst();
      return { id, revision: last?.number == null ? null : Number(last.number) };
    }),
  );

/** A rule submitted for review by `headers`. */
const submitted = async (headers: Headers, name: string) => {
  const draft = await createDraft(headers, { scope: "team", name, type: "rule" }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml")?.content ?? "";
  await write(headers, draft.id, {
    "ronne.yaml": manifest.replace('description: ""', "description: House style."),
  });
  await submitDraft(headers, draft.id, app);
  return draft.id;
};

const status = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;
const events = (id: string) => kyselySubmissionRepository(t.db, t.dialect, UNFILTERED).events(id);
const audited = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("approveMany", () => {
  it("approves each on its own, reporting the ones it can't approve, with the message on each", async () => {
    const one = await submitted(asAuthor, "one");
    const two = await submitted(asAuthor, "two");
    const own = await submitted(asModerator, "own");
    const withdrawn = await submitted(asAuthor, "gone");
    await withdrawSubmission(asAuthor, withdrawn, app);

    const results = await approveMany(
      asModerator,
      { items: await rows(one, own, withdrawn, "nope", two, one), message: "  Looks good.  " },
      app,
    );
    expect(results.map((r) => [r.id, r.result])).toEqual([
      [one, "approved"],
      [own, "not_approvable"],
      [withdrawn, "not_approvable"],
      ["nope", "not_found"],
      [two, "approved"],
    ]);
    expect(results[0]).toMatchObject({ override: false, revision: 1 });
    expect(results[1]).toMatchObject({ reason: expect.stringContaining("another moderator") });
    expect(results[2]).toMatchObject({ reason: expect.stringContaining("archived") });

    for (const id of [one, two]) {
      expect(await status(id)).toBe("approved");
      expect((await events(id)).at(-1)).toMatchObject({ kind: "approve", body: "Looks good." });
    }
    expect(await status(own)).toBe("submitted");
    const approved = await audited("submission.approved");
    expect(approved.map((e) => e.metadata)).toEqual(
      expect.arrayContaining([
        { name: "@team/one", revision: 1, message: "Looks good.", via: "bulk" },
        { name: "@team/two", revision: 1, message: "Looks good.", via: "bulk" },
      ]),
    );
  });

  it("puts no message on any approval when it's empty", async () => {
    const one = await submitted(asAuthor, "one");
    await approveMany(asModerator, { items: await rows(one), message: " " }, app);
    expect((await events(one)).at(-1)).toMatchObject({ kind: "approve", body: null });
    const [event] = await audited("submission.approved");
    expect(event?.metadata).toEqual({ name: "@team/one", revision: 1, via: "bulk" });
  });

  it("approves root's own as overrides", async () => {
    const own = await submitted(asRoot, "roots");
    const theirs = await submitted(asAuthor, "theirs");
    const results = await approveMany(asRoot, { items: await rows(own, theirs) }, app);
    expect(results.map((r) => r.result === "approved" && r.override)).toEqual([true, false]);
    expect((await events(own)).at(-1)).toMatchObject({ kind: "override", body: null });
    expect(await audited("submission.override_approved")).toHaveLength(1);
    expect(await audited("submission.approved")).toHaveLength(1);
  });

  it("refuses a stale proposal and approves the rest", async () => {
    const draft = await createDraft(asAuthor, { scope: "team", name: "style", type: "rule" }, app);
    const manifest = draft.files.find((f) => f.path === "ronne.yaml")?.content ?? "";
    await write(asAuthor, draft.id, {
      "ronne.yaml": manifest.replace('description: ""', "description: House style."),
    });
    await submitDraft(asAuthor, draft.id, app, storage);
    await decide(asModerator, draft.id, { decision: "approve" }, app);
    await publishSubmission(
      asAuthor,
      draft.id,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );

    const base = { item: "@team/style", version: "1.0.0" };
    const first = await proposeChange(asAuthor, base, app, storage);
    const second = await proposeChange(asAuthor, base, app, storage);
    for (const [id, readme] of [
      [first.id, "One."],
      [second.id, "Two."],
    ] as const) {
      await write(asAuthor, id, { "README.md": readme });
      await submitDraft(asAuthor, id, app, storage);
    }
    await decide(asModerator, first.id, { decision: "approve" }, app);
    await publishSubmission(
      asAuthor,
      first.id,
      { choice: { kind: "stable", bump: "patch" } },
      app,
      storage,
    );
    const other = await submitted(asAuthor, "other");

    const results = await approveMany(asModerator, { items: await rows(second.id, other) }, app);
    expect(results.map((r) => r.result)).toEqual(["not_approvable", "approved"]);
    expect(results[0]).toMatchObject({ reason: expect.stringContaining("1.0.1") });
    expect(await status(second.id)).toBe("submitted");
  });

  it("reports a row whose revision changed since the queue showed it (security audit AUTHZ-2)", async () => {
    const one = await submitted(asAuthor, "one");
    const two = await submitted(asAuthor, "two");
    const [first, second] = await rows(one, two);
    const results = await approveMany(
      asModerator,
      // As if two had been resubmitted after the queue loaded: its row shows revision 0.
      { items: [first as { id: string; revision: number | null }, { id: two, revision: 0 }] },
      app,
    );
    expect(results.map((r) => r.result)).toEqual(["approved", "not_approvable"]);
    expect(results[1]).toMatchObject({
      reason: expect.stringContaining("changed since you opened it"),
    });
    expect(second?.revision).toBe(1);
  });

  it("approves each once when two reviewers approve the same ones at once", async () => {
    const ids = [await submitted(asAuthor, "one"), await submitted(asAuthor, "two")];
    const items = await rows(...ids);
    const [a, b] = await Promise.all([
      approveMany(asModerator, { items }, app),
      approveMany(asModerator2, { items }, app),
    ]);
    const approved = [...a, ...b].filter((r) => r.result === "approved");
    expect(approved.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect([...a, ...b].filter((r) => r.result === "not_approvable")).toHaveLength(2);
    expect(await audited("submission.approved")).toHaveLength(2);
  });

  it("keeps out anyone who can't review, a message that's too long, and more than 100", async () => {
    const one = await submitted(asAuthor, "one");
    await expect(approveMany(asAuthor, { items: await rows(one) }, app)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      approveMany(asModerator, { items: await rows(one), message: "x".repeat(5001) }, app),
    ).rejects.toThrow(ReviewMessageError);
    const many = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await expect(approveMany(asModerator, { items: await rows(...many) }, app)).rejects.toThrow(
      BulkLimitError,
    );

    // A moderator demoted while the page is open: nothing changes.
    await setWorkspaceRole(app, moderatorId, "user");
    await expect(approveMany(asModerator, { items: await rows(one) }, app)).rejects.toThrow(
      ForbiddenError,
    );
    expect(await status(one)).toBe("submitted");
  });
});
