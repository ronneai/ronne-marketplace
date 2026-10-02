import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
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

const ids = async (tab: "needs" | "waiting" | "release" | "decided", headers = asModerator) =>
  (await listQueue(headers, { tab }, app)).rows.map((row) => row.name);

describe("the review queue", () => {
  it("sorts submissions into its four tabs, oldest waiting first", async () => {
    await submitted("first");
    await submitted("second");
    const third = await submitted("third");
    const fourth = await submitted("fourth");
    const fifth = await submitted("fifth");
    await createDraft(asAuthor, { scope: "team", name: "draft", type: "rule" }, app);
    await decide(asModerator, third, { decision: "request_changes", message: "Please fix." }, app);
    await decide(asModerator, fourth, { decision: "approve" }, app);
    await decide(asModerator, fifth, { decision: "reject", message: "No." }, app);

    expect(await ids("needs")).toEqual(["first", "second"]);
    expect(await ids("waiting")).toEqual(["third"]);
    // Approved ones wait to be released (055); Decided keeps rejected and published.
    expect(await ids("release")).toEqual(["fourth"]);
    expect(await ids("decided")).toEqual(["fifth"]);
    const [toRelease] = (await listQueue(asModerator, { tab: "release" }, app)).rows;
    expect(toRelease?.approved).toEqual({ by: expect.any(String), at: expect.any(Date) });
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

  it("says which rows this reviewer can approve, as an override for root's own (054)", async () => {
    await submitted("fmt", "hook");
    await submitted("mine", "rule", asModerator);
    await submitted("roots", "rule", asRoot);
    const approvable = async (headers: Headers) =>
      (await listQueue(headers, { tab: "needs" }, app)).rows.map((r) => [
        r.name,
        r.riskKinds,
        r.approvable,
      ]);
    expect(await approvable(asModerator)).toEqual([
      ["fmt", ["hook", "executable"], { approvable: true, override: false }],
      ["mine", [], { approvable: false, reason: "Your own submission" }],
      ["roots", [], { approvable: true, override: false }],
    ]);
    expect((await approvable(asRoot)).map(([name, , a]) => [name, a])).toEqual([
      ["fmt", { approvable: true, override: false }],
      ["mine", { approvable: true, override: false }],
      ["roots", { approvable: true, override: true }],
    ]);
  });

  it("is for moderators and root only; others see a count of 0", async () => {
    await submitted("style");
    await expect(listQueue(asAuthor, { tab: "needs" }, app)).rejects.toThrow(ForbiddenError);
    expect(await countNeedsReview(asAuthor, app)).toBe(0);
    expect(await countNeedsReview(asRoot, app)).toBe(1);
  });

  it("pages decided submissions, newest change first, both ways", async () => {
    for (const name of ["a", "b", "c"]) {
      const id = await submitted(name);
      await decide(asModerator, id, { decision: "reject", message: "No." }, app);
    }
    const first = await listQueue(asModerator, { tab: "decided", size: 2 }, app);
    expect(first.rows.map((s) => s.name)).toEqual(["c", "b"]);
    expect(first.total).toEqual({ count: 3, capped: false });
    const next = await listQueue(
      asModerator,
      { tab: "decided", size: 2, cursor: first.next ?? "" },
      app,
    );
    expect(next.rows.map((s) => s.name)).toEqual(["a"]);
    const back = await listQueue(
      asModerator,
      { tab: "decided", size: 2, cursor: next.previous ?? "" },
      app,
    );
    expect(back.rows.map((s) => s.name)).toEqual(["c", "b"]);
  });
});

describe("the review queue's table (062)", () => {
  /** Submitted rows straight into the table: enough for paging, without files or revisions. */
  const insertSubmitted = async (count: number, start = new Date("2026-10-01T10:00:00Z")) => {
    const author = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "author@example.com")
      .executeTakeFirstOrThrow();
    const scope = await t.db
      .selectFrom("scopes")
      .select("id")
      .where("name", "=", "team")
      .executeTakeFirstOrThrow();
    const rows = Array.from({ length: count }, (_, i) => {
      const at = toDbDate(new Date(start.getTime() + i * 1000), t.dialect);
      return {
        id: newId(),
        author_id: author.id,
        scope_id: scope.id,
        name: `bulk-${String(i).padStart(3, "0")}`,
        type: i % 2 ? "rule" : "skill",
        item_id: null,
        base_version_id: null,
        rebase_conflicts: null,
        status: "submitted",
        created_at: at,
        updated_at: at,
        submitted_at: at,
      };
    });
    for (let i = 0; i < rows.length; i += 100)
      await t.db
        .insertInto("submissions")
        .values(rows.slice(i, i + 100))
        .execute();
  };

  it("pages every open tab, past the old 200-row cut-off", async () => {
    await insertSubmitted(205);
    const names: string[] = [];
    let page = await listQueue(asModerator, { tab: "needs", size: 100 }, app);
    expect(page.total).toEqual({ count: 205, capped: false });
    names.push(...page.rows.map((r) => r.name));
    while (page.next) {
      page = await listQueue(asModerator, { tab: "needs", size: 100, cursor: page.next }, app);
      names.push(...page.rows.map((r) => r.name));
    }
    expect(names).toHaveLength(205);
    expect(names[0]).toBe("bulk-000"); // oldest submitted first
    expect(new Set(names).size).toBe(205);
  });

  it("sorts by name either way, and filters by name, author and type", async () => {
    await insertSubmitted(4);
    const names = async (query: Omit<Parameters<typeof listQueue>[1], "tab">) =>
      (await listQueue(asModerator, { tab: "needs", ...query }, app)).rows.map((r) => r.name);
    expect(await names({ sort: "name", dir: "desc" })).toEqual([
      "bulk-003",
      "bulk-002",
      "bulk-001",
      "bulk-000",
    ]);
    expect(await names({ search: "BULK-002" })).toEqual(["bulk-002"]);
    expect(await names({ type: "rule" })).toEqual(["bulk-001", "bulk-003"]);
    const author = await t.db
      .selectFrom("user")
      .select("name")
      .where("email", "=", "author@example.com")
      .executeTakeFirstOrThrow();
    expect(await names({ search: author.name.toUpperCase() })).toHaveLength(4);
    expect(await names({ search: "%" })).toEqual([]);
  });
});
