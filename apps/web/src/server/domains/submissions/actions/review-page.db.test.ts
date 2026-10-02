import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { SubmissionNotFoundError } from "../exceptions/errors";
import { createDraft, getDraft, saveDraftFiles } from "./drafts";
import { decide, getReview } from "./reviews";
import { submitDraft } from "./submissions";

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAuthor: Headers;
let asOther: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password, name: "Ada Author" });
  await createTestUser(app, { email: "other@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asOther = await signedIn("other@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

const write = async (id: string, path: string, content: string) => {
  const current = (await getDraft(asAuthor, id, app)).files.find((f) => f.path === path);
  await saveDraftFiles(
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

/** A hook submitted by the author, so it has a risk flag. */
const submittedHook = async () => {
  const draft = await createDraft(asAuthor, { scope: "team", name: "fmt", type: "hook" }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml")?.content ?? "";
  await write(draft.id, "ronne.yaml", manifest.replace('description: ""', "description: Formats."));
  await submitDraft(asAuthor, draft.id, app);
  return draft.id;
};

describe("getReview", () => {
  it("shows a reviewer the latest revision, its risk flags and checks, and what they may do", async () => {
    const id = await submittedHook();
    const view = await getReview(asModerator, id, app);
    expect(view.submission).toMatchObject({
      name: "fmt",
      status: "submitted",
      authorName: "Ada Author",
    });
    expect(view.current?.number).toBe(1);
    expect(view.previous).toBeNull();
    expect(view.changes.every((c) => c.status === "added")).toBe(true);
    expect(view.flags.map((f) => f.kind)).toEqual(["hook", "executable"]);
    expect(view.issues).toEqual([]);
    expect(view.events.map((e) => e.kind)).toEqual(["submit"]);
    expect(view.can).toEqual({
      decide: true,
      override: false,
      comment: true,
      publish: false,
      sendBack: false,
    });
  });

  it("diffs against the previous revision after a resubmit", async () => {
    const id = await submittedHook();
    await decide(
      asModerator,
      id,
      { decision: "request_changes", message: "Quote the event." },
      app,
    );
    await write(id, "hook.sh", "#!/bin/sh\necho formatted\n");
    await submitDraft(asAuthor, id, app);

    const view = await getReview(asModerator, id, app);
    expect(view.current?.number).toBe(2);
    expect(view.previous).toBe(1);
    expect(view.changes.map((c) => [c.path, c.status])).toEqual([["hook.sh", "changed"]]);
    expect(view.unreleased).toEqual([]);
  });

  it("leaves the canvas layout out of the diff, and says it changed", async () => {
    const id = await submittedHook();
    await decide(asModerator, id, { decision: "request_changes", message: "Tidy up." }, app);
    await write(id, ".ronne/layout.json", '{"version":1,"nodes":{}}\n');
    await submitDraft(asAuthor, id, app);

    const view = await getReview(asModerator, id, app);
    expect(view.changes).toEqual([]);
    expect(view.unreleased).toEqual([".ronne/layout.json"]);
    // It's still one of the submission's files, under All files.
    expect(view.current?.files.map((f) => f.path)).toContain(".ronne/layout.json");
  });

  it("gives the author their own view, without decisions, and no one else any", async () => {
    const id = await submittedHook();
    const own = await getReview(asAuthor, id, app);
    expect(own.mine).toBe(true);
    expect(own.can).toEqual({
      decide: false,
      override: false,
      comment: true,
      publish: false,
      sendBack: false,
    });
    await expect(getReview(asOther, id, app)).rejects.toThrow(SubmissionNotFoundError);

    const draft = await createDraft(asAuthor, { scope: "team", name: "wip", type: "rule" }, app);
    await expect(getReview(asModerator, draft.id, app)).rejects.toThrow(SubmissionNotFoundError);
  });

  it("offers root an override on its own submission, and closes the conversation once decided", async () => {
    const draft = await createDraft(asRoot, { scope: "team", name: "roots", type: "rule" }, app);
    const manifest = draft.files.find((f) => f.path === "ronne.yaml");
    await saveDraftFiles(
      asRoot,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: (manifest?.content ?? "").replace('description: ""', "description: Mine."),
            executable: false,
            loadedAt: manifest?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(asRoot, draft.id, app);
    expect((await getReview(asRoot, draft.id, app)).can).toEqual({
      decide: false,
      override: true,
      comment: true,
      publish: false,
      sendBack: false,
    });
    await decide(asModerator, draft.id, { decision: "reject", message: "No." }, app);
    expect((await getReview(asModerator, draft.id, app)).can.comment).toBe(false);
  });
});
