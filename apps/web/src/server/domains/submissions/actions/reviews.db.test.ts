import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  ConversationClosedError,
  InvalidStatusTransitionError,
  OverrideNotNeededError,
  OwnSubmissionError,
  ReviewMessageError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, getDraft, saveDraftFiles } from "./drafts";
import { comment, decide } from "./reviews";
import { submitDraft } from "./submissions";

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAuthor: Headers;
let asOther: Headers;
let asModerator: Headers;
let asModerator2: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "other@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  await createTestUser(app, { email: "mod2@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asOther = await signedIn("other@example.com");
  asModerator = await signedIn("mod@example.com");
  asModerator2 = await signedIn("mod2@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

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

const status = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;
const events = (id: string) => kyselySubmissionRepository(t.db, t.dialect).events(id);
const audited = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("decisions", () => {
  it("lets a moderator approve, with an optional message, recorded in the thread and the audit log", async () => {
    const id = await submitted();
    await decide(asModerator, id, { decision: "approve" }, app);
    expect(await status(id)).toBe("approved");
    expect((await events(id)).map((e) => [e.kind, e.revision, e.body])).toEqual([
      ["submit", 1, null],
      ["approve", 1, null],
    ]);
    const [event] = await audited("submission.approved");
    expect(event).toMatchObject({ targetId: id, metadata: { name: "@team/style", revision: 1 } });
  });

  it("requires a message to request changes or reject", async () => {
    const id = await submitted();
    for (const decision of ["request_changes", "reject"] as const)
      await expect(decide(asModerator, id, { decision, message: "  " }, app)).rejects.toThrow(
        ReviewMessageError,
      );
    await expect(
      decide(asModerator, id, { decision: "reject", message: "x".repeat(5001) }, app),
    ).rejects.toThrow("at most 5,000 characters");
    expect(await status(id)).toBe("submitted");

    await decide(
      asModerator,
      id,
      { decision: "request_changes", message: "Name the tabs rule." },
      app,
    );
    expect(await status(id)).toBe("changes_requested");
    expect((await events(id)).at(-1)).toMatchObject({
      kind: "request_changes",
      body: "Name the tabs rule.",
    });
    expect(await audited("submission.changes_requested")).toHaveLength(1);
  });

  it("rejects for good", async () => {
    const id = await submitted();
    await decide(asRoot, id, { decision: "reject", message: "Duplicates @team/lint." }, app);
    expect(await status(id)).toBe("rejected");
    await expect(decide(asRoot, id, { decision: "approve" }, app)).rejects.toThrow(
      InvalidStatusTransitionError,
    );
  });

  it("keeps users out, and moderators off their own submissions", async () => {
    const id = await submitted();
    for (const headers of [asAuthor, asOther])
      await expect(decide(headers, id, { decision: "approve" }, app)).rejects.toThrow(
        ForbiddenError,
      );
    const theirs = await submitted(asModerator, "mine");
    await expect(decide(asModerator, theirs, { decision: "approve" }, app)).rejects.toThrow(
      "another moderator or root has to",
    );
    await expect(
      decide(asModerator, theirs, { decision: "override", message: "Trust me." }, app),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets root approve its own submission only by an override with a reason, audited as one", async () => {
    const own = await submitted(asRoot, "roots");
    await expect(decide(asRoot, own, { decision: "approve" }, app)).rejects.toThrow(
      OwnSubmissionError,
    );
    await expect(decide(asRoot, own, { decision: "override" }, app)).rejects.toThrow(
      ReviewMessageError,
    );
    await decide(
      asRoot,
      own,
      { decision: "override", message: "Urgent fix; I'm the only reviewer." },
      app,
    );
    expect(await status(own)).toBe("approved");
    expect((await events(own)).at(-1)).toMatchObject({ kind: "override" });
    expect(await audited("submission.override_approved")).toHaveLength(1);

    const someoneElses = await submitted();
    await expect(
      decide(asRoot, someoneElses, { decision: "override", message: "x" }, app),
    ).rejects.toThrow(OverrideNotNeededError);
  });

  it("lets only one of two concurrent decisions through", async () => {
    const id = await submitted();
    const results = await Promise.allSettled([
      decide(asModerator, id, { decision: "approve" }, app),
      decide(asModerator2, id, { decision: "reject", message: "No." }, app),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [failed] = results.filter((r) => r.status === "rejected");
    expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(InvalidStatusTransitionError);
    expect((await events(id)).filter((e) => e.kind !== "submit")).toHaveLength(1);
  });

  it("refuses decisions on drafts, which reviewers can't see", async () => {
    const draft = await createDraft(asAuthor, { scope: "team", name: "wip", type: "rule" }, app);
    await expect(decide(asModerator, draft.id, { decision: "approve" }, app)).rejects.toThrow(
      SubmissionNotFoundError,
    );
  });
});

describe("comments", () => {
  it("lets reviewers and the author talk while it's under review", async () => {
    const id = await submitted();
    await comment(asModerator, id, { body: "Why tabs?" }, app);
    await comment(asAuthor, id, { body: "House style." }, app);
    await decide(
      asModerator,
      id,
      { decision: "request_changes", message: "Say so in the rule." },
      app,
    );
    await comment(asAuthor, id, { body: "Will do." }, app);
    expect((await events(id)).map((e) => [e.kind, e.body])).toEqual([
      ["submit", null],
      ["comment", "Why tabs?"],
      ["comment", "House style."],
      ["request_changes", "Say so in the rule."],
      ["comment", "Will do."],
    ]);
    // Comments aren't audited: the thread is their record.
    expect(
      (await listAuditEvents(t.db, t.dialect, {})).events.some((e) => e.action.includes("comment")),
    ).toBe(false);
  });

  it("keeps other users out, refuses empty comments, and closes with the submission", async () => {
    const id = await submitted();
    await expect(comment(asOther, id, { body: "Hi" }, app)).rejects.toThrow(
      SubmissionNotFoundError,
    );
    await expect(comment(asModerator, id, { body: " " }, app)).rejects.toThrow(ReviewMessageError);
    await decide(asModerator, id, { decision: "reject", message: "No." }, app);
    await expect(comment(asAuthor, id, { body: "But why?" }, app)).rejects.toThrow(
      ConversationClosedError,
    );
    const draft = await createDraft(asAuthor, { scope: "team", name: "wip", type: "rule" }, app);
    await expect(comment(asAuthor, draft.id, { body: "Note to self" }, app)).rejects.toThrow(
      ConversationClosedError,
    );
    expect((await getDraft(asAuthor, draft.id, app)).status).toBe("draft");
  });
});
