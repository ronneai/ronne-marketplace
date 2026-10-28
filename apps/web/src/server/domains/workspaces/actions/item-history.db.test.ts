import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { adminEraseUser } from "../../identity/actions/erase-user";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import { erasedName } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { publishSubmission } from "../../submissions/actions/publish";
import { decide } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import {
  approveItemMove,
  askItemMove,
  askScopeMove,
  createWorkspace,
  itemHistory,
  renameWorkspace,
} from "./workspaces";

// The item page's History tab (134, task 8): every name change, newest first, why and who, and
// never a name in a workspace the reader can't see.
const password = "correct horse battery";

let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
const as: Record<"root" | "ana" | "mod" | "bob", Headers> = {} as never;
const who: Record<"root" | "ana" | "mod" | "bob", CurrentUser> = {} as never;
let acme: string;
let vault: string;

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

/** Root's `@vault/infra/deploy`, released 1.0.0; returns the item's id. */
const releasedInVault = async () => {
  const draft = await createDraft(
    as.root,
    { scope: "@vault/infra", name: "deploy", type: "skill" },
    app,
  );
  await saveDraftFiles(
    as.root,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: 'name: "@vault/infra/deploy"\ntype: skill\ndescription: It.\n',
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: "---\nname: deploy\ndescription: It.\n---\nDo it.\n",
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "SKILL.md")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(as.root, draft.id, app, storage);
  await decide(as.root, draft.id, { decision: "override" }, app);
  await publishSubmission(
    as.root,
    draft.id,
    { choice: { kind: "stable", bump: "minor" } },
    app,
    storage,
  );
  return (
    await t.db
      .selectFrom("items")
      .select("id")
      .where("name", "=", "deploy")
      .executeTakeFirstOrThrow()
  ).id;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-item-history-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  as.root = await signedIn("root@example.com");
  for (const name of ["ana", "mod", "bob"] as const)
    await adminCreateUser(
      as.root,
      { email: `${name}@example.com`, name, role: "user", password },
      app,
    );
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  vault = (
    await createWorkspace(
      as.root,
      { name: "vault", description: "Vault.", visibility: "private" },
      app,
    )
  ).id;
  const ids = await t.db.selectFrom("user").select(["id", "email"]).execute();
  const idOf = (name: string) => ids.find((u) => u.email === `${name}@example.com`)?.id ?? "";
  await setWorkspaceRole(app, idOf("ana"), "user", acme);
  await setWorkspaceRole(app, idOf("mod"), "moderator", acme);
  for (const name of ["root", "ana", "mod", "bob"] as const) {
    as[name] = await signedIn(`${name}@example.com`);
    who[name] = (await getCurrentUser(as[name], app)) as CurrentUser;
  }
  await createScope(as.root, { name: "infra", description: "Infra.", workspaceId: vault }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** vault (private) → acme by root; infra → devops asked by ana, approved by mod; acme → acme2. */
const aLife = async () => {
  const deploy = await releasedInVault();
  const infra = (
    await t.db
      .selectFrom("scopes")
      .select("id")
      .where("name", "=", "infra")
      .executeTakeFirstOrThrow()
  ).id;
  await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
  const devops = (
    await createScope(as.root, { name: "devops", description: "Devops.", workspaceId: acme }, app)
  ).id;
  const asked = await askItemMove(as.ana, { itemId: deploy, toScopeId: devops }, app);
  await approveItemMove(as.mod, { moveId: asked.moveId }, app);
  await renameWorkspace(as.root, { name: "acme", to: "acme2" }, app);
  return deploy;
};

describe("an item's history (134)", () => {
  it("lists every change newest first, with why and who", async () => {
    const deploy = await aLife();
    const history = await itemHistory(as.root, deploy, app);
    expect(history?.current).toBe("@acme2/devops/deploy");
    expect(history?.entries.map(({ id: _id, at: _at, ...e }) => e)).toEqual([
      {
        reason: "rename_workspace",
        from: "@acme/devops/deploy",
        to: "@acme2/devops/deploy",
        askedBy: "Root",
        approvedBy: "Root",
        direct: true,
      },
      {
        reason: "move_item",
        from: "@acme/infra/deploy",
        to: "@acme/devops/deploy",
        askedBy: "ana",
        approvedBy: "mod",
        direct: false,
      },
      {
        reason: "move_scope",
        from: "@vault/infra/deploy",
        to: "@acme/infra/deploy",
        askedBy: "Root",
        approvedBy: "Root",
        direct: true,
      },
    ]);
  });

  it("never names a workspace the reader can't see: the move from vault is hidden for acme's people", async () => {
    const deploy = await aLife();
    for (const name of ["ana", "mod", "bob"] as const) {
      const entries = (await itemHistory(as[name], deploy, app))?.entries ?? [];
      expect(
        entries.map((e) => [e.reason, e.from, e.to]),
        name,
      ).toEqual([
        ["rename_workspace", "@acme/devops/deploy", "@acme2/devops/deploy"],
        ["move_item", "@acme/infra/deploy", "@acme/devops/deploy"],
        ["move_scope", null, "@acme/infra/deploy"],
      ]);
    }
    // A member of vault sees where it came from.
    await setWorkspaceRole(app, who.bob.id, "user", vault);
    const bob = (await itemHistory(as.bob, deploy, app))?.entries ?? [];
    expect(bob.at(-1)?.from).toBe("@vault/infra/deploy");
  });

  it("hides every older name once a hidden workspace is crossed", async () => {
    const deploy = await releasedInVault();
    // An earlier change while in vault (as 118's migration would have written it).
    await t.db
      .insertInto("item_name_history")
      .values({
        id: newId(),
        item_id: deploy,
        old_name: "@infra/deploy",
        new_name: "@vault/infra/deploy",
        reason: "migration",
        requested_by: null,
        decided_by: null,
        source_id: null,
        created_at: toDbDate(new Date(Date.now() - 60_000), t.dialect),
      })
      .execute();
    const infra = (
      await t.db
        .selectFrom("scopes")
        .select("id")
        .where("name", "=", "infra")
        .executeTakeFirstOrThrow()
    ).id;
    await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
    const entries = (await itemHistory(as.ana, deploy, app))?.entries ?? [];
    expect(entries.map((e) => [e.reason, e.from, e.to, e.askedBy, e.approvedBy, e.direct])).toEqual(
      [
        ["move_scope", null, "@acme/infra/deploy", "Root", "Root", true],
        // Its names in vault: neither shown; nobody is named for the migration, nor said to have done it.
        ["migration", null, null, null, null, false],
      ],
    );
  });

  it("shows both moves when the item moved back where it came from", async () => {
    const deploy = await releasedInVault();
    const infra = (
      await t.db
        .selectFrom("scopes")
        .select("id")
        .where("name", "=", "infra")
        .executeTakeFirstOrThrow()
    ).id;
    await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
    const devops = (
      await createScope(as.root, { name: "devops", description: "Devops.", workspaceId: acme }, app)
    ).id;
    await askItemMove(as.mod, { itemId: deploy, toScopeId: devops }, app);
    await askItemMove(as.mod, { itemId: deploy, toScopeId: infra }, app);
    const history = await itemHistory(as.ana, deploy, app);
    expect(history?.current).toBe("@acme/infra/deploy");
    expect(history?.entries.map((e) => [e.reason, e.from, e.to, e.askedBy, e.direct])).toEqual([
      ["move_item", "@acme/devops/deploy", "@acme/infra/deploy", "mod", true],
      ["move_item", "@acme/infra/deploy", "@acme/devops/deploy", "mod", true],
      ["move_scope", null, "@acme/infra/deploy", "Root", true],
    ]);
  });

  it("names an erased person by their pseudonym", async () => {
    const deploy = await aLife();
    await adminEraseUser(as.root, who.ana.id, "ana@example.com", app);
    const move = (await itemHistory(as.root, deploy, app))?.entries.find(
      (e) => e.reason === "move_item",
    );
    expect(move?.askedBy).toBe(erasedName(who.ana.id));
  });

  it("is nothing for someone who doesn't see the item, and empty for one never renamed", async () => {
    const deploy = await releasedInVault();
    expect(await itemHistory(as.bob, deploy, app)).toBeNull();
    expect(await itemHistory(as.root, deploy, app)).toEqual({
      current: "@vault/infra/deploy",
      entries: [],
    });
    expect(await itemHistory(as.root, newId(), app)).toBeNull();
  });
});
