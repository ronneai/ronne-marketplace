import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import {
  ItemMoveItemNotFoundError,
  ItemMoveSameScopeError,
  ItemMoveScopeNotFoundError,
} from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import { kyselyWorkspaceRepository } from "../repositories/kysely-workspace-repository";
import { itemMoveImpact } from "../services/item-moves";
import { createWorkspace } from "./workspaces";

// What moving an item to another scope of its workspace would change, and what refuses it (134,
// task 3): the target, the new name, its clashes, the open work that would take the new name.
const password = "correct horse battery";

let t: TestDb;
let app: AppAuth;
let rootId: string;
const who: Record<"root" | "ana" | "mod" | "bob", CurrentUser> = {} as never;
let acme: string;
let infra: string;
let devops: string;
let deploy: string;

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const scope = (name: string, workspaceId: string) =>
  kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name,
    description: `${name}.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });

const item = (scopeId: string, name: string) =>
  kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertItem({
    scopeId,
    name,
    type: "skill",
    description: `${name}.`,
    ownerId: null,
    createdAt: new Date(),
  });

/** A submission in the scope, with this ronne.yaml: a new item's unless it changes `itemId`. */
const submission = async (input: {
  scopeId: string;
  name: string;
  status: string;
  author: string;
  itemId?: string;
  manifest: string;
}) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("submissions")
    .values({
      id,
      author_id: input.author,
      scope_id: input.scopeId,
      name: input.name,
      type: "skill",
      item_id: input.itemId ?? null,
      base_version_id: null,
      rebase_conflicts: null,
      status: input.status,
      created_at: now,
      updated_at: now,
      submitted_at: input.status === "draft" ? null : now,
    })
    .execute();
  await t.db
    .insertInto("submission_files")
    .values({
      submission_id: id,
      path: "ronne.yaml",
      encoding: "utf8",
      content: input.manifest,
      size: input.manifest.length,
      executable: 0,
      updated_at: now,
    } as never)
    .execute();
  return id;
};

const yaml = (name: string, dependencies: string[] = []) =>
  `name: "${name}"\ntype: skill\ndescription: It.\n${
    dependencies.length > 0
      ? `dependencies:\n${dependencies.map((d) => `  "${d}": ^1.0.0\n`).join("")}`
      : ""
  }`;

const impact = (user: CurrentUser, itemId: string, toScopeId: string) =>
  itemMoveImpact(
    kyselyWorkspaceRepository(t.db, t.dialect),
    { user, ip: null },
    {
      itemId,
      toScopeId,
    },
  );

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  const asRoot = await signedIn("root@example.com");
  for (const name of ["ana", "mod", "bob"] as const)
    await adminCreateUser(
      asRoot,
      { email: `${name}@example.com`, name, role: "user", password },
      app,
    );
  acme = (await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app)).id;
  infra = await scope("infra", acme);
  devops = await scope("devops", acme);
  deploy = await item(infra, "deploy");
  const ids = await t.db.selectFrom("user").select(["id", "email"]).execute();
  const idOf = (email: string) => ids.find((u) => u.email === email)?.id ?? "";
  await setWorkspaceRole(app, idOf("ana@example.com"), "user", acme);
  await setWorkspaceRole(app, idOf("mod@example.com"), "moderator", acme);
  for (const name of ["root", "ana", "mod", "bob"] as const)
    who[name] = (await getCurrentUser(await signedIn(`${name}@example.com`), app)) as CurrentUser;
});
afterEach(() => t.cleanup());

describe("itemMoveImpact (134)", () => {
  it("gives the new name, and moves at once for root and moderators, asks for anyone else", async () => {
    for (const [name, way] of [
      ["root", "now"],
      ["mod", "now"],
      ["ana", "request"],
    ] as const)
      expect(await impact(who[name], deploy, devops), name).toMatchObject({
        item: { id: deploy, fullName: "@acme/infra/deploy" },
        target: { id: devops, name: "devops" },
        newName: "@acme/devops/deploy",
        clash: null,
        way,
        refused: false,
      });
  });

  it("writes global's names short", async () => {
    const tools = await scope("tools", GLOBAL_WORKSPACE_ID);
    const kit = await scope("kit", GLOBAL_WORKSPACE_ID);
    const lint = await item(tools, "lint");
    // Every user is in global: Bob asks.
    expect(await impact(who.bob, lint, kit)).toMatchObject({
      item: { fullName: "@tools/lint" },
      newName: "@kit/lint",
      way: "request",
    });
  });

  it("moves at once in the owner's personal workspace, for them and root; not found to anyone else", async () => {
    const personal = who.ana.personal ?? "";
    expect(personal).not.toBe("");
    const notes = await scope("notes", personal);
    const drafts = await scope("drafts", personal);
    const idea = await item(drafts, "idea");
    for (const name of ["ana", "root"] as const)
      expect(await impact(who[name], idea, notes), name).toMatchObject({
        newName: expect.stringMatching(/\/notes\/idea$/),
        way: "now",
        refused: false,
      });
    for (const name of ["mod", "bob"] as const)
      await expect(impact(who[name], idea, notes), name).rejects.toThrow(ItemMoveItemNotFoundError);
  });

  it("answers as not found to someone outside the workspace, and for an item that isn't there", async () => {
    await expect(impact(who.bob, deploy, devops)).rejects.toThrow(ItemMoveItemNotFoundError);
    await expect(impact(who.root, newId(), devops)).rejects.toThrow(ItemMoveItemNotFoundError);
  });

  it("refuses a scope of another workspace, one that isn't there, and the item's own", async () => {
    const elsewhere = await scope("devops", GLOBAL_WORKSPACE_ID);
    await expect(impact(who.root, deploy, elsewhere)).rejects.toThrow(ItemMoveScopeNotFoundError);
    await expect(impact(who.root, deploy, newId())).rejects.toThrow(ItemMoveScopeNotFoundError);
    await expect(impact(who.root, deploy, infra)).rejects.toThrow(ItemMoveSameScopeError);
  });

  it("refuses a name taken by an item of the target scope", async () => {
    await item(devops, "deploy");
    expect(await impact(who.mod, deploy, devops)).toMatchObject({ clash: "item", refused: true });
  });

  it("refuses a name an open submission of a new item would take, not a draft's or a proposal's", async () => {
    const other = await item(devops, "other");
    for (const status of ["draft", "withdrawn", "rejected"])
      await submission({
        scopeId: devops,
        name: "deploy",
        status,
        author: rootId,
        manifest: yaml("@acme/devops/deploy"),
      });
    await submission({
      scopeId: devops,
      name: "deploy",
      status: "submitted",
      author: rootId,
      itemId: other,
      manifest: yaml("@acme/devops/deploy"),
    });
    expect(await impact(who.mod, deploy, devops)).toMatchObject({ clash: null });
    for (const status of ["submitted", "changes_requested", "approved"]) {
      const id = await submission({
        scopeId: devops,
        name: "deploy",
        status,
        author: rootId,
        manifest: yaml("@acme/devops/deploy"),
      });
      expect(await impact(who.mod, deploy, devops), status).toMatchObject({
        clash: "submission",
        refused: true,
      });
      await t.db.deleteFrom("submissions").where("id", "=", id).execute();
    }
  });

  it("refuses another item's old name, and not the item's own (it moves back)", async () => {
    const other = await item(devops, "other");
    const alias = (itemId: string) =>
      t.db
        .insertInto("item_aliases")
        .values({
          name: "@acme/devops/deploy",
          item_id: itemId,
          reason: "move",
          created_at: toDbDate(new Date(), t.dialect),
        })
        .execute();
    await alias(other);
    expect(await impact(who.mod, deploy, devops)).toMatchObject({ clash: "alias", refused: true });
    await t.db.deleteFrom("item_aliases").execute();
    // Moved to devops before: its infra name is its own old name, so it moves back.
    await t.db.updateTable("items").set({ scope_id: devops }).where("id", "=", deploy).execute();
    await t.db
      .insertInto("item_aliases")
      .values({
        name: "@acme/infra/deploy",
        item_id: deploy,
        reason: "move",
        created_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    expect(await impact(who.mod, deploy, infra)).toMatchObject({
      item: { fullName: "@acme/devops/deploy" },
      newName: "@acme/infra/deploy",
      clash: null,
      refused: false,
    });
  });

  it("counts its own open work and names the workspace's dependents, other people's drafts counted", async () => {
    const lint = await item(devops, "lint");
    const anaId = who.ana.id;
    // Its own proposal and draft: they take the new name.
    for (const status of ["draft", "submitted"])
      await submission({
        scopeId: infra,
        name: "deploy",
        status,
        author: anaId,
        itemId: deploy,
        manifest: yaml("@acme/infra/deploy"),
      });
    // Lint's proposal in review depends on it; root's draft of a new item too; Ana's own draft.
    await submission({
      scopeId: devops,
      name: "lint",
      status: "submitted",
      author: rootId,
      itemId: lint,
      manifest: yaml("@acme/devops/lint", ["@acme/infra/deploy"]),
    });
    await submission({
      scopeId: devops,
      name: "wip",
      status: "draft",
      author: rootId,
      manifest: yaml("@acme/devops/wip", ["@acme/infra/deploy"]),
    });
    await submission({
      scopeId: devops,
      name: "mine",
      status: "draft",
      author: anaId,
      manifest: yaml("@acme/devops/mine", ["@acme/infra/deploy"]),
    });
    // Not about it: another dependency, and a released or rejected submission.
    await submission({
      scopeId: devops,
      name: "else",
      status: "submitted",
      author: rootId,
      manifest: yaml("@acme/devops/else", ["@acme/devops/lint"]),
    });
    await submission({
      scopeId: devops,
      name: "old",
      status: "rejected",
      author: rootId,
      manifest: yaml("@acme/devops/old", ["@acme/infra/deploy"]),
    });
    expect(await impact(who.ana, deploy, devops)).toMatchObject({
      proposals: 2,
      dependents: ["@acme/devops/lint", "@acme/devops/mine"],
      dependentsHidden: 1,
    });
    expect(await impact(who.root, deploy, devops)).toMatchObject({
      proposals: 2,
      dependents: ["@acme/devops/lint", "@acme/devops/mine", "@acme/devops/wip"],
      dependentsHidden: 0,
    });
  });

  it("refuses nobody's move for open work: it only takes the new name", async () => {
    await submission({
      scopeId: infra,
      name: "deploy",
      status: "approved",
      author: rootId,
      itemId: deploy,
      manifest: yaml("@acme/infra/deploy"),
    });
    expect(await impact(who.mod, deploy, devops)).toMatchObject({ proposals: 1, refused: false });
  });
});
