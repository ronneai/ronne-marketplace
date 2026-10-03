import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { countMySubmissionsByStatus, listMySubmissions, pageMySubmissions } from "./drafts";

let t: TestDb;
let app: AppAuth;
let asAuthor: Headers;
let asOther: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "other@example.com", password });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asOther = await signedIn("other@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

/** Submissions straight into the table: `name:status:type`, one second apart, oldest first. */
const insert = async (email: string, specs: string[]) => {
  const author = await t.db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", "team")
    .executeTakeFirstOrThrow();
  const start = new Date("2026-10-01T10:00:00Z").getTime();
  const rows = specs.map((spec, i) => {
    const [name = "x", status = "draft", type = "rule"] = spec.split(":");
    const at = toDbDate(new Date(start + i * 1000), t.dialect);
    return {
      id: newId(),
      author_id: author.id,
      scope_id: scope.id,
      name,
      type,
      item_id: null,
      base_version_id: null,
      rebase_conflicts: null,
      status,
      created_at: at,
      updated_at: at,
      submitted_at: status === "draft" ? null : at,
    };
  });
  for (let i = 0; i < rows.length; i += 100)
    await t.db
      .insertInto("submissions")
      .values(rows.slice(i, i + 100))
      .execute();
};

const names = async (query: Parameters<typeof pageMySubmissions>[1], headers = asAuthor) =>
  (await pageMySubmissions(headers, query, app)).rows.map((row) => row.name);

describe("My submissions on the server (063)", () => {
  it("lists only your own, newest change first, without archived unless asked", async () => {
    await insert("author@example.com", [
      "alpha:draft",
      "bravo:submitted",
      "charlie:withdrawn",
      "delta:approved:skill",
    ]);
    await insert("other@example.com", ["theirs:draft"]);
    expect(await names({})).toEqual(["delta", "bravo", "alpha"]);
    expect(await names({ status: "withdrawn" })).toEqual(["charlie"]);
    expect(await names({ status: "submitted" })).toEqual(["bravo"]);
    expect(await names({}, asOther)).toEqual(["theirs"]);
    expect((await pageMySubmissions(asAuthor, {}, app)).total).toEqual({
      count: 3,
      capped: false,
    });
  });

  it("sorts by name either way, and filters by search and type", async () => {
    await insert("author@example.com", ["delta:draft:skill", "alpha:draft", "charlie:draft"]);
    expect(await names({ sort: "name" })).toEqual(["alpha", "charlie", "delta"]);
    expect(await names({ sort: "name", dir: "desc" })).toEqual(["delta", "charlie", "alpha"]);
    expect(await names({ search: "ARL" })).toEqual(["charlie"]);
    expect(await names({ type: "skill" })).toEqual(["delta"]);
    expect(await names({ search: "%" })).toEqual([]);
  });

  it("pages both ways by last change, with no repeat or gap", async () => {
    await insert(
      "author@example.com",
      Array.from({ length: 12 }, (_, i) => `item-${String(i).padStart(2, "0")}:draft`),
    );
    const seen: string[] = [];
    let page = await pageMySubmissions(asAuthor, { size: 5 }, app);
    seen.push(...page.rows.map((r) => r.name));
    while (page.next) {
      page = await pageMySubmissions(asAuthor, { size: 5, cursor: page.next }, app);
      seen.push(...page.rows.map((r) => r.name));
    }
    expect(seen).toEqual(
      Array.from({ length: 12 }, (_, i) => `item-${String(11 - i).padStart(2, "0")}`),
    );
    const back = await pageMySubmissions(asAuthor, { size: 5, cursor: page.previous ?? "" }, app);
    expect(back.rows.map((r) => r.name)).toEqual(seen.slice(5, 10));
  });

  it("counts each status in one query, archived included, for the status links", async () => {
    await insert("author@example.com", [
      "a:draft",
      "b:draft",
      "c:withdrawn",
      "d:published",
      "e:submitted",
    ]);
    await insert("other@example.com", ["x:draft"]);
    expect(await countMySubmissionsByStatus(asAuthor, app)).toEqual({
      draft: 2,
      withdrawn: 1,
      published: 1,
      submitted: 1,
    });
  });

  it("leaves listMySubmissions as it was for the home and new-draft pages", async () => {
    await insert("author@example.com", ["a:draft", "b:withdrawn"]);
    expect((await listMySubmissions(asAuthor, app)).map((s) => s.name)).toEqual(["b", "a"]);
  });
});
