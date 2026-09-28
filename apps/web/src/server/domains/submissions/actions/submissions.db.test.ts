import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  InvalidStatusTransitionError,
  SubmissionInvalidError,
  SubmissionNotEditableError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import type { SubmissionStatus } from "../models/status";
import { createDraft, deleteDraft, getDraft, renameDraft, saveDraftFiles } from "./drafts";
import { checkSubmission, submitDraft, viewSubmission, withdrawSubmission } from "./submissions";

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAuthor: Headers;
let asOther: Headers;
let asModerator: Headers;
const password = "correct horse battery";

const headersFor = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "other@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  asRoot = await headersFor("root@example.com");
  asAuthor = await headersFor("author@example.com");
  asOther = await headersFor("other@example.com");
  asModerator = await headersFor("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

/** A rule draft whose template description is written, so it passes 011's checks. */
const readyDraft = async (headers = asAuthor, name = "style", extra = "") => {
  const draft = await createDraft(headers, { scope: "team", name, type: "rule" }, app);
  const manifest = draft.files.find((file) => file.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `${(manifest?.content ?? "").replace('description: ""', "description: House style.")}${extra}`,
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft;
};

const setStatus = (id: string, status: SubmissionStatus) =>
  t.db.updateTable("submissions").set({ status }).where("id", "=", id).execute();

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("submitDraft", () => {
  it("submits a valid draft, freezes it, and records it in the same transaction", async () => {
    const draft = await readyDraft();
    expect(await checkSubmission(asAuthor, draft.id, app)).toEqual([]);

    const submitted = await submitDraft(asAuthor, draft.id, app);
    expect(submitted).toMatchObject({ status: "submitted", issues: [] });
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    const [event] = await events("submission.submitted");
    expect(event).toMatchObject({
      targetType: "submission",
      targetId: draft.id,
      metadata: { name: "@team/style", type: "rule", dependencies: {} },
    });

    // Frozen: no saving, renaming or deleting, and a second submit is refused.
    await expect(
      saveDraftFiles(
        asAuthor,
        draft.id,
        {
          writes: [
            { path: "x.md", encoding: "utf8", content: "x", executable: false, loadedAt: null },
          ],
          deletes: [],
        },
        app,
      ),
    ).rejects.toThrow(SubmissionNotEditableError);
    await expect(
      renameDraft(asAuthor, draft.id, { scope: "team", name: "x" }, app),
    ).rejects.toThrow(SubmissionNotEditableError);
    await expect(deleteDraft(asAuthor, draft.id, app)).rejects.toThrow(SubmissionNotEditableError);
    await expect(submitDraft(asAuthor, draft.id, app)).rejects.toThrow(
      InvalidStatusTransitionError,
    );
  });

  it("refuses a draft with errors in its saved files, and lists them", async () => {
    const draft = await createDraft(asAuthor, { scope: "team", name: "raw", type: "rule" }, app);
    const refused = submitDraft(asAuthor, draft.id, app);
    await expect(refused).rejects.toThrow(SubmissionInvalidError);
    await expect(refused).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: "/description" })],
    });
    expect((await getDraft(asAuthor, draft.id, app)).status).toBe("draft");
    expect(await events("submission.submitted")).toEqual([]);
  });

  it("refuses a name another open submission proposes; drafts and closed ones don't hold it", async () => {
    const theirs = await readyDraft(asOther);
    const mine = await readyDraft();
    // Their draft doesn't hold the name.
    expect(await checkSubmission(asAuthor, mine.id, app)).toEqual([]);

    await submitDraft(asOther, theirs.id, app);
    const refused = submitDraft(asAuthor, mine.id, app);
    await expect(refused).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: "name_taken" })],
    });

    // Once theirs is withdrawn, the name is free again.
    await withdrawSubmission(asOther, theirs.id, app);
    await expect(submitDraft(asAuthor, mine.id, app)).resolves.toMatchObject({
      status: "submitted",
    });
  });

  it("lets only one of two concurrent submits of the same name through", async () => {
    const a = await readyDraft(asAuthor);
    const b = await readyDraft(asOther);
    const results = await Promise.allSettled([
      submitDraft(asAuthor, a.id, app),
      submitDraft(asOther, b.id, app),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [failed] = results.filter((r) => r.status === "rejected");
    expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(SubmissionInvalidError);
    expect(await events("submission.submitted")).toHaveLength(1);
  });

  it("in M2, refuses any dependency: nothing is released yet", async () => {
    const draft = await createDraft(asAuthor, { scope: "team", name: "kit", type: "bundle" }, app);
    const manifest = draft.files.find((file) => file.path === "ronne.yaml");
    await saveDraftFiles(
      asAuthor,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content:
              'name: "@team/kit"\ntype: bundle\ndescription: A kit.\ndependencies:\n  "@team/style": "^1.0.0"\n',
            executable: false,
            loadedAt: manifest?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await expect(submitDraft(asAuthor, draft.id, app)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "dependency_not_found",
          message: expect.stringContaining("@team/style isn't a published item"),
        }),
      ],
    });
  });
});

describe("withdrawSubmission", () => {
  it.each(["draft", "submitted", "changes_requested"] as const)(
    "withdraws from %s, for good, and records it",
    async (from) => {
      const draft = await readyDraft();
      await setStatus(draft.id, from);
      expect(await withdrawSubmission(asAuthor, draft.id, app)).toMatchObject({
        status: "withdrawn",
      });
      await expect(withdrawSubmission(asAuthor, draft.id, app)).rejects.toThrow(
        InvalidStatusTransitionError,
      );
      const [event] = await events("submission.withdrawn");
      expect(event).toMatchObject({ targetId: draft.id, metadata: { name: "@team/style", from } });
    },
  );

  it("refuses once approved", async () => {
    const draft = await readyDraft();
    await setStatus(draft.id, "approved");
    await expect(withdrawSubmission(asAuthor, draft.id, app)).rejects.toThrow(
      "A submission that's approved can't be withdrawn.",
    );
  });
});

describe("who sees and does what", () => {
  it("lets only the author submit and withdraw", async () => {
    const draft = await readyDraft();
    for (const headers of [asOther, asModerator, asRoot]) {
      await expect(submitDraft(headers, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);
      await expect(withdrawSubmission(headers, draft.id, app)).rejects.toThrow(
        SubmissionNotFoundError,
      );
      await expect(checkSubmission(headers, draft.id, app)).rejects.toThrow(
        SubmissionNotFoundError,
      );
    }
  });

  it("shows a draft to its author only, and a submitted one to moderators and root too", async () => {
    const draft = await readyDraft();
    expect((await viewSubmission(asAuthor, draft.id, app)).mine).toBe(true);
    for (const headers of [asModerator, asRoot, asOther])
      await expect(viewSubmission(headers, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);

    await submitDraft(asAuthor, draft.id, app);
    for (const headers of [asModerator, asRoot]) {
      const seen = await viewSubmission(headers, draft.id, app);
      expect(seen).toMatchObject({ status: "submitted", mine: false });
      expect(seen.files.map((f) => f.path)).toEqual(["ronne.yaml", "rule.md"]);
    }
    await expect(viewSubmission(asOther, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);
  });
});
