import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { resolveAs } from "../../items/actions/versions";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { setWorkspaceVisibility } from "../../workspaces/actions/workspaces";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { dependencyReports, findDependencies, searchDependencies } from "./composer";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission } from "./publish";
import { decide } from "./reviews";
import { checkManyDrafts, checkSubmission, submitDraft } from "./submissions";

// The dependency rule of private workspaces (093): an item depends on its own workspace's items
// and on public ones; another private workspace's are refused when picking, at submit and at
// release. To someone who can't see it, a private item stays an unknown name.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let rootId: string;
let pub2: string;
let asRoot: Headers;
let asMember: Headers;
let asAcmeModerator: Headers;
let asOutsider: Headers;
let acmeModeratorId: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const workspace = (name: string, visibility: "public" | "private") =>
  kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name,
    description: `${name}.`,
    visibility,
    createdBy: null,
    createdAt: new Date(),
  });

const released = async (scopeName: string, name: string) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", scopeName)
    .executeTakeFirstOrThrow();
  const itemId = await items.insertItem({
    scopeId: scope.id,
    name,
    type: "skill",
    description: name,
    ownerId: null,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name: `@${scopeName}/${name}`, description: name },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${scopeName}/${name}.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
};

/** An agent draft in `scope` depending on `dependencies`, by `headers`. */
const agentDraft = async (
  headers: Headers,
  scope: string,
  name: string,
  dependencies: readonly string[],
) => {
  const draft = await createDraft(headers, { scope, name, type: "agent" }, app);
  const at = (path: string) => draft.files.find((f) => f.path === path)?.updatedAt ?? null;
  const deps = dependencies.map((d) => `  "${d}": "^1.0.0"`).join("\n");
  await saveDraftFiles(
    headers,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "@${scope}/${name}"\ntype: agent\ndescription: Something.\nagent:\n  prompt: prompt.md\n${deps ? `dependencies:\n${deps}\n` : ""}`,
          executable: false,
          loadedAt: at("ronne.yaml"),
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft.id;
};

const issuesOf = async (headers: Headers, id: string) =>
  (await checkSubmission(headers, id, app, storage))
    .filter((i) => i.code.startsWith("dependency_"))
    .map((i) => `${i.code}: ${i.message}`);

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-private-deps-"));
  storage = localStorage(storageRoot);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  const memberId = await createTestUser(app, { email: "m@example.com", password });
  acmeModeratorId = await createTestUser(app, { email: "am@example.com", password });
  await createTestUser(app, { email: "o@example.com", password });
  const acme = await workspace("acme", "private");
  const beta = await workspace("beta", "private");
  pub2 = await workspace("pub2", "public");
  // The member is in both private workspaces: they see beta's item, and still can't depend on it.
  await setWorkspaceRole(app, memberId, "user", acme);
  await setWorkspaceRole(app, memberId, "user", beta);
  await setWorkspaceRole(app, acmeModeratorId, "moderator", acme);
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("m@example.com");
  asAcmeModerator = await signedIn("am@example.com");
  asOutsider = await signedIn("o@example.com");
  await createScope(asRoot, { name: "team", description: "Public." }, app);
  await createScope(asRoot, { name: "acme-infra", description: "Acme.", workspaceId: acme }, app);
  await createScope(asRoot, { name: "beta-tools", description: "Beta.", workspaceId: beta }, app);
  await createScope(asRoot, { name: "pub-kit", description: "Pub.", workspaceId: pub2 }, app);
  await released("team", "base");
  await released("acme-infra", "deploy");
  await released("beta-tools", "lint");
  await released("pub-kit", "thing");
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

describe("the dependency rule (093)", () => {
  it("lets an item depend on its own workspace's items and public ones", async () => {
    const id = await agentDraft(asMember, "acme-infra", "ok", ["@acme-infra/deploy", "@team/base"]);
    expect(await issuesOf(asMember, id)).toEqual([]);
  });

  it("refuses another private workspace's item at submit, though the submitter sees it", async () => {
    const id = await agentDraft(asMember, "acme-infra", "across", ["@beta-tools/lint"]);
    expect(await issuesOf(asMember, id)).toEqual([
      "dependency_not_visible: @beta-tools/lint is in a private workspace; only its own items can depend on it.",
    ]);
    // A public item can't depend on a private one either.
    const publicOne = await agentDraft(asMember, "team", "leaky", ["@acme-infra/deploy"]);
    expect((await issuesOf(asMember, publicOne))[0]).toMatch(/^dependency_not_visible: /);
  });

  it("gives an outsider an unknown name for a private item, not the rule", async () => {
    const hidden = await agentDraft(asOutsider, "team", "a", ["@acme-infra/deploy"]);
    const unknown = await agentDraft(asOutsider, "team", "b", ["@acme-infra/nothing-here"]);
    const [onHidden] = await issuesOf(asOutsider, hidden);
    const [onUnknown] = await issuesOf(asOutsider, unknown);
    expect(onHidden?.replace("deploy", "X")).toBe(onUnknown?.replace("nothing-here", "X"));
    expect(onHidden).toMatch(/^dependency_not_found: /);
  });

  it("refuses at release a dependency whose workspace turned private after the review", async () => {
    const id = await agentDraft(asMember, "acme-infra", "later", ["@pub-kit/thing"]);
    await submitDraft(asMember, id, app, storage);
    await decide(asAcmeModerator, id, { decision: "approve" }, app);
    // pub2 turns private (by hand: 093's own check refuses it while released items depend on it).
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", pub2)
      .execute();
    await setWorkspaceRole(app, acmeModeratorId, "user", pub2);
    await expect(
      publishSubmission(
        asAcmeModerator,
        id,
        { choice: { kind: "stable", bump: "major" } },
        app,
        storage,
      ),
    ).rejects.toThrow(/private workspace/);
  });

  it("refuses a release whose dependency's workspace turned private while it was packing", async () => {
    const id = await agentDraft(asMember, "acme-infra", "racer", ["@pub-kit/thing"]);
    await submitDraft(asMember, id, app, storage);
    await decide(asAcmeModerator, id, { decision: "approve" }, app);
    // Root turns pub2 private after the release's checks and before its transaction.
    const racing: StorageAdapter = {
      ...storage,
      put: async (path, bytes) => {
        await setWorkspaceVisibility(asRoot, { name: "pub2", visibility: "private" }, app);
        return storage.put(path, bytes);
      },
    };
    await expect(
      publishSubmission(
        asAcmeModerator,
        id,
        { choice: { kind: "stable", bump: "major" } },
        app,
        racing,
      ),
    ).rejects.toThrow(/private workspace/);
    const linked = await t.db.selectFrom("version_dependencies").selectAll().execute();
    expect(linked).toEqual([]);
  });

  it("offers in the pickers only what the item may depend on", async () => {
    const names = (options: { name: string }[]) => options.map((o) => o.name).sort();
    const form = (itemName?: string) =>
      findDependencies(asMember, { type: "agent", q: "", itemName }, app).then(names);
    expect(await form("@acme-infra/new")).toEqual([
      "@acme-infra/deploy",
      "@pub-kit/thing",
      "@team/base",
    ]);
    expect(await form("@beta-tools/new")).toEqual([
      "@beta-tools/lint",
      "@pub-kit/thing",
      "@team/base",
    ]);
    expect(await form("@team/new")).toEqual(["@pub-kit/thing", "@team/base"]);
    expect(await form()).toEqual(["@pub-kit/thing", "@team/base"]);
    const canvas = (itemName?: string) =>
      searchDependencies(asMember, { type: "agent", q: "", itemName }, app).then((page) =>
        names(page.entries),
      );
    expect(await canvas("@acme-infra/new")).toEqual([
      "@acme-infra/deploy",
      "@pub-kit/thing",
      "@team/base",
    ]);
    expect(await canvas("@team/new")).toEqual(["@pub-kit/thing", "@team/base"]);
  });

  it("leaves the person's own unreleased item in another private workspace out of both pickers", async () => {
    await createDraft(asMember, { scope: "beta-tools", name: "wip", type: "skill" }, app);
    const form = (itemName: string) =>
      findDependencies(asMember, { type: "agent", q: "wip", itemName }, app).then((o) =>
        o.map((x) => x.name),
      );
    const canvas = (itemName: string) =>
      searchDependencies(asMember, { type: "agent", q: "wip", itemName }, app).then((p) =>
        p.entries.map((x) => x.name),
      );
    expect(await form("@acme-infra/new")).not.toContain("@beta-tools/wip");
    expect(await canvas("@acme-infra/new")).not.toContain("@beta-tools/wip");
    expect(await form("@beta-tools/new")).toContain("@beta-tools/wip");
    expect(await canvas("@beta-tools/new")).toContain("@beta-tools/wip");
  });

  it("applies the rule in the canvas's reports, for the item's own workspace", async () => {
    const report = async (itemName: string) =>
      JSON.stringify(
        await dependencyReports(
          asMember,
          { itemName, type: "agent", dependencies: { "@beta-tools/lint": "^1.0.0" } },
          app,
        ),
      );
    expect(await report("@acme-infra/x")).toContain("is in a private workspace");
    expect(await report("@beta-tools/x")).not.toContain("is in a private workspace");
  });
});

describe("the dependency rule, on the edges the witnesses found (093)", () => {
  it("keeps an allowed draft in the pickers, however many newer ones another workspace has", async () => {
    await agentDraft(asMember, "acme-infra", "mineacme", []);
    for (let i = 0; i < 13; i += 1) await agentDraft(asMember, "beta-tools", `crowd${i}`, []);
    const form = await findDependencies(
      asMember,
      { type: "agent", q: "", itemName: "@acme-infra/new" },
      app,
    );
    const canvas = await searchDependencies(
      asMember,
      { type: "agent", q: "", itemName: "@acme-infra/new" },
      app,
    );
    for (const names of [form.map((o) => o.name), canvas.entries.map((e) => e.name)]) {
      expect(names).toContain("@acme-infra/mineacme");
      expect(names.some((n) => n.startsWith("@beta-tools/"))).toBe(false);
    }
  });

  it("refuses the person's own submission on its way in another private workspace", async () => {
    const onWay = await agentDraft(asMember, "beta-tools", "onway", []);
    await submitDraft(asMember, onWay, app, storage);
    const id = await agentDraft(asMember, "acme-infra", "uses", ["@beta-tools/onway"]);
    expect((await issuesOf(asMember, id))[0]).toMatch(
      /^dependency_not_visible: @beta-tools\/onway/,
    );
  });

  it("refuses it in a bulk submit, where the dependency is in the same batch", async () => {
    const onWay = await agentDraft(asMember, "beta-tools", "batched", []);
    const id = await agentDraft(asMember, "acme-infra", "batch", ["@beta-tools/batched"]);
    const { drafts } = await checkManyDrafts(
      asMember,
      { ids: [id, onWay], dependencies: true },
      app,
      storage,
    );
    const mine = drafts.find((d) => d.id === id);
    expect(mine?.result).toBe("not_ready");
    expect(JSON.stringify(mine)).toContain("dependency_not_visible");
  });

  it("offers nothing the check would refuse: a visibility that's only nearly public is private", async () => {
    for (const nearly of ["Public", "public ", "PUBLIC"]) {
      await t.db
        .updateTable("workspaces")
        .set({ visibility: nearly as "public" })
        .where("id", "=", pub2)
        .execute();
      const names = (
        await findDependencies(asRoot, { type: "agent", q: "", itemName: "@acme-infra/new" }, app)
      ).map((o) => o.name);
      expect(names, nearly).not.toContain("@pub-kit/thing");
      expect(names, nearly).toContain("@team/base");
    }
  });

  it("offers the person's own published item only where it may be a dependency", async () => {
    await released("beta-tools", "ownedbeta");
    const member = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "m@example.com")
      .executeTakeFirstOrThrow();
    await t.db
      .updateTable("items")
      .set({ owner_id: member.id })
      .where("name", "=", "ownedbeta")
      .execute();
    const offered = async (itemName: string) => {
      const form = (
        await findDependencies(asMember, { type: "agent", q: "ownedbeta", itemName }, app)
      ).map((o) => o.name);
      const canvas = (
        await searchDependencies(asMember, { type: "agent", q: "ownedbeta", itemName }, app)
      ).entries.map((e) => e.name);
      return [form.includes("@beta-tools/ownedbeta"), canvas.includes("@beta-tools/ownedbeta")];
    };
    expect(await offered("@acme-infra/new")).toEqual([false, false]);
    expect(await offered("@beta-tools/new")).toEqual([true, true]);
  });
});

describe("resolving as the caller (093)", () => {
  it("names the public item that asks an outsider for a private one, as for an unknown one", async () => {
    // Old data the rule refuses now: public items depending on a private one and on a missing one.
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const scope = await t.db
      .selectFrom("scopes")
      .select("id")
      .where("name", "=", "team")
      .executeTakeFirstOrThrow();
    const ids = Object.fromEntries(
      await Promise.all(
        ["deploy", "lint"].map(async (name) => [
          name,
          (await items.findByName(name === "deploy" ? "acme-infra" : "beta-tools", name))?.id ?? "",
        ]),
      ),
    );
    const front = async (name: string, dependsOn: string) => {
      const itemId = await items.insertItem({
        scopeId: scope.id,
        name,
        type: "agent",
        description: name,
        ownerId: null,
        createdAt: new Date(),
      });
      const versionId = await items.insertVersion({
        itemId,
        version: "1.0.0",
        manifest: { name: `@team/${name}`, description: name },
        readme: null,
        files: [],
        notes: null,
        artifactPath: `team/${name}.tgz`,
        sha256: "0".repeat(64),
        size: 1,
        publishedBy: rootId,
        publishedAt: new Date(),
        submissionId: null,
        dependencies: [{ itemId: dependsOn, range: "^1.0.0" }],
        riskFlags: [],
      });
      await items.setTag(itemId, "latest", versionId);
    };
    await front("front", ids.deploy ?? "");
    const outsider = (await getCurrentUser(asOutsider, app)) as CurrentUser;
    const member = (await getCurrentUser(asMember, app)) as CurrentUser;
    const failure = async (user: CurrentUser) => {
      try {
        await resolveAs(user, { dependencies: { "@team/front": "^1.0.0" } }, app);
        return "resolved";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(await failure(outsider)).toBe(
      "@acme-infra/deploy isn't a published item (asked for by @team/front@1.0.0).",
    );
    expect(await failure(member)).toBe("resolved");
  });
});
