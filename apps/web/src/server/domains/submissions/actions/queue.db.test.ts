import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, saveDraftFiles } from "./drafts";
import { countNeedsReview, decide, listQueue } from "./reviews";
import { submitDraft } from "./submissions";

let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asAuthor: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password, name: "Ada Author" });
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
afterEach(() => t.cleanup());

/** Submits a rule, or a hook (which has a risk flag), with its description written. */
const submitted = async (name: string, type: "rule" | "hook" = "rule", headers = asAuthor) => {
  const draft = await createDraft(headers, { scope: "team", name, type }, app);
  const manifest = draft.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace('description: ""', "description: Something."),
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

const ids = async (tab: "needs" | "waiting" | "decided", headers = asModerator) =>
  (await listQueue(headers, { tab }, app)).rows.map((row) => row.name);

describe("the review queue", () => {
  it("sorts submissions into its three tabs, oldest waiting first", async () => {
    await submitted("first");
    await submitted("second");
    const third = await submitted("third");
    const fourth = await submitted("fourth");
    await createDraft(asAuthor, { scope: "team", name: "draft", type: "rule" }, app);
    await decide(asModerator, third, { decision: "request_changes", message: "Please fix." }, app);
    await decide(asModerator, fourth, { decision: "approve" }, app);

    expect(await ids("needs")).toEqual(["first", "second"]);
    expect(await ids("waiting")).toEqual(["third"]);
    expect(await ids("decided")).toEqual(["fourth"]);
    expect(await countNeedsReview(asModerator, app)).toBe(2);
  });

  it("marks risky submissions, the reviewer's own, and the latest revision", async () => {
    await submitted("style");
    await submitted("fmt", "hook");
    await submitted("mine", "rule", asModerator);
    const rows = (await listQueue(asModerator, { tab: "needs" }, app)).rows;
    expect(rows.map((r) => [r.name, r.risky, r.mine, r.revision, r.authorName])).toEqual([
      ["style", false, false, 1, "Ada Author"],
      ["fmt", true, false, 1, "Ada Author"],
      ["mine", false, true, 1, "Someone"],
    ]);
  });

  it("is for moderators and root only; others see a count of 0", async () => {
    await submitted("style");
    await expect(listQueue(asAuthor, { tab: "needs" }, app)).rejects.toThrow(ForbiddenError);
    expect(await countNeedsReview(asAuthor, app)).toBe(0);
    expect(await countNeedsReview(asRoot, app)).toBe(1);
  });

  it("pages decided submissions, newest change first", async () => {
    const repo = kyselySubmissionRepository(t.db, t.dialect);
    for (const name of ["a", "b", "c"]) {
      const id = await submitted(name);
      await decide(asModerator, id, { decision: "approve" }, app);
    }
    const query = { statuses: ["approved"] as const, order: "newest" as const, limit: 2 };
    const first = await repo.listForReview(query);
    expect(first.map((s) => s.name)).toEqual(["c", "b"]);
    const last = first.at(-1);
    const next = await repo.listForReview({
      ...query,
      after: last ? { updatedAt: last.updatedAt, id: last.id } : undefined,
    });
    expect(next.map((s) => s.name)).toEqual(["a"]);
  });
});
