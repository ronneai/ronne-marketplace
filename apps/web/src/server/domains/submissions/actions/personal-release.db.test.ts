import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, testAppAuth } from "../../identity/testing/test-auth";
import { browseCatalogue } from "../../items/actions/catalogue";
import { createScope } from "../../items/actions/scopes";
import { itemPage } from "../../items/actions/versions";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission } from "./publish";
import { countNeedsReview, decide, listQueue } from "./reviews";
import { submitDraft, submitManyDrafts } from "./submissions";

// Released without review in your own personal workspace (114, decision 3): submitting approves at
// once, as the author's own approval; the release is marked not reviewed; nothing is queued.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asRoot: Headers;
let asAna: Headers;
let ana: CurrentUser;
let mine: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-personal-release-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  asRoot = await signedIn("root@example.com");
  await adminCreateUser(
    asRoot,
    { email: "ana@example.com", name: "Ana", role: "user", password },
    app,
  );
  asAna = await signedIn("ana@example.com");
  ana = (await getCurrentUser(asAna, app)) as CurrentUser;
  mine = (
    await t.db
      .selectFrom("workspaces")
      .select("name")
      .where("id", "=", ana.personal ?? "")
      .executeTakeFirstOrThrow()
  ).name;
  // Its owner creates scopes in it (092's admin).
  await createScope(
    asAna,
    { name: "tools", description: "Ana's tools.", workspaceId: ana.personal ?? "" },
    app,
  );
  await createScope(asRoot, { name: "team", description: "Global's team." }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A rule draft by Ana, `@{scope}/{name}` (`scope` names its workspace), needing these items. */
const drafted = async (
  scope: string,
  name: string,
  needs: Record<string, string> = {},
  as: Headers = asAna,
  body = "Be kind.\n",
) => {
  const draft = await createDraft(as, { scope, name, type: "rule" }, app);
  const full = scope.startsWith("@") ? `${scope}/${name}` : `@${scope}/${name}`;
  const deps = Object.entries(needs)
    .map(([dependency, range]) => `  "${dependency}": "${range}"\n`)
    .join("");
  await saveDraftFiles(
    as,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${full}"\ntype: rule\ndescription: A rule.\nrule:\n  body: rule.md\n  activation: always\n${deps ? `dependencies:\n${deps}` : ""}`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
        {
          path: "rule.md",
          encoding: "utf8",
          content: body,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "rule.md")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft.id;
};

const reviewedOf = async (name: string) =>
  Boolean(
    (
      await t.db
        .selectFrom("item_versions")
        .innerJoin("items", "items.id", "item_versions.item_id")
        .select("item_versions.reviewed")
        .where("items.name", "=", name)
        .executeTakeFirstOrThrow()
    ).reviewed,
  );

const statusOf = async (id: string) =>
  (
    await t.db
      .selectFrom("submissions")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).status;

describe("released without review in your own personal workspace (114)", () => {
  it("is approved when submitted, as the author's own approval, and audited so", async () => {
    const id = await drafted(`@${mine}/tools`, "lint");
    const sent = await submitDraft(asAna, id, app, storage);
    expect(sent.status).toBe("approved");
    // What a reviewer would be shown, shown to its author instead (a rule: nothing risky).
    expect(sent.riskFlags).toEqual([]);
    expect(await statusOf(id)).toBe("approved");
    const kinds = (
      await t.db
        .selectFrom("review_events")
        .select(["kind", "actor_id"])
        .where("submission_id", "=", id)
        .orderBy("created_at")
        .orderBy("id")
        .execute()
    ).map((e) => `${e.kind}:${e.actor_id === ana.id ? "ana" : "?"}`);
    expect(kinds).toEqual(["submit:ana", "self_approve:ana"]);
    const approved = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "submission.approved",
    );
    expect(approved.map((e) => e.metadata)).toEqual([
      { name: `@${mine}/tools/lint`, revision: 1, self: true },
    ]);
  });

  it("approves the drafts it brings along too", async () => {
    await drafted(`@${mine}/tools`, "base");
    const kit = await drafted(`@${mine}/tools`, "kit", { [`@${mine}/tools/base`]: "^0.1.0" });
    const sent = await submitDraft(asAna, kit, app, storage);
    expect([sent.status, ...sent.with.map((m) => m.status)]).toEqual(["approved", "approved"]);
  });

  it("releases its versions marked not reviewed; a shared workspace's stay reviewed", async () => {
    const id = await drafted(`@${mine}/tools`, "lint");
    await submitDraft(asAna, id, app, storage);
    await publishSubmission(asAna, id, { choice: { kind: "stable", bump: "minor" } }, app, storage);
    const shared = await drafted("team", "shared");
    await submitDraft(asAna, shared, app, storage);
    await decide(asRoot, shared, { decision: "approve" }, app);
    await publishSubmission(
      asAna,
      shared,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    expect(await reviewedOf("lint")).toBe(false);
    expect(await reviewedOf("shared")).toBe(true);
    // The card and the item page say it's a personal workspace (115).
    const cards = (await browseCatalogue(asAna, { workspace: mine }, app)).entries;
    expect(cards.map((e) => [e.name, e.personalWorkspace, e.privateWorkspace])).toEqual([
      ["lint", true, true],
    ]);
    const page = await itemPage(
      asAna,
      { workspace: mine, scope: "tools", name: "lint" },
      undefined,
      app,
    );
    expect(page.item.personalWorkspace).toBe(true);
    expect(
      (
        await itemPage(
          asAna,
          { workspace: "global", scope: "team", name: "shared" },
          undefined,
          app,
        )
      ).item.personalWorkspace,
    ).toBe(false);
  });

  it("approves a bulk submit's drafts and the drafts they need, with their risk flags", async () => {
    await drafted(`@${mine}/tools`, "base", {}, asAna, "See https://docs.example.com/x\n");
    const kit = await drafted(`@${mine}/tools`, "kit", { [`@${mine}/tools/base`]: "^0.1.0" });
    const { results } = await submitManyDrafts(asAna, { ids: [kit] }, app, storage);
    const sent = results.map((r) => ({
      name: "submission" in r ? r.submission.name : r.id,
      status: "submission" in r ? r.submission.status : null,
      flags: "riskFlags" in r ? (r.riskFlags ?? []).map((f) => f.kind) : [],
    }));
    expect(sent.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "base", status: "approved", flags: ["network"] },
      { name: "kit", status: "approved", flags: [] },
    ]);
  });

  it("leaves root's own submission in someone's personal workspace to root's override, not reviewed", async () => {
    const id = await drafted(`@${mine}/tools`, "rooted", {}, asRoot);
    expect((await submitDraft(asRoot, id, app, storage)).status).toBe("submitted");
    // Not queued: personal workspaces aren't reviewed.
    expect(await countNeedsReview(asRoot, app)).toBe(0);
    expect(await countNeedsReview(asAna, app)).toBe(0);
    // A reason here too (163): it's still root's override.
    await expect(decide(asRoot, id, { decision: "override" }, app)).rejects.toThrow(
      expect.objectContaining({ name: "ReviewMessageError", reason: "required" }),
    );
    await decide(asRoot, id, { decision: "override", message: "Root's call." }, app);
    await publishSubmission(
      asRoot,
      id,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    expect(await reviewedOf("rooted")).toBe(false);
  });

  it("still needs another reviewer in a shared workspace", async () => {
    const id = await drafted("team", "shared");
    expect((await submitDraft(asAna, id, app, storage)).status).toBe("submitted");
  });

  it("never reaches the review queue", async () => {
    const id = await drafted(`@${mine}/tools`, "lint");
    await submitDraft(asAna, id, app, storage);
    const shared = await drafted("team", "shared");
    await submitDraft(asAna, shared, app, storage);
    for (const tab of ["needs", "waiting", "release", "decided"] as const) {
      const queue = await listQueue(asRoot, { tab }, app);
      expect(
        queue.rows.map((r) => r.name),
        tab,
      ).not.toContain("lint");
      expect(queue.workspaces.map((w) => w.name)).not.toContain(mine);
    }
    expect(await countNeedsReview(asAna, app)).toBe(0);
    expect(await countNeedsReview(asRoot, app)).toBe(1);
  });
});
