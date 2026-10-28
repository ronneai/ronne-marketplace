import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { listAuditEvents } from "../../audit/actions/audit";
import { adminEraseUser } from "../../identity/actions/erase-user";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { proposeChange } from "../../submissions/actions/proposals";
import { publishSubmission } from "../../submissions/actions/publish";
import { decide } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import { ItemMovedError } from "../../submissions/exceptions/errors";
import { ownItem } from "../../submissions/services/publish";
import {
  InvalidItemMoveTextError,
  ItemMoveAnsweredError,
  ItemMoveAskerLostRoleError,
  ItemMoveItemNotFoundError,
  ItemMoveNotFoundError,
  ItemMoveOpenError,
  ItemMoveRefusedError,
  ItemMoveTargetMovedError,
} from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import { kyselyWorkspaceRepository } from "../repositories/kysely-workspace-repository";
import * as itemMoves from "../services/item-moves";
import {
  approveItemMove,
  askItemMove,
  askScopeMove,
  cancelItemMove,
  createWorkspace,
  declineItemMove,
  setWorkspaceVisibility,
} from "./workspaces";

// Asking, answering and moving an item to another scope of its workspace (134, task 4): who
// decides, the checks again at approval, the move itself, and what may not happen at the same time.
const password = "correct horse battery";

let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
const as: Record<"root" | "ana" | "mod" | "adm" | "bob", Headers> = {} as never;
const who: Record<"root" | "ana" | "mod" | "adm" | "bob", CurrentUser> = {} as never;
let acme: string;
let beta: string;
let infra: string;
let devops: string;

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const scopeIn = async (name: string, workspaceId: string) =>
  (await createScope(as.root, { name, description: `${name}.`, workspaceId }, app)).id;

