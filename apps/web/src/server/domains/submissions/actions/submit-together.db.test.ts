import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { SubmissionInvalidError } from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import type { SubmissionRepository } from "../repositories/submission-repository";
import * as service from "../services/submissions";
import { submitGroups } from "../services/submit-group";
import { createDraft, saveDraftFiles } from "./drafts";
import { decide } from "./reviews";
import { checkManyDrafts, checkSubmitGroup, submitDraft, submitManyDrafts } from "./submissions";

// Submitting together (112): an item with the author's own drafts it needs, all or none.
let t: TestDb;
let app: AppAuth;
let asAuthor: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(
    await signedIn("root@example.com"),
    { name: "team", description: "A team." },
    app,
  );
});
afterEach(() => t.cleanup());

/** A bundle draft depending on `names`; with `ready: false`, its description is left empty. */
const bundle = async (name: string, names: string[], ready = true) => {
  const created = await createDraft(asAuthor, { scope: "team", name, type: "bundle" }, app);
  const manifest = created.files.find((file) => file.path === "ronne.yaml");
  await saveDraftFiles(
    asAuthor,
    created.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "@team/${name}"\ntype: bundle\ndescription: ${ready ? "A set." : '""'}\ndependencies:\n${names.map((n) => `  "@team/${n}": "^1.0.0"\n`).join("")}`,
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return created.id;
};

/** A rule draft, ready to submit: the end of a chain. */
const rule = async (name: string) => {
  const created = await createDraft(asAuthor, { scope: "team", name, type: "rule" }, app);
  const manifest = created.files.find((file) => file.path === "ronne.yaml");
  await saveDraftFiles(
    asAuthor,
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
  return created.id;
};

/** `@team/<name>` 1.0.0, released as a release leaves it (only what the checks read). */
const released = async (name: string) => {
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", "team")
    .executeTakeFirstOrThrow();
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const owner = await t.db.selectFrom("user").select("id").limit(1).executeTakeFirstOrThrow();
  const itemId = await items.insertItem({
    scopeId: scope.id,
    name,
    type: "rule",
    description: "Released.",
    ownerId: owner.id,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name: `@team/${name}`, type: "rule", description: "Released." },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `team/${name}/1.0.0.tgz`,
    sha256: "a".repeat(64),
    size: 10,
    publishedBy: owner.id,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
};

const statusOf = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;
const submitted = async () =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter(
    (e) => e.action === "submission.submitted",
  );

describe("Submit takes the item's own drafts with it (112)", () => {
  it("submits a chain A → B → C → D from A, dependencies first, in one go", async () => {
    const d = await rule("d");
    const c = await bundle("c", ["d"]);
    const b = await bundle("b", ["c"]);
    const a = await bundle("a", ["b"]);
    const group = await checkSubmitGroup(asAuthor, a, app);
    expect(group.ready).toBe(true);
    expect(group.members.map((m) => m.id).sort()).toEqual([a, b, c, d].sort());
    expect(group.members.map((m) => m.id)).toEqual([d, c, b, a]);
    expect(group.neededBy.get(b)).toEqual(["@team/a"]);

    const sent = await submitDraft(asAuthor, a, app);
    expect(sent).toMatchObject({ id: a, status: "submitted", revision: 1 });
    expect(sent.with.map((m) => m.id).sort()).toEqual([b, c, d].sort());
    expect(await Promise.all([a, b, c, d].map(statusOf))).toEqual([
      "submitted",
      "submitted",
      "submitted",
      "submitted",
    ]);
    expect(await submitted()).toHaveLength(4);
  });

  it("submits two drafts that need each other from either one", async () => {
    const a = await bundle("a", ["b"]);
    const b = await bundle("b", ["a"]);
    expect((await checkSubmitGroup(asAuthor, b, app)).ready).toBe(true);
    const sent = await submitDraft(asAuthor, b, app);
    expect(sent.with.map((m) => m.id)).toEqual([a]);
    expect([await statusOf(a), await statusOf(b)]).toEqual(["submitted", "submitted"]);
  });

  it("submits none of them when one isn't ready, and says which", async () => {
    const c = await bundle("c", ["a"], false);
    const b = await bundle("b", ["c"]);
    const a = await bundle("a", ["b"]);
    const group = await checkSubmitGroup(asAuthor, a, app);
    expect(group.ready).toBe(false);
    const item = group.members.find((m) => m.id === a);
    expect(item && "issues" in item ? item.issues : []).toContainEqual(
      expect.objectContaining({
        code: "group_member_not_ready",
        message: "@team/c isn't ready: fix its errors first.",
      }),
    );
    const refused = await submitDraft(asAuthor, a, app).catch((error) => error);
    expect(refused).toBeInstanceOf(SubmissionInvalidError);
    expect(await Promise.all([a, b, c].map(statusOf))).toEqual(["draft", "draft", "draft"]);
    expect(await submitted()).toEqual([]);
  });

  it("submits none of them when one fails inside the transaction", async () => {
    const b = await bundle("b", ["a"]);
    const a = await bundle("a", ["b"]);
    const repo = kyselySubmissionRepository(t.db, t.dialect, UNFILTERED);
    let revisions = 0;
    // The second revision fails, after the first member was already sent.
    const failing: SubmissionRepository = {
      ...repo,
      transaction: (work) =>
        repo.transaction((inner) =>
          work({
            ...inner,
            createRevision: async (...args) => {
              if (++revisions === 2) throw new Error("The disk is full.");
              return inner.createRevision(...args);
            },
          }),
        ),
    };
    await expect(
      service.submitDraft(
        { repo: failing },
        { user: await getCurrentUser(asAuthor, app), ip: null },
        a,
      ),
    ).rejects.toThrow("The disk is full.");
    expect(revisions).toBe(2);
    expect([await statusOf(a), await statusOf(b)]).toEqual(["draft", "draft"]);
    expect(await submitted()).toEqual([]);
  });
});

describe("What a group takes, and what it refuses (112)", () => {
  it("leaves out a draft of a dependency already released or on its way", async () => {
    await released("shipped");
    const shippedDraft = await rule("shipped");
    const onItsWay = await rule("waiting");
    await submitDraft(asAuthor, onItsWay, app);
    const waitingDraft = await rule("waiting");
    const item = await bundle("item", ["shipped", "waiting"]);
    const group = await checkSubmitGroup(asAuthor, item, app);
    expect(group.members.map((m) => m.id)).toEqual([item]);
    expect(group.ready).toBe(true);
    await submitDraft(asAuthor, item, app);
    expect([await statusOf(shippedDraft), await statusOf(waitingDraft)]).toEqual([
      "draft",
      "draft",
    ]);
  });

  it("doesn't join a selected draft to an item that doesn't need it any more (bulk)", async () => {
    await released("shipped");
    const shippedDraft = await bundle("shipped", ["nowhere"], false);
    const item = await bundle("item", ["shipped"]);
    const { results } = await submitManyDrafts(asAuthor, { ids: [item, shippedDraft] }, app);
    expect(Object.fromEntries(results.map((r) => [r.id, r.result]))).toEqual({
      [item]: "submitted",
      [shippedDraft]: "not_ready",
    });
  });

  it("resolves a name to the selected draft, not a newer one of the same name", async () => {
    const y = await bundle("y", ["x"]);
    const x1 = await bundle("x", ["y"]);
    await bundle("x", ["y"]);
    const sent = await submitDraft(asAuthor, x1, app);
    expect(sent.with.map((m) => m.id)).toEqual([y]);
  });

  it("sends the rest when a draft brought in was submitted meanwhile", async () => {
    const c = await rule("c");
    const a = await bundle("a", ["c"]);
    const repo = kyselySubmissionRepository(t.db, t.dialect, UNFILTERED);
    const actor = { user: await getCurrentUser(asAuthor, app), ip: null };
    const [group] = await submitGroups(repo, actor, [a]);
    expect(group?.ids).toEqual([c, a]);
    // Another tab sends c between the group and the transaction.
    await submitDraft(asAuthor, c, app);
    const result = await repo.transaction((inner) =>
      service.sendGroup({ repo }, inner, actor, group?.ids ?? [], new Date(), new Set([a])),
    );
    expect(result.ok && result.sent.map((m) => m.id)).toEqual([a]);
    expect([await statusOf(a), await statusOf(c)]).toEqual(["submitted", "submitted"]);
  });

  it("refuses two drafts of one name in a group", async () => {
    const shared = await bundle("shared", ["twin"]);
    const first = await bundle("twin", ["shared"]);
    const second = await bundle("twin", ["shared"]);
    const { results } = await submitManyDrafts(asAuthor, { ids: [first, second] }, app);
    expect(Object.fromEntries(results.map((r) => [r.id, r.result]))).toEqual({
      [shared]: "not_ready",
      [first]: "not_ready",
      [second]: "not_ready",
    });
    // The one that comes second says why; the others wait on it.
    expect(results.flatMap((r) => ("issues" in r ? r.issues : []))).toContainEqual(
      expect.objectContaining({
        code: "name_taken",
        message: "@team/twin is in this group twice: submit one of its drafts.",
      }),
    );
    expect(await Promise.all([shared, first, second].map(statusOf))).toEqual([
      "draft",
      "draft",
      "draft",
    ]);
  });

  it("takes a draft added to an item sent back for changes when it's resubmitted", async () => {
    const base = await rule("base");
    const item = await bundle("item", ["base"]);
    await submitDraft(asAuthor, item, app);
    await decide(
      asModerator,
      item,
      { decision: "request_changes", message: "Add the new one." },
      app,
    );
    const added = await rule("added");
    const current = (await t.db
      .selectFrom("submission_files")
      .select(["content", "updated_at"])
      .where("submission_id", "=", item)
      .where("path", "=", "ronne.yaml")
      .executeTakeFirstOrThrow()) as { content: string; updated_at: unknown };
    await saveDraftFiles(
      asAuthor,
      item,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `${current.content}  "@team/added": "^1.0.0"\n`,
            executable: false,
            loadedAt: null,
          },
        ],
        deletes: [],
        overwrite: true,
      },
      app,
    );
    expect((await checkSubmitGroup(asAuthor, item, app)).members.map((m) => m.id)).toEqual([
      added,
      item,
    ]);
    await submitDraft(asAuthor, item, app);
    expect([await statusOf(item), await statusOf(added), await statusOf(base)]).toEqual([
      "submitted",
      "submitted",
      "submitted",
    ]);
  });

  it("refuses a group past the limit, with why, rather than cutting it", async () => {
    const names = Array.from({ length: 100 }, (_, i) => `part-${i}`);
    for (const name of names)
      await createDraft(asAuthor, { scope: "team", name, type: "rule" }, app);
    const item = await bundle("big", names);
    const group = await checkSubmitGroup(asAuthor, item, app);
    expect(group.members).toHaveLength(101);
    const big = group.members.find((m) => m.id === item);
    expect(big && "issues" in big ? big.issues : []).toContainEqual(
      expect.objectContaining({
        code: "group_too_large",
        message:
          "It goes with 100 of your drafts, more than 99 at once: submit some of what it needs first.",
      }),
    );
    // Each says so once, without naming every other member as a blocker.
    for (const member of group.members) {
      const issues = "issues" in member ? member.issues : [];
      expect(issues.filter((i) => i.code === "group_too_large")).toHaveLength(1);
      expect(issues.filter((i) => i.code === "group_member_not_ready")).toEqual([]);
    }
    await expect(submitDraft(asAuthor, item, app)).rejects.toThrow(SubmissionInvalidError);
    expect(await statusOf(item)).toBe("draft");
  });
});

describe("Submitting many goes in groups (112)", () => {
  it("joins groups that share a draft, and leaves a group that isn't ready behind whole", async () => {
    const shared = await bundle("shared", ["first"]);
    const first = await bundle("first", ["shared"]);
    const second = await bundle("second", ["shared"]);
    const broken = await bundle("broken", ["lonely"], false);
    const lonely = await bundle("lonely", ["broken"]);
    const alone = await bundle("alone", ["first"]);

    const { drafts } = await checkManyDrafts(asAuthor, { ids: [first, second, lonely] }, app);
    expect(Object.fromEntries(drafts.map((d) => [d.id, d.result]))).toEqual({
      [first]: "ready",
      [second]: "ready",
      [shared]: "ready",
      [lonely]: "not_ready",
      [broken]: "not_ready",
    });

    const { results } = await submitManyDrafts(asAuthor, { ids: [first, second, lonely] }, app);
    expect(Object.fromEntries(results.map((r) => [r.id, r.result]))).toEqual({
      [first]: "submitted",
      [second]: "submitted",
      [shared]: "submitted",
      [lonely]: "not_ready",
      [broken]: "not_ready",
    });
    const held = results.find((r) => r.id === lonely);
    expect(held && "issues" in held ? held.issues : []).toContainEqual(
      expect.objectContaining({ message: "@team/broken isn't ready: fix its errors first." }),
    );
    expect([await statusOf(lonely), await statusOf(broken), await statusOf(alone)]).toEqual([
      "draft",
      "draft",
      "draft",
    ]);
  });
});
