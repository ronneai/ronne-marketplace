import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import {
  ScopeMoveSameWorkspaceError,
  ScopeMoveScopeNotFoundError,
  WorkspaceNotFoundError,
} from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../models/workspace";
import {
  askScopeMove,
  cancelScopeMove,
  createWorkspace,
  declineScopeMove,
  moveImpact,
  moveTargets,
  scopeMovesIn,
} from "./workspaces";

// What moving a scope would change and what refuses it (115, task 2): the checks the Move dialog
// shows, and asking and moving run again.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
let asAna: Headers;
let asBob: Headers;
let ana: CurrentUser;
let bob: CurrentUser;
let acme: string;
let vault: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const scope = (name: string, workspaceId: string = GLOBAL_WORKSPACE_ID) =>
  kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name,
    description: `${name}.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });

/** An item in the scope with a released 1.0.0 that needs these items. */
const release = async (
  scopeId: string,
  name: string,
  needs: string[] = [],
  options: { reviewed?: boolean; yanked?: boolean } = {},
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId = await items.insertItem({
    scopeId,
    name,
    type: "skill",
    description: `${name}.`,
    ownerId: null,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name, type: "skill", description: `${name}.`, version: "1.0.0" },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${itemId}.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: rootId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: needs.map((id) => ({ itemId: id, range: "^1.0.0" })),
    riskFlags: [],
    reviewed: options.reviewed ?? true,
  });
  if (options.yanked)
    await t.db
      .updateTable("item_versions")
      .set({ yanked_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", versionId)
      .execute();
  return itemId;
};

/** A submission in the scope, by `authorId`, whose working ronne.yaml needs these names. */
const work = async (
  scopeId: string,
  name: string,
  authorId: string,
  status: string,
  needs: string[] = [],
) => {
  const id = newId();
  const at = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("submissions")
    .values({
      id,
      author_id: authorId,
      scope_id: scopeId,
      name,
      type: "skill",
      item_id: null,
      base_version_id: null,
      rebase_conflicts: null,
      status,
      created_at: at,
      updated_at: at,
      submitted_at: status === "draft" ? null : at,
    })
    .execute();
  const content = `name: "${name}"\ntype: skill\ndescription: x.\n${
    needs.length > 0 ? `dependencies:\n${needs.map((n) => `  "${n}": "^1.0.0"\n`).join("")}` : ""
  }`;
  await t.db
    .insertInto("submission_files")
    .values({
      submission_id: id,
      path: "ronne.yaml",
      encoding: "utf8",
      content,
      size: content.length,
      executable: 0,
      updated_at: at,
    } as never)
    .execute();
  return id;
};

/** Root as a user, for its personal workspace. */
const root_ = () => ({ personal: rootPersonal }) as CurrentUser;
let rootPersonal: string | null = null;

const personalOf = async (user: CurrentUser) =>
  (await t.db
    .selectFrom("workspaces")
    .select(["id", "name"])
    .where("id", "=", user.personal ?? "")
    .executeTakeFirstOrThrow()) as { id: string; name: string };

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  asRoot = await signedIn("root@example.com");
  rootPersonal = ((await getCurrentUser(asRoot, app)) as CurrentUser).personal ?? null;
  for (const email of ["ana@example.com", "bob@example.com"])
    await adminCreateUser(asRoot, { email, name: email, role: "user", password }, app);
  asAna = await signedIn("ana@example.com");
  asBob = await signedIn("bob@example.com");
  ana = (await getCurrentUser(asAna, app)) as CurrentUser;
  bob = (await getCurrentUser(asBob, app)) as CurrentUser;
  acme = (await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app)).id;
  vault = (
    await createWorkspace(
      asRoot,
      { name: "vault", description: "Vault.", visibility: "private" },
      app,
    )
  ).id;
});
afterEach(() => t.cleanup());

describe("moveImpact (115)", () => {
  it("gives the items' new names, and refuses a clash or a bad name, which a new name fixes", async () => {
    const infra = await scope("infra");
    await release(infra, "deploy");
    const plain = await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app);
    expect(plain).toMatchObject({
      scope: { name: "infra", workspace: "global" },
      target: { name: "acme", visibility: "public", global: false, personal: false },
      name: "infra",
      items: [{ from: "@infra/deploy", to: "@acme/infra/deploy" }],
      clash: false,
      refused: false,
    });
    await scope("infra", acme);
    const clash = await moveImpact(asRoot, { scopeId: infra, to: "ACME" }, app);
    expect(clash).toMatchObject({ clash: true, refused: true });
    const renamed = await moveImpact(
      asRoot,
      { scopeId: infra, to: "acme", name: "@Infra-Tools" },
      app,
    );
    expect(renamed).toMatchObject({
      name: "infra-tools",
      clash: false,
      refused: false,
      items: [{ from: "@infra/deploy", to: "@acme/infra-tools/deploy" }],
    });
    const bad = await moveImpact(asRoot, { scopeId: infra, to: "acme", name: "no good" }, app);
    expect(bad).toMatchObject({ nameProblem: "characters", refused: true });
  });

  it("refuses new names that are another item's old name, naming only those the asker sees", async () => {
    const infra = await scope("infra");
    await release(infra, "deploy");
    await release(infra, "lint");
    const elsewhere = await release(await scope("misc"), "other");
    const hidden = await release(await scope("secret", vault), "hidden");
    const at = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("item_aliases")
      .values([
        { name: "@acme/infra/deploy", item_id: elsewhere, reason: "rename", created_at: at },
        { name: "@acme/infra/lint", item_id: hidden, reason: "rename", created_at: at },
      ])
      .execute();
    // Ana administers global, so she may move its scope; she isn't in vault.
    await setWorkspaceRole(app, ana.id, "admin");
    const asked = await moveImpact(asAna, { scopeId: infra, to: "acme" }, app);
    expect(asked).toMatchObject({
      aliasTaken: ["@acme/infra/deploy"],
      aliasHidden: 1,
      refused: true,
    });
    const root = await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app);
    expect(root.aliasTaken).toEqual(["@acme/infra/deploy", "@acme/infra/lint"]);
  });

  it("refuses a private target while released items outside it depend on the scope's", async () => {
    const infra = await scope("infra");
    const deploy = await release(infra, "deploy");
    const team = await scope("team");
    await release(team, "app", [deploy]);
    // Inside the scope, or yanked, doesn't count; neither does an item already in the target.
    await release(infra, "kit", [deploy]);
    await release(team, "old", [deploy], { yanked: true });
    await release(await scope("vault-tools", vault), "inside", [deploy]);
    expect(await moveImpact(asRoot, { scopeId: infra, to: "vault" }, app)).toMatchObject({
      outsideDependents: ["@team/app"],
      fewerSee: true,
      refused: true,
    });
    expect(await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app)).toMatchObject({
      outsideDependents: [],
      fewerSee: false,
      refused: false,
    });
  });

  it("refuses a scope whose own versions or submissions depend on another private workspace", async () => {
    // Ana's personal workspace: tools needs her other scope's base, private and not the target.
    const mine = await personalOf(ana);
    const tools = await scope("tools", mine.id);
    const base = await release(await scope("other", mine.id), "base");
    await release(tools, "lint", [base]);
    await work(tools, "fmt", ana.id, "submitted", [`@${mine.name}/other/base`]);
    // A draft isn't checked: Submit checks it.
    await work(tools, "wip", ana.id, "draft", [`@${mine.name}/other/base`]);
    // Public dependencies are fine anywhere.
    await release(tools, "uses-public", [await release(await scope("pub"), "pub")]);
    const impact = await moveImpact(asAna, { scopeId: tools, to: "acme" }, app);
    expect(impact.ownDependencies).toEqual([
      { item: `@${mine.name}/tools/fmt`, dependency: `@${mine.name}/other/base` },
      { item: `@${mine.name}/tools/lint`, dependency: `@${mine.name}/other/base` },
    ]);
    expect(impact.refused).toBe(true);
    // Out of a personal workspace nobody loses sight.
    expect(impact.fewerSee).toBe(false);
  });

  it("warns of open submissions outside that depend on the scope, with a private target only", async () => {
    const infra = await scope("infra");
    await release(infra, "deploy");
    const team = await scope("team");
    await work(team, "app", bob.id, "submitted", ["@infra/deploy"]);
    await work(team, "draft-only", bob.id, "draft", ["@infra/deploy"]);
    const intoVault = await moveImpact(asRoot, { scopeId: infra, to: "vault" }, app);
    expect(intoVault).toMatchObject({ openDependents: ["@team/app"], refused: false });
    expect((await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app)).openDependents).toEqual(
      [],
    );
  });

  it("lists open work by people who aren't the target's members, and not-reviewed versions", async () => {
    const infra = await scope("infra");
    await release(infra, "deploy", [], { reviewed: false });
    await release(infra, "kit");
    await setWorkspaceRole(app, bob.id, "user", acme);
    await work(infra, "by-ana", ana.id, "draft");
    await work(infra, "by-bob", bob.id, "submitted");
    await work(infra, "by-root", rootId, "approved");
    await work(infra, "gone", ana.id, "withdrawn");
    const impact = await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app);
    expect(impact.notMembers).toEqual([{ item: "@infra/by-ana", author: "ana@example.com" }]);
    expect(impact.notReviewed).toEqual(["@infra/deploy@1.0.0"]);
    // Not-reviewed versions don't refuse it: they make it a request (task 3).
    expect(impact.refused).toBe(false);
  });

  it("is asked by root or the scope's workspace's admins, a personal workspace's owner included", async () => {
    const infra = await scope("infra");
    await expect(moveImpact(new Headers(), { scopeId: infra, to: "acme" }, app)).rejects.toThrow(
      ForbiddenError,
    );
    // Everyone administers their own personal workspace (114); a scope elsewhere is as if it
    // didn't exist.
    await expect(moveImpact(asBob, { scopeId: infra, to: "acme" }, app)).rejects.toThrow(
      ScopeMoveScopeNotFoundError,
    );
    // An admin elsewhere, not of the scope's workspace: the same.
    await setWorkspaceRole(app, bob.id, "admin", acme);
    await expect(moveImpact(asBob, { scopeId: infra, to: "acme" }, app)).rejects.toThrow(
      ScopeMoveScopeNotFoundError,
    );
    await setWorkspaceRole(app, bob.id, "admin");
    expect((await moveImpact(asBob, { scopeId: infra, to: "acme" }, app)).target.name).toBe("acme");
    const mine = await personalOf(ana);
    const tools = await scope("tools", mine.id);
    expect((await moveImpact(asAna, { scopeId: tools, to: "global" }, app)).target.global).toBe(
      true,
    );
    await expect(moveImpact(asAna, { scopeId: newId(), to: "acme" }, app)).rejects.toThrow(
      ScopeMoveScopeNotFoundError,
    );
  });

  it("offers neither the scope's own workspace, nor one the asker doesn't see, nor someone else's personal one", async () => {
    const infra = await scope("infra");
    await setWorkspaceRole(app, ana.id, "admin");
    await expect(moveImpact(asAna, { scopeId: infra, to: "global" }, app)).rejects.toThrow(
      ScopeMoveSameWorkspaceError,
    );
    await expect(moveImpact(asAna, { scopeId: infra, to: "vault" }, app)).rejects.toThrow(
      WorkspaceNotFoundError,
    );
    await expect(moveImpact(asAna, { scopeId: infra, to: "nowhere" }, app)).rejects.toThrow(
      WorkspaceNotFoundError,
    );
    const bobs = await personalOf(bob);
    for (const asker of [asAna, asRoot])
      await expect(moveImpact(asker, { scopeId: infra, to: bobs.name }, app)).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    // Her own personal workspace is listed as Personal.
    const own = await moveImpact(asAna, { scopeId: infra, to: (await personalOf(ana)).name }, app);
    expect(own.target).toMatchObject({ personal: true, visibility: "private" });
    expect(own.fewerSee).toBe(true);
  });

  it("names nothing the asker can't see: hidden dependents, submissions, dependencies and drafts are counted", async () => {
    // Ana administers global and is in vault; secret is private without her, and Bob's personal
    // workspace is his.
    await setWorkspaceRole(app, ana.id, "admin");
    await setWorkspaceRole(app, ana.id, "user", vault);
    const secret = (
      await createWorkspace(
        asRoot,
        { name: "secret", description: "Secret.", visibility: "private" },
        app,
      )
    ).id;
    const bobs = await personalOf(bob);
    const infra = await scope("infra");
    const deploy = await release(infra, "deploy");
    const hush = await scope("hush", secret);
    await release(hush, "hidden-dep", [deploy]);
    await release(await scope("bobstuff", bobs.id), "bob-private", [deploy]);
    await release(await scope("team"), "seen-dep", [deploy]);
    await work(hush, "hidden-sub", bob.id, "submitted", ["@infra/deploy"]);
    const hiddenItem = await release(hush, "x");
    void hiddenItem;
    await work(infra, "bobs", bob.id, "submitted", ["@secret/hush/x"]);
    await work(infra, "bobs-draft", bob.id, "draft");
    const asAnaSees = await moveImpact(asAna, { scopeId: infra, to: "vault" }, app);
    expect(asAnaSees).toMatchObject({
      outsideDependents: ["@team/seen-dep"],
      outsideHidden: 2,
      openDependents: [],
      openHidden: 1,
      ownDependencies: [],
      ownHidden: 1,
      notMembers: [{ item: "@infra/bobs", author: "bob@example.com" }],
      notMembersHidden: 1,
      refused: true,
    });
    const asRootSees = await moveImpact(asRoot, { scopeId: infra, to: "vault" }, app);
    expect(asRootSees).toMatchObject({
      outsideHidden: 0,
      openDependents: ["@secret/hush/hidden-sub"],
      ownDependencies: [{ item: "@infra/bobs", dependency: "@secret/hush/x" }],
      ownHidden: 0,
      notMembersHidden: 0,
    });
    expect(asRootSees.outsideDependents).toEqual([
      `@${bobs.name}/bobstuff/bob-private`,
      "@secret/hush/hidden-dep",
      "@team/seen-dep",
    ]);
  });

  it("refuses, for anyone but root, a dependency nobody has, as it would a hidden one", async () => {
    await setWorkspaceRole(app, ana.id, "admin");
    const infra = await scope("infra");
    await work(infra, "dangling", bob.id, "submitted", ["@nowhere/x"]);
    expect(await moveImpact(asAna, { scopeId: infra, to: "acme" }, app)).toMatchObject({
      ownHidden: 1,
      refused: true,
    });
    expect(await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app)).toMatchObject({
      ownHidden: 0,
      refused: false,
    });
  });

  it("allows dependencies on the scope's own items and on the private target's", async () => {
    const infra = await scope("infra");
    const deploy = await release(infra, "deploy");
    const vaultItem = await release(await scope("vault-tools", vault), "base");
    await release(infra, "uses-vault", [vaultItem]);
    await release(infra, "uses-own", [deploy]);
    await work(infra, "sub-own", rootId, "submitted", ["@infra/deploy"]);
    await work(infra, "sub-vault", rootId, "submitted", ["@vault/vault-tools/base"]);
    const intoVault = await moveImpact(asRoot, { scopeId: infra, to: "vault" }, app);
    expect(intoVault).toMatchObject({ ownDependencies: [], ownHidden: 0, refused: false });
    // Into acme, vault's item would be out of sight: refused.
    expect((await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app)).ownDependencies).toEqual(
      [
        { item: "@infra/sub-vault", dependency: "@vault/vault-tools/base" },
        { item: "@infra/uses-vault", dependency: "@vault/vault-tools/base" },
      ],
    );
  });

  it("moves a scope back where it came from: its items' own old names don't refuse it", async () => {
    const infra = await scope("infra");
    const deploy = await release(infra, "deploy");
    await t.db
      .insertInto("item_aliases")
      .values({
        name: "@acme/infra/deploy",
        item_id: deploy,
        reason: "move",
        created_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    expect(await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app)).toMatchObject({
      aliasTaken: [],
      aliasHidden: 0,
      refused: false,
    });
  });

  it("runs the name, alias, member and review checks the same with a private target", async () => {
    const infra = await scope("infra");
    const deploy = await release(infra, "deploy", [], { reviewed: false });
    await work(infra, "by-bob", bob.id, "submitted");
    await scope("infra", vault);
    const elsewhere = await release(await scope("misc"), "other");
    await t.db
      .insertInto("item_aliases")
      .values({
        name: "@vault/infra-2/deploy",
        item_id: elsewhere,
        reason: "rename",
        created_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    void deploy;
    expect(await moveImpact(asRoot, { scopeId: infra, to: "vault" }, app)).toMatchObject({
      clash: true,
      notMembers: [{ item: "@infra/by-bob", author: "bob@example.com" }],
      notReviewed: ["@infra/deploy@1.0.0"],
      refused: true,
    });
    expect(
      await moveImpact(asRoot, { scopeId: infra, to: "vault", name: "infra-2" }, app),
    ).toMatchObject({ clash: false, aliasTaken: ["@vault/infra-2/deploy"], refused: true });
    await setWorkspaceRole(app, bob.id, "user", vault);
    expect(
      (await moveImpact(asRoot, { scopeId: infra, to: "vault", name: "infra-3" }, app)).notMembers,
    ).toEqual([]);
  });

  it("says the owner loses sight when root moves their personal scope where they aren't", async () => {
    const tools = await scope("tools", (await personalOf(bob)).id);
    expect((await moveImpact(asRoot, { scopeId: tools, to: "vault" }, app)).fewerSee).toBe(true);
    await setWorkspaceRole(app, bob.id, "user", vault);
    expect((await moveImpact(asRoot, { scopeId: tools, to: "vault" }, app)).fewerSee).toBe(false);
    expect((await moveImpact(asRoot, { scopeId: tools, to: "acme" }, app)).fewerSee).toBe(false);
  });

  it("finds the target by its exact name only", async () => {
    const infra = await scope("infra");
    for (const to of ["acme\0", "acmé", "ＡＣＭＥ", "ac me", ""])
      await expect(moveImpact(asRoot, { scopeId: infra, to }, app), to).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    expect((await moveImpact(asRoot, { scopeId: infra, to: " ACME " }, app)).target.name).toBe(
      "acme",
    );
  });

  it("judges a dependency still in review by where it is, as its release will (056, 112)", async () => {
    // Ana's personal scope: b needs a, both in review, submitted together.
    const mine = await personalOf(ana);
    const tools = await scope("tools", mine.id);
    await work(tools, "a", ana.id, "submitted");
    await work(tools, "b", ana.id, "submitted", [`@${mine.name}/tools/a`]);
    // And a public item in review elsewhere, by Bob.
    await work(await scope("pub", acme), "new", bob.id, "submitted");
    await work(tools, "uses-new", ana.id, "submitted", ["@acme/pub/new"]);
    expect(await moveImpact(asAna, { scopeId: tools, to: "acme" }, app)).toMatchObject({
      ownDependencies: [],
      ownHidden: 0,
      refused: false,
    });
    // One in review in a private workspace she doesn't see counts, as a name nobody has does.
    await work(await scope("hush", vault), "secret", bob.id, "submitted");
    await work(tools, "uses-secret", ana.id, "submitted", ["@vault/hush/secret"]);
    expect(await moveImpact(asAna, { scopeId: tools, to: "acme" }, app)).toMatchObject({
      ownHidden: 1,
      refused: true,
    });
  });

  it("refuses for an outside dependent the asker only sees counted", async () => {
    await setWorkspaceRole(app, ana.id, "admin");
    await setWorkspaceRole(app, ana.id, "user", vault);
    const infra = await scope("infra");
    const deploy = await release(infra, "deploy");
    await release(await scope("bobstuff", (await personalOf(bob)).id), "bobs", [deploy]);
    expect(await moveImpact(asAna, { scopeId: infra, to: "vault" }, app)).toMatchObject({
      outsideDependents: [],
      outsideHidden: 1,
      refused: true,
    });
  });

  it("treats someone else's draft as a name nobody has, so it doesn't show", async () => {
    await setWorkspaceRole(app, ana.id, "admin");
    await setWorkspaceRole(app, ana.id, "user", vault);
    const s0 = await scope("s0");
    await work(await scope("vs", vault), "bdraft", bob.id, "draft");
    await work(s0, "uses-draft", ana.id, "submitted", ["@vault/vs/bdraft"]);
    const drafty = await moveImpact(asAna, { scopeId: s0, to: "acme" }, app);
    expect(drafty).toMatchObject({ ownDependencies: [], ownHidden: 1, refused: true });
    await t.db
      .updateTable("submissions")
      .set({ status: "submitted" })
      .where("name", "=", "bdraft")
      .execute();
    expect(await moveImpact(asAna, { scopeId: s0, to: "acme" }, app)).toMatchObject({
      ownDependencies: [{ item: "@s0/uses-draft", dependency: "@vault/vs/bdraft" }],
      ownHidden: 0,
    });
  });

  it("offers the workspaces the asker sees, theirs first, and says how the move would happen (task 5)", async () => {
    await setWorkspaceRole(app, ana.id, "admin");
    const infra = await scope("infra");
    const mine = await personalOf(ana);
    const offered = await moveTargets(asAna, { scopeId: infra }, app);
    expect(offered.map((w) => [w.name, w.personal])).toEqual([
      [mine.name, true],
      ["acme", false],
    ]);
    const root = await moveTargets(asRoot, { scopeId: infra }, app);
    // Root's own personal workspace, never someone else's; every shared one; not global, its own.
    expect(root.map((w) => w.name)).toEqual([(await personalOf(root_())).name, "acme", "vault"]);
    expect(await moveImpact(asAna, { scopeId: infra, to: "acme" }, app)).toMatchObject({
      way: "request",
      answeredBy: "admins",
    });
    expect(await moveImpact(asAna, { scopeId: infra, to: mine.name }, app)).toMatchObject({
      way: "once",
      answeredBy: null,
    });
    expect(await moveImpact(asRoot, { scopeId: infra, to: "acme" }, app)).toMatchObject({
      way: "twice",
    });
    const tools = await scope("tools", mine.id);
    await release(tools, "lint", [], { reviewed: false });
    expect(await moveImpact(asAna, { scopeId: tools, to: "global" }, app)).toMatchObject({
      way: "request",
      answeredBy: "root",
    });
  });

  it("gives each scope's latest open or declined move, to the workspace's admins only (task 5)", async () => {
    await setWorkspaceRole(app, ana.id, "admin");
    const infra = await scope("infra");
    const done = await scope("done");
    const asked = await askScopeMove(asAna, { scopeId: infra, to: "acme" }, app);
    const declined = await askScopeMove(asAna, { scopeId: done, to: "acme" }, app);
    await declineScopeMove(asRoot, { moveId: declined.moveId, reason: "No." }, app);
    const moves = await scopeMovesIn(asAna, { workspaceId: GLOBAL_WORKSPACE_ID }, app);
    expect(Object.keys(moves).sort()).toEqual([done, infra].sort());
    expect(moves[infra]).toMatchObject({ id: asked.moveId, status: "open", toWorkspace: "acme" });
    expect(moves[done]).toMatchObject({ status: "declined", reason: "No." });
    expect(await scopeMovesIn(asBob, { workspaceId: GLOBAL_WORKSPACE_ID }, app)).toEqual({});
    // Cancelled, it's gone from the row.
    await cancelScopeMove(asAna, { moveId: asked.moveId }, app);
    expect(
      Object.keys(await scopeMovesIn(asAna, { workspaceId: GLOBAL_WORKSPACE_ID }, app)),
    ).toEqual([done]);
  });
});
