import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { UNFILTERED } from "../../workspaces/models/viewer";
import {
  InvalidStatusTransitionError,
  SubmissionInvalidError,
  SubmissionNotEditableError,
} from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, deleteDraft, getDraft, renameDraft, saveDraftFiles } from "./drafts";
import { checkSubmission, submitDraft, withdrawSubmission } from "./submissions";

let t: TestDb;
let app: AppAuth;
let asAuthor: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password, name: "Ada Author" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

const repo = () => kyselySubmissionRepository(t.db, t.dialect, UNFILTERED);

/** Writes one file of the author's submission, from what's saved now. */
const write = async (id: string, path: string, content: string) => {
  const current = (await getDraft(asAuthor, id, app)).files.find((f) => f.path === path);
  return saveDraftFiles(
    asAuthor,
    id,
    {
      writes: [
        {
          path,
          encoding: "utf8",
          content,
          executable: false,
          loadedAt: current?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
};

/** A rule draft with its description written, so it submits. */
const readyDraft = async () => {
  const draft = await createDraft(asAuthor, { scope: "team", name: "style", type: "rule" }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml")?.content ?? "";
  await write(
    draft.id,
    "ronne.yaml",
    manifest.replace('description: ""', "description: House style."),
  );
  return draft;
};

const sendBack = (id: string) =>
  t.db
    .updateTable("submissions")
    .set({ status: "changes_requested" })
    .where("id", "=", id)
    .execute();

describe("revisions", () => {
  it("snapshots the files on submit, and later edits don't touch the snapshot", async () => {
    const draft = await readyDraft();
    await write(draft.id, "rule.md", "Use tabs.");
    const submitted = await submitDraft(asAuthor, draft.id, app);
    expect(submitted.revision).toBe(1);

    const [first] = await repo().revisions(draft.id);
    expect(first).toMatchObject({ number: 1, submissionId: draft.id });
    const snapshot = await repo().revisionFiles(first?.id ?? "");
    expect(snapshot.map((f) => f.path)).toEqual(["ronne.yaml", "rule.md"]);
    expect(snapshot.find((f) => f.path === "rule.md")?.content).toBe("Use tabs.");

    // Sent back, edited: revision 1 still holds what was submitted.
    await sendBack(draft.id);
    await write(draft.id, "rule.md", "Use spaces.");
    const again = await repo().revisionFiles(first?.id ?? "");
    expect(again.find((f) => f.path === "rule.md")?.content).toBe("Use tabs.");
  });

  it("resubmits after changes were requested, as the next revision, and records it", async () => {
    const draft = await readyDraft();
    const first = await submitDraft(asAuthor, draft.id, app);
    await sendBack(draft.id);
    await write(draft.id, "rule.md", "Use spaces.");

    expect(await checkSubmission(asAuthor, draft.id, app)).toEqual([]);
    const second = await submitDraft(asAuthor, draft.id, app);
    expect(second).toMatchObject({ status: "submitted", revision: 2 });
    // The first submit's time stays; the queue waits from it.
    expect(second.submittedAt?.getTime()).toBe(first.submittedAt?.getTime());
    const latest = (await repo().revisions(draft.id)).at(-1);
    const files = await repo().revisionFiles(latest?.id ?? "");
    expect(files.find((f) => f.path === "rule.md")?.content).toBe("Use spaces.");

    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "submission.resubmitted",
    );
    expect(event).toMatchObject({ targetId: draft.id, metadata: { revision: 2 } });
  });

  it("runs the checks again on resubmit", async () => {
    const draft = await readyDraft();
    await submitDraft(asAuthor, draft.id, app);
    await sendBack(draft.id);
    const manifest = (await getDraft(asAuthor, draft.id, app)).files.find(
      (f) => f.path === "ronne.yaml",
    );
    await write(draft.id, "ronne.yaml", (manifest?.content ?? "").replace("House style.", ""));
    await expect(submitDraft(asAuthor, draft.id, app)).rejects.toThrow(SubmissionInvalidError);
    expect((await repo().revisions(draft.id)).map((r) => r.number)).toEqual([1]);
  });

  it("lets the author edit when changes are requested, but not rename or delete", async () => {
    const draft = await readyDraft();
    await submitDraft(asAuthor, draft.id, app);
    await expect(write(draft.id, "rule.md", "x")).rejects.toThrow(SubmissionNotEditableError);
    await sendBack(draft.id);
    await expect(write(draft.id, "rule.md", "x")).resolves.toBeDefined();
    await expect(
      renameDraft(asAuthor, draft.id, { scope: "team", name: "other" }, app),
    ).rejects.toThrow(SubmissionNotEditableError);
    await expect(deleteDraft(asAuthor, draft.id, app)).rejects.toThrow(SubmissionNotEditableError);
  });
});

describe("the conversation", () => {
  it("records submit, resubmit and withdraw, with the author and revision", async () => {
    const draft = await readyDraft();
    await submitDraft(asAuthor, draft.id, app);
    await sendBack(draft.id);
    await submitDraft(asAuthor, draft.id, app);
    await withdrawSubmission(asAuthor, draft.id, app);

    const events = await repo().events(draft.id);
    expect(events.map((e) => [e.kind, e.revision, e.actor.name])).toEqual([
      ["submit", 1, "Ada Author"],
      ["resubmit", 2, "Ada Author"],
      ["withdraw", 2, "Ada Author"],
    ]);
  });

  it("records a draft withdrawn before any submit, with no revision", async () => {
    const draft = await readyDraft();
    await withdrawSubmission(asAuthor, draft.id, app);
    const [event] = await repo().events(draft.id);
    expect(event).toMatchObject({ kind: "withdraw", revision: null });
    await expect(submitDraft(asAuthor, draft.id, app)).rejects.toThrow(
      InvalidStatusTransitionError,
    );
  });
});