/** Root's draft of `@acme/<scope>/<name>`, needing these items, saved and returned by id. */
const drafted = async (scope: string, name: string, needs: string[] = []) => {
  const draft = await createDraft(as.root, { scope: `@acme/${scope}`, name, type: "skill" }, app);
  const dependencies =
    needs.length > 0 ? `dependencies:\n${needs.map((n) => `  "${n}": ^1.0.0\n`).join("")}` : "";
  await saveDraftFiles(
    as.root,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "@acme/${scope}/${name}"\ntype: skill\ndescription: It.\n${dependencies}`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: `---\nname: ${name}\ndescription: It.\n---\nDo it.\n`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "SKILL.md")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft.id;
};

/** Released by root as 1.0.0 (an override: root's own); returns the item's id. */
const released = async (scope: string, name: string) => {
  const id = await drafted(scope, name);
  await submitDraft(as.root, id, app, storage);
  await decide(as.root, id, { decision: "override" }, app);
  await publishSubmission(as.root, id, { choice: { kind: "stable", bump: "minor" } }, app, storage);
  return (
    await t.db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .select("items.id")
      .where("items.name", "=", name)
      .where("scopes.name", "=", scope)
      .executeTakeFirstOrThrow()
  ).id;
};

/** Root's change proposal of the item's 1.0.0, with its SKILL.md changed, submitted and approved. */
const approvedProposal = async (item: string) => {
  const proposal = await proposeChange(as.root, { item, version: "1.0.0" }, app, storage);
  await saveDraftFiles(
    as.root,
    proposal.id,
    {
      writes: [
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: "---\nname: deploy\ndescription: It.\n---\nDo it better.\n",
          executable: false,
          loadedAt: proposal.files.find((f) => f.path === "SKILL.md")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(as.root, proposal.id, app, storage);
  await decide(as.root, proposal.id, { decision: "override" }, app);
  return proposal.id;
};

const itemRow = (id: string) =>
  t.db
    .selectFrom("items")
    .select(["scope_id", "name"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

const moveRow = (id: string) =>
  t.db.selectFrom("item_moves").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const revision = async () =>
  Number(
    (await sql<{ revision: number }>`select revision from catalogue_revision`.execute(t.db)).rows[0]
      ?.revision ?? 0,
  );

const history = (itemId: string) =>
  t.db
    .selectFrom("item_name_history")
    .select(["old_name", "new_name", "reason", "requested_by", "decided_by", "source_id"])
    .where("item_id", "=", itemId)
    .execute();

/** Takes the user out of the workspace, as 092's Remove does. */
const removeWorkspaceRole = (_app: AppAuth, userId: string, workspaceId: string) =>
  t.db
    .deleteFrom("workspace_members")
    .where("user_id", "=", userId)
    .where("workspace_id", "=", workspaceId)
    .execute();

const ask = (headers: Headers, itemId: string, toScopeId = devops, message?: string) =>
  askItemMove(headers, { itemId, toScopeId, message }, app);

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-item-moves-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  as.root = await signedIn("root@example.com");
  for (const name of ["ana", "mod", "adm", "bob"] as const)
    await adminCreateUser(
      as.root,
      { email: `${name}@example.com`, name, role: "user", password },
      app,
    );
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  beta = (await createWorkspace(as.root, { name: "beta", description: "Beta." }, app)).id;
  const ids = await t.db.selectFrom("user").select(["id", "email"]).execute();
  const idOf = (name: string) => ids.find((u) => u.email === `${name}@example.com`)?.id ?? "";
  await setWorkspaceRole(app, idOf("ana"), "user", acme);
  await setWorkspaceRole(app, idOf("mod"), "moderator", acme);
  await setWorkspaceRole(app, idOf("adm"), "admin", acme);
  for (const name of ["root", "ana", "mod", "adm", "bob"] as const) {
    as[name] = await signedIn(`${name}@example.com`);
    who[name] = (await getCurrentUser(as[name], app)) as CurrentUser;
  }
  infra = await scopeIn("infra", acme);
  devops = await scopeIn("devops", acme);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

describe("asking to move an item, and moving it (134)", () => {
  it("moves at once for root, moderators and admins: new name, old name kept, history, audit", async () => {
    const deploy = await released("infra", "deploy");
    const before = await revision();
    const done = await ask(as.mod, deploy);
    expect(done.outcome).toBe("moved");
    expect(await itemRow(deploy)).toEqual({ scope_id: devops, name: "deploy" });
    expect(await revision()).toBeGreaterThan(before);
    const alias = await t.db
      .selectFrom("item_aliases")
      .select(["item_id", "reason"])
      .where("name", "=", "@acme/infra/deploy")
      .executeTakeFirstOrThrow();
    expect(alias).toEqual({ item_id: deploy, reason: "move" });
    expect(await moveRow(done.moveId)).toMatchObject({
      status: "approved",
      requested_by: who.mod.id,
      decided_by: who.mod.id,
      from_scope_id: infra,
      to_scope_id: devops,
    });
    expect(await history(deploy)).toEqual([
      {
        old_name: "@acme/infra/deploy",
        new_name: "@acme/devops/deploy",
        reason: "move_item",
        requested_by: who.mod.id,
        decided_by: who.mod.id,
        source_id: done.moveId,
      },
    ]);
    expect((await events("item.moved"))[0]?.metadata).toEqual({
      name: "@acme/infra/deploy",
      newName: "@acme/devops/deploy",
      from: "@acme/infra",
      to: "@acme/devops",
      askedBy: who.mod.id,
      approvedBy: who.mod.id,
      direct: true,
    });
    // Its versions are untouched: the same row, checksum and tarball.
    const versions = await t.db
      .selectFrom("item_versions")
      .select(["version", "sha256", "artifact_path"])
      .where("item_id", "=", deploy)
      .execute();
    expect(versions).toHaveLength(1);
    for (const name of ["adm", "root"] as const) {
      const other = await released("infra", `kit-${name}`);
      expect((await ask(as[name], other)).outcome, name).toBe("moved");
    }
  });

  it("asks for a regular member, answered by the moderators, admins or root, never the asker", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy, devops, "  It belongs with devops.  ");
    expect(asked.outcome).toBe("requested");
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "open",
      message: "It belongs with devops.",
      decided_at: null,
    });
    expect(await itemRow(deploy)).toMatchObject({ scope_id: infra });
    expect(await history(deploy)).toEqual([]);
    expect((await events("item.move_requested"))[0]?.metadata).toMatchObject({
      name: "@acme/infra/deploy",
      to: "@acme/devops",
    });
    // Not the asker, nor anyone outside the workspace.
    for (const headers of [as.ana, as.bob])
      await expect(approveItemMove(headers, { moveId: asked.moveId }, app)).rejects.toThrow(
        ItemMoveNotFoundError,
      );
    expect((await approveItemMove(as.mod, { moveId: asked.moveId }, app)).outcome).toBe("moved");
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "approved",
      decided_by: who.mod.id,
    });
    expect(await itemRow(deploy)).toMatchObject({ scope_id: devops });
    expect(await history(deploy)).toEqual([
      expect.objectContaining({
        reason: "move_item",
        requested_by: who.ana.id,
        decided_by: who.mod.id,
        source_id: asked.moveId,
      }),
    ]);
    expect((await events("item.moved"))[0]?.metadata).toMatchObject({ direct: false });
    // A second answer.
    await expect(approveItemMove(as.adm, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveAnsweredError,
    );
  });

  it("answers as not found to someone outside the workspace, and to a removed member", async () => {
    const deploy = await released("infra", "deploy");
    await expect(ask(as.bob, deploy)).rejects.toThrow(ItemMoveItemNotFoundError);
    // Ana's session still says she's in acme: her role is read again.
    await removeWorkspaceRole(app, who.ana.id, acme);
    await expect(ask(as.ana, deploy)).rejects.toThrow(ItemMoveItemNotFoundError);
    expect(await t.db.selectFrom("item_moves").selectAll().execute()).toEqual([]);
  });

  it("asks, not moves, for a moderator demoted", async () => {
    const deploy = await released("infra", "deploy");
    await setWorkspaceRole(app, who.mod.id, "user", acme);
    expect((await ask(as.mod, deploy)).outcome).toBe("requested");
  });

  it("refuses a clash at ask, and at approval leaves the request open", async () => {
    const deploy = await released("infra", "deploy");
    await released("devops", "lint");
    const lint = await released("infra", "lint");
    await expect(ask(as.mod, lint)).rejects.toThrow(ItemMoveRefusedError);
    expect(await t.db.selectFrom("item_moves").selectAll().execute()).toEqual([]);
    const asked = await ask(as.ana, deploy);
    await released("devops", "deploy");
    await expect(approveItemMove(as.mod, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveRefusedError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
    expect(await itemRow(deploy)).toMatchObject({ scope_id: infra });
  });

  it("keeps one open move per item", async () => {
    const deploy = await released("infra", "deploy");
    await ask(as.ana, deploy);
    const other = await scopeIn("other", acme);
    await expect(ask(as.ana, deploy, other)).rejects.toThrow(ItemMoveOpenError);
    // Even a moderator's direct move waits for it to be answered or cancelled.
    await expect(ask(as.mod, deploy, other)).rejects.toThrow(ItemMoveOpenError);
  });

  it("declines with a reason, and is cancelled by its asker or an answerer, not by others", async () => {
    const deploy = await released("infra", "deploy");
    const first = await ask(as.ana, deploy);
    await expect(declineItemMove(as.ana, { moveId: first.moveId }, app)).rejects.toThrow(
      ItemMoveNotFoundError,
    );
    await declineItemMove(as.mod, { moveId: first.moveId, reason: " Keep it in infra. " }, app);
    expect(await moveRow(first.moveId)).toMatchObject({
      status: "declined",
      reason: "Keep it in infra.",
      decided_by: who.mod.id,
    });
    await expect(cancelItemMove(as.ana, { moveId: first.moveId }, app)).rejects.toThrow(
      ItemMoveAnsweredError,
    );
    const second = await ask(as.ana, deploy);
    await expect(cancelItemMove(as.bob, { moveId: second.moveId }, app)).rejects.toThrow(
      ItemMoveNotFoundError,
    );
    await cancelItemMove(as.ana, { moveId: second.moveId }, app);
    const third = await ask(as.ana, deploy);
    await cancelItemMove(as.adm, { moveId: third.moveId }, app);
    expect((await moveRow(third.moveId)).status).toBe("cancelled");
    expect(await events("item.move_declined")).toHaveLength(1);
    expect(await events("item.move_cancelled")).toHaveLength(2);
    // The message and reason stay out of the audit log.
    for (const e of [
      ...(await events("item.move_declined")),
      ...(await events("item.move_requested")),
    ])
      expect(JSON.stringify(e.metadata)).not.toContain("infra.");
  });

  it("refuses a message or a reason over 500 characters", async () => {
    const deploy = await released("infra", "deploy");
    await expect(ask(as.ana, deploy, devops, "x".repeat(501))).rejects.toThrow(
      InvalidItemMoveTextError,
    );
    const asked = await ask(as.ana, deploy, devops, "x".repeat(500));
    await expect(
      declineItemMove(as.mod, { moveId: asked.moveId, reason: "y".repeat(501) }, app),
    ).rejects.toThrow(InvalidItemMoveTextError);
  });

  it("cancels a request whose asker left the workspace, at approval", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await removeWorkspaceRole(app, who.ana.id, acme);
    await expect(approveItemMove(as.mod, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveAskerLostRoleError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "cancelled",
      reason: "asker_lost_role",
    });
    expect(await itemRow(deploy)).toMatchObject({ scope_id: infra });
  });

  it("cancels a request whose target scope moved to another workspace, at approval", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await askScopeMove(as.root, { scopeId: devops, to: "beta", confirm: "devops" }, app);
    const error = await approveItemMove(as.mod, { moveId: asked.moveId }, app).catch((e) => e);
    expect(error).toBeInstanceOf(ItemMoveTargetMovedError);
    // Named in full where the answerer sees it: beta is public.
    expect(error.scopeName).toBe("@beta/devops");
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "cancelled",
      reason: "target_moved",
    });
    expect(await itemRow(deploy)).toMatchObject({ scope_id: infra });
    expect(beta).not.toBe(acme);
  });

  it("never names a private workspace the answerer can't see when the target moved into it", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await askScopeMove(as.root, { scopeId: devops, to: "beta", confirm: "devops" }, app);
    await setWorkspaceVisibility(as.root, { name: "beta", visibility: "private" }, app);
    const error = await approveItemMove(as.mod, { moveId: asked.moveId }, app).catch((e) => e);
    expect(error).toBeInstanceOf(ItemMoveTargetMovedError);
    expect(error.scopeName).toBe("@acme/devops");
    expect(error.message).not.toContain("beta");
  });

  it("lets a demoted moderator answer nothing", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await setWorkspaceRole(app, who.mod.id, "user", acme);
    await expect(approveItemMove(as.mod, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveNotFoundError,
    );
    await expect(declineItemMove(as.mod, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveNotFoundError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
  });

  it("reads roles again under the lock: a session from before a demotion moves and answers nothing", async () => {
    // The services get the person as their session read them; the database says otherwise now.
    const deps = { repo: kyselyWorkspaceRepository(t.db, t.dialect) };
    const stale = { user: who.mod, ip: null };
    const deploy = await released("infra", "deploy");
    const other = await released("infra", "lint");
    const fromAna = await ask(as.ana, other);
    await setWorkspaceRole(app, who.mod.id, "user", acme);
    const asked = await itemMoves.askItemMove(deps, stale, { itemId: deploy, toScopeId: devops });
    expect(asked.outcome).toBe("requested");
    await expect(
      itemMoves.approveItemMove(deps, stale, { moveId: fromAna.moveId }),
    ).rejects.toThrow(ItemMoveNotFoundError);
    await expect(
      itemMoves.declineItemMove(deps, stale, { moveId: fromAna.moveId }),
    ).rejects.toThrow(ItemMoveNotFoundError);
    expect(await moveRow(fromAna.moveId)).toMatchObject({ status: "open" });
  });

  it("never lets the asker answer their own request, even once they may answer others'", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await setWorkspaceRole(app, who.ana.id, "moderator", acme);
    await expect(approveItemMove(as.ana, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveNotFoundError,
    );
    await expect(declineItemMove(as.ana, { moveId: asked.moveId }, app)).rejects.toThrow(
      ItemMoveNotFoundError,
    );
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "open" });
    expect((await approveItemMove(as.root, { moveId: asked.moveId }, app)).outcome).toBe("moved");
  });

  it("cancels a request whose item's own scope moved to another workspace, as target_moved", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await askScopeMove(as.root, { scopeId: infra, to: "beta", confirm: "infra" }, app);
    const error = await approveItemMove(as.root, { moveId: asked.moveId }, app).catch((e) => e);
    expect(error).toBeInstanceOf(ItemMoveTargetMovedError);
    expect(error.scopeName).toBe("@acme/devops");
    expect(await moveRow(asked.moveId)).toMatchObject({
      status: "cancelled",
      reason: "target_moved",
    });
    expect(await itemRow(deploy)).toMatchObject({ scope_id: infra });
  });

  it("refuses a release as moved, not as taken, when its item moved under the name it was read with", async () => {
    const deploy = await released("infra", "deploy");
    await ask(as.mod, deploy);
    // A proposal read before the move: its scope and name are still infra's.
    const read = {
      workspace: { id: acme, name: "acme" },
      scope: { id: infra, name: "infra" },
      name: "deploy",
      proposal: { itemId: deploy },
    };
    await expect(
      ownItem(kyselyItemRepository(t.db, t.dialect, UNFILTERED), read as never),
    ).rejects.toThrow(ItemMovedError);
    // Another item's old name is still "taken".
    await expect(
      ownItem(kyselyItemRepository(t.db, t.dialect, UNFILTERED), {
        ...read,
        proposal: null,
      } as never),
    ).rejects.toThrow(/taken/);
  });

  it("answers two approvals at once once", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    const results = await Promise.allSettled([
      approveItemMove(as.mod, { moveId: asked.moveId }, app),
      approveItemMove(as.adm, { moveId: asked.moveId }, app),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ItemMoveAnsweredError);
    expect(await history(deploy)).toHaveLength(1);
  });

  it("names the item anew in its proposals and in the workspace's open work that depends on it", async () => {
    const deploy = await released("infra", "deploy");
    const proposal = await proposeChange(
      as.root,
      { item: "@acme/infra/deploy", version: "1.0.0" },
      app,
      storage,
    );
    const dependent = await drafted("devops", "app", ["@acme/infra/deploy"]);
    await ask(as.mod, deploy);
    const manifest = async (submissionId: string) =>
      (
        await t.db
          .selectFrom("submission_files")
          .select("content")
          .where("submission_id", "=", submissionId)
          .where("path", "=", "ronne.yaml")
          .executeTakeFirstOrThrow()
      ).content;
    expect(await manifest(proposal.id)).toContain('"@acme/devops/deploy"');
    expect(await manifest(dependent)).toContain('"@acme/devops/deploy"');
    expect(await manifest(dependent)).not.toContain("@acme/infra/deploy");
    // The proposal is in the item's new scope, and releases there.
    const scope = await t.db
      .selectFrom("submissions")
      .select("scope_id")
      .where("id", "=", proposal.id)
      .executeTakeFirstOrThrow();
    expect(scope.scope_id).toBe(devops);
    await submitDraft(as.root, proposal.id, app, storage);
    await decide(as.root, proposal.id, { decision: "override" }, app);
    await publishSubmission(
      as.root,
      proposal.id,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    const versions = await t.db
      .selectFrom("item_versions")
      .select("version")
      .where("item_id", "=", deploy)
      .orderBy("version")
      .execute();
    expect(versions.map((v) => v.version)).toEqual(["1.0.0", "1.1.0"]);
    expect(
      await t.db.selectFrom("items").select("id").where("name", "=", "deploy").execute(),
    ).toHaveLength(1);
  });

  it("moves back where it came from: its earlier name becomes its name again", async () => {
    const deploy = await released("infra", "deploy");
    await ask(as.mod, deploy);
    await ask(as.mod, deploy, infra);
    expect(await itemRow(deploy)).toMatchObject({ scope_id: infra });
    const aliases = await t.db
      .selectFrom("item_aliases")
      .select(["name"])
      .where("item_id", "=", deploy)
      .execute();
    expect(aliases.map((a) => a.name)).toEqual(["@acme/devops/deploy"]);
    expect((await history(deploy)).map((h) => `${h.old_name} → ${h.new_name}`).sort()).toEqual([
      "@acme/devops/deploy → @acme/infra/deploy",
      "@acme/infra/deploy → @acme/devops/deploy",
    ]);
  });

  it("refuses a release packed under the item's old scope", async () => {
    const deploy = await released("infra", "deploy");
    const proposal = { id: await approvedProposal("@acme/infra/deploy") };
    // The move lands between packing (under @acme/infra/…) and recording the release.
    const moving: StorageAdapter = {
      ...storage,
      put: async (path, bytes) => {
        await storage.put(path, bytes);
        await askItemMove(as.mod, { itemId: deploy, toScopeId: devops }, app);
      },
    };
    await expect(
      publishSubmission(
        as.root,
        proposal.id,
        { choice: { kind: "stable", bump: "minor" } },
        app,
        moving,
      ),
    ).rejects.toThrow(ItemMovedError);
    const versions = await t.db
      .selectFrom("item_versions")
      .select("version")
      .where("item_id", "=", deploy)
      .execute();
    expect(versions.map((v) => v.version)).toEqual(["1.0.0"]);
    expect(await itemRow(deploy)).toMatchObject({ scope_id: devops });
  });

  it("lets a release and a move at the same time end consistently", async () => {
    const deploy = await released("infra", "deploy");
    const proposal = { id: await approvedProposal("@acme/infra/deploy") };
    const [releasedNow, moved] = await Promise.allSettled([
      publishSubmission(
        as.root,
        proposal.id,
        { choice: { kind: "stable", bump: "minor" } },
        app,
        storage,
      ),
      askItemMove(as.mod, { itemId: deploy, toScopeId: devops }, app),
    ]);
    expect(moved.status).toBe("fulfilled");
    expect(await itemRow(deploy)).toMatchObject({ scope_id: devops });
    if (releasedNow.status === "rejected")
      expect(releasedNow.reason).toBeInstanceOf(ItemMovedError);
    // One item either way: never a second one under the old name.
    expect(
      await t.db.selectFrom("items").select("id").where("name", "=", "deploy").execute(),
    ).toHaveLength(1);
  });

  it("cancels the open item moves of a person erased", async () => {
    const deploy = await released("infra", "deploy");
    const asked = await ask(as.ana, deploy);
    await adminEraseUser(as.root, who.ana.id, "ana@example.com", app);
    expect(await moveRow(asked.moveId)).toMatchObject({ status: "cancelled", reason: null });
  });
});
