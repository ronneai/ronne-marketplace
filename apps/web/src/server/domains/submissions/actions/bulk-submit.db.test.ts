import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import type { SubmissionStatus } from "../models/status";
import { createDraft, saveDraftFiles } from "./drafts";
import { checkManyDrafts, submitDraft, submitManyDrafts, submitManyDraftsAs } from "./submissions";

let t: TestDb;
let app: AppAuth;
let asAuthor: Headers;
let asOther: Headers;
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
  const asRoot = await headersFor("root@example.com");
  asAuthor = await headersFor("author@example.com");
  asOther = await headersFor("other@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

/** A rule draft; with `ready`, its template description is written, so it passes 011's checks. */
const draft = async (name: string, ready = true, headers = asAuthor) => {
  const created = await createDraft(headers, { scope: "team", name, type: "rule" }, app);
  if (!ready) return created;
  const manifest = created.files.find((file) => file.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    created.id,
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
  return created;
};

const statusOf = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;
const setStatus = (id: string, status: SubmissionStatus) =>
  t.db.updateTable("submissions").set({ status }).where("id", "=", id).execute();
const submittedEvents = async () =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter(
    (e) => e.action.startsWith("submission.") && e.action.endsWith("submitted"),
  );

describe("checkManyDrafts and submitManyDrafts (052)", () => {
  it("checks without changing anything, saying which are ready and why the others aren't", async () => {
    const ready = await draft("style");
    const missing = await draft("notes", false);
    const { drafts, more } = await checkManyDrafts(asAuthor, { ids: [ready.id, missing.id] }, app);
    expect(more).toBe(0);
    expect(drafts.map((d) => [d.id, d.result])).toEqual([
      [ready.id, "ready"],
      [missing.id, "not_ready"],
    ]);
    const notReady = drafts[1];
    expect(notReady && "issues" in notReady ? notReady.issues : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
    expect([await statusOf(ready.id), await statusOf(missing.id)]).toEqual(["draft", "draft"]);
    expect(await submittedEvents()).toEqual([]);
  });

  it("submits the ready ones, each on its own, and leaves the others as they are", async () => {
    const first = await draft("style");
    const missing = await draft("notes", false);
    const second = await draft("tabs");
    const { results } = await submitManyDrafts(
      asAuthor,
      { ids: [first.id, missing.id, second.id] },
      app,
    );
    expect(results.map((r) => [r.id, r.result])).toEqual([
      [first.id, "submitted"],
      [missing.id, "not_ready"],
      [second.id, "submitted"],
    ]);
    expect(results[0]).toMatchObject({ revision: 1, submission: { status: "submitted" } });
    expect([
      await statusOf(first.id),
      await statusOf(missing.id),
      await statusOf(second.id),
    ]).toEqual(["submitted", "draft", "submitted"]);
    expect(await submittedEvents()).toHaveLength(2);
  });

  it("refuses at submit one that stopped being ready since the check", async () => {
    const mine = await draft("style");
    const theirs = await draft("style", true, asOther);
    expect((await checkManyDrafts(asAuthor, { ids: [mine.id] }, app)).drafts[0]?.result).toBe(
      "ready",
    );
    await submitDraft(asOther, theirs.id, app);
    const [result] = (await submitManyDrafts(asAuthor, { ids: [mine.id] }, app)).results;
    expect(result).toMatchObject({ result: "not_ready" });
    expect(result && "issues" in result ? result.issues.map((i) => i.code) : []).toContain(
      "name_taken",
    );
    expect(await statusOf(mine.id)).toBe("draft");
  });

  it("answers not_found for someone else's and bad ids, and not_submittable for one in review", async () => {
    const theirs = await draft("theirs", true, asOther);
    const inReview = await draft("style");
    await setStatus(inReview.id, "submitted");
    const ids = [theirs.id, "not-an-id", inReview.id];
    for (const run of [checkManyDrafts, submitManyDrafts]) {
      const answer = await run(asAuthor, { ids }, app);
      const rows = "drafts" in answer ? answer.drafts : answer.results;
      expect(rows.map((r) => r.result)).toEqual(["not_found", "not_found", "not_submittable"]);
      expect(JSON.stringify(rows[0])).not.toContain("theirs");
    }
    expect(await statusOf(theirs.id)).toBe("draft");
  });

  it("resubmits one sent back for changes", async () => {
    const back = await draft("style");
    await submitDraft(asAuthor, back.id, app);
    await setStatus(back.id, "changes_requested");
    const [result] = (await submitManyDrafts(asAuthor, { ids: [back.id] }, app)).results;
    expect(result).toMatchObject({ result: "resubmitted", revision: 2 });
    expect(await statusOf(back.id)).toBe("submitted");
  });

  it("takes all of your drafts and ones sent back for changes, and nobody else's", async () => {
    const a = await draft("style");
    const b = await draft("notes", false);
    const back = await draft("tabs");
    await setStatus(back.id, "changes_requested");
    const inReview = await draft("done");
    await setStatus(inReview.id, "submitted");
    await draft("theirs", true, asOther);
    const { drafts } = await checkManyDrafts(asAuthor, { all: true }, app);
    expect(drafts.map((d) => d.id).sort()).toEqual([a.id, b.id, back.id].sort());
  });

  it("names the token in the audit when it came through the API", async () => {
    const ready = await draft("style");
    const user = await getCurrentUser(asAuthor, app);
    if (!user) throw new Error("not signed in");
    await submitManyDraftsAs(
      { user, token: { id: "tok-1", name: "laptop", expiresAt: null } },
      new Headers(),
      { ids: [ready.id] },
      app,
    );
    expect((await submittedEvents())[0]?.metadata).toMatchObject({
      name: "@team/style",
      via: "api",
      tokenId: "tok-1",
      tokenName: "laptop",
    });
  });
});
