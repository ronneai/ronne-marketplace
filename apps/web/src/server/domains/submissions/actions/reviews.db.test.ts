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
  RevisionChangedError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, getDraft, listMySubmissions, saveDraftFiles } from "./drafts";
import { comment, decide, listDependents, rejectWithDependents } from "./reviews";
import { latestFeedback, restoreSubmission, submitDraft, withdrawSubmission } from "./submissions";

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

  it("records a decision made from a queue row (058)", async () => {
    const changes = await submitted(asAuthor, "style");
    const rejected = await submitted(asAuthor, "lint");
    await decide(
      asModerator,
      changes,
      { decision: "request_changes", message: "Name the tabs rule.", via: "queue" },
      app,
    );
    await rejectWithDependents(asModerator, rejected, { message: "Duplicate.", via: "queue" }, app);
    expect(await status(changes)).toBe("changes_requested");
    expect(await status(rejected)).toBe("rejected");
    const [sentBack] = await audited("submission.changes_requested");
    expect(sentBack).toMatchObject({ targetId: changes, metadata: { via: "queue" } });
    const [rejection] = await audited("submission.rejected");
    expect(rejection).toMatchObject({ targetId: rejected, metadata: { via: "queue" } });
  });

  it("gives the author the latest reviewer message on each sent back or rejected one (058)", async () => {
    const sentBack = await submitted(asAuthor, "style");
    const rejected = await submitted(asAuthor, "lint");
    const open = await submitted(asAuthor, "open");
    await comment(asModerator, sentBack, { body: "A question first." }, app);
    await decide(asModerator, sentBack, { decision: "request_changes", message: "First." }, app);
    await submitDraft(asAuthor, sentBack, app);
    await decide(asRoot, sentBack, { decision: "request_changes", message: "Second." }, app);
    await decide(asModerator, rejected, { decision: "reject", message: "Duplicate." }, app);
    const mine = await listMySubmissions(asAuthor, app);

    const feedback = await latestFeedback(asAuthor, mine, app);
    expect(feedback).toEqual({
      [sentBack]: { kind: "request_changes", by: "Root", body: "Second." },
      [rejected]: { kind: "reject", by: "Someone", body: "Duplicate." },
    });
    expect(feedback[open]).toBeUndefined();
    // Someone else's list says nothing about these.
    expect(await latestFeedback(asModerator, mine, app)).toEqual({});
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

  it("lets root approve its own submission only by an override, audited as one", async () => {
    const own = await submitted(asRoot, "roots");
    await expect(decide(asRoot, own, { decision: "approve" }, app)).rejects.toThrow(
      OwnSubmissionError,
    );
    await decide(
      asRoot,
      own,
      { decision: "override", message: "Urgent fix; I'm the only reviewer." },
      app,
    );
    expect(await status(own)).toBe("approved");
    expect((await events(own)).at(-1)).toMatchObject({
      kind: "override",
      body: "Urgent fix; I'm the only reviewer.",
    });
    const [withReason] = await audited("submission.override_approved");
    expect(withReason?.metadata).toMatchObject({ message: "Urgent fix; I'm the only reviewer." });

    // The reason is optional (054): it's still an override, with no body and no message.
    const second = await submitted(asRoot, "roots-too");
    await decide(asRoot, second, { decision: "override", message: "  " }, app);
    expect(await status(second)).toBe("approved");
    expect((await events(second)).at(-1)).toMatchObject({ kind: "override", body: null });
    const withoutReason = (await audited("submission.override_approved")).find(
      (e) => e.targetId === second,
    );
    expect(withoutReason?.metadata).not.toHaveProperty("message");

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

describe("an approval is for the revision its reviewer read (security audit AUTHZ-2)", () => {
  /** The author swaps the content while a reviewer looks: archive, restore, edit, submit again. */
  const swap = async (id: string) => {
    await withdrawSubmission(asAuthor, id, app);
    await restoreSubmission(asAuthor, id, app);
    const draft = await getDraft(asAuthor, id, app);
    const manifest = draft.files.find((f) => f.path === "ronne.yaml");
    await saveDraftFiles(
      asAuthor,
      id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: (manifest?.content ?? "").replace("House style.", "Something else."),
            executable: false,
            loadedAt: manifest?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(asAuthor, id, app);
  };

  it("refuses an approval of an older revision, and approves the one read", async () => {
    const id = await submitted();
    // The reviewer opens revision 1; the author resubmits as revision 2 meanwhile.
    await swap(id);
    await expect(
      decide(asModerator, id, { decision: "approve", revision: 1 }, app),
    ).rejects.toThrow(RevisionChangedError);
    expect(await status(id)).toBe("submitted");
    expect((await events(id)).filter((e) => e.kind === "approve")).toEqual([]);
    await decide(asModerator, id, { decision: "approve", revision: 2 }, app);
    expect(await status(id)).toBe("approved");
  });

  it("checks only approvals: requesting changes on an older revision still goes", async () => {
    const id = await submitted();
    await swap(id);
    await decide(
      asModerator,
      id,
      { decision: "request_changes", message: "Why?", revision: 1 },
      app,
    );
    expect(await status(id)).toBe("changes_requested");
  });
});

describe("rejecting a dependency (056)", () => {
  /** A bundle depending on @team/style, submitted by `headers`. */
  const dependent = async (name: string, headers = asAuthor) => {
    const draft = await createDraft(headers, { scope: "team", name, type: "bundle" }, app);
    const manifest = draft.files.find((f) => f.path === "ronne.yaml");
    await saveDraftFiles(
      headers,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@team/${name}"\ntype: bundle\ndescription: A set.\ndependencies:\n  "@team/style": "^1.0.0"\n`,
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

  it("lists the open submissions that depend on it, and who may send each back", async () => {
    const style = await submitted();
    const kit = await dependent("kit");
    const mods = await dependent("mods", asModerator);
    expect(
      (await listDependents(asModerator, style, app)).map((d) => [d.id, d.name, d.sendBack]),
    ).toEqual([
      [kit, "@team/kit", { ok: true }],
      [mods, "@team/mods", { ok: false, reason: "Yours: edit or withdraw it." }],
    ]);
    // The author of the dependency sees them, but can't send them back.
    expect((await listDependents(asAuthor, style, app)).every((d) => !d.sendBack.ok)).toBe(true);
  });

  it("rejects, then sends back each it may, approved ones too, with the cause in the audit", async () => {
    const style = await submitted();
    const kit = await dependent("kit");
    const approved = await dependent("approved-kit");
    await decide(asModerator2, approved, { decision: "approve" }, app);
    const mods = await dependent("mods", asModerator);
    const fixing = await dependent("fixing");
    await decide(asModerator2, fixing, { decision: "request_changes", message: "Later." }, app);

    const result = await rejectWithDependents(
      asModerator,
      style,
      { message: "Duplicates @team/lint.", dependents: { message: "Drop @team/style." } },
      app,
    );
    expect(result.rejected.status).toBe("rejected");
    expect(result.dependents.map((d) => [d.id, d.result])).toEqual([
      [kit, "sent_back"],
      [approved, "sent_back"],
      [mods, "skipped"],
      [fixing, "skipped"],
    ]);
    for (const id of [kit, approved]) {
      expect(await status(id)).toBe("changes_requested");
      expect((await events(id)).at(-1)).toMatchObject({
        kind: "request_changes",
        body: "Drop @team/style.",
      });
    }
    expect(await status(mods)).toBe("submitted");
    const caused = (await audited("submission.changes_requested")).filter(
      (e) => (e.metadata as { cause?: unknown }).cause,
    );
    expect(caused.map((e) => [e.targetId, (e.metadata as { cause: unknown }).cause])).toEqual(
      expect.arrayContaining([
        [kit, { rejected: style }],
        [approved, { rejected: style }],
      ]),
    );
  });

  it("leaves the dependents as they are when not asked", async () => {
    const style = await submitted();
    const kit = await dependent("kit");
    const result = await rejectWithDependents(asModerator, style, { message: "No." }, app);
    expect(result.dependents).toEqual([]);
    expect(await status(kit)).toBe("submitted");
  });

  it("requests changes on an approved submission", async () => {
    const id = await submitted();
    await decide(asModerator, id, { decision: "approve" }, app);
    await decide(asModerator, id, { decision: "request_changes", message: "One more thing." }, app);
    expect(await status(id)).toBe("changes_requested");
  });
});
