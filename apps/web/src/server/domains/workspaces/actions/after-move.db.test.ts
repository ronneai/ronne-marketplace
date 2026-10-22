import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ItemRef } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { getItem as getRegistryItem } from "../../../http/registry-api";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { marketplaceAs } from "../../feeds/actions/feeds";
import { authenticateToken, exchangePassword } from "../../identity/actions/access-tokens";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { adminCreateUser } from "../../identity/actions/user-admin";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, setWorkspaceRole, testAppAuth } from "../../identity/testing/test-auth";
import { browseCatalogue } from "../../items/actions/catalogue";
import { downloadArtifactAs, itemPage, resolveAs } from "../../items/actions/versions";
import { ItemNotFoundError } from "../../items/exceptions/errors";
import { kyselyScopeRepository } from "../../items/repositories/kysely-scope-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { publishSubmission } from "../../submissions/actions/publish";
import { decide, listQueue } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import { UNFILTERED } from "../models/viewer";
import { approveScopeMove, askScopeMove, createWorkspace } from "./workspaces";

// After a move (115, task 4): from the next request, the scope's items are seen, filtered,
// searched, resolved, downloaded and reviewed as the new workspace's, under their new names; their
// old names answer as aliases to whoever sees them; versions and tags don't change.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
const as: Record<"root" | "member" | "outsider" | "ana", Headers> = {} as never;
const user: Record<"root" | "member" | "outsider" | "ana", CurrentUser> = {} as never;
let beta: string;
let acme: string;
let vault: string;
const password = "correct horse battery";

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

/** `@{workspace}/{scope}/{name}` (`@{scope}/{name}` in global), released 1.0.0 by `who`. */
const released = async (
  ref: { workspace: string; scope: string; name: string },
  who: "root" | "ana" = "root",
  needs: string[] = [],
) => {
  const full =
    ref.workspace === "global"
      ? `@${ref.scope}/${ref.name}`
      : `@${ref.workspace}/${ref.scope}/${ref.name}`;
  const draft = await createDraft(
    as[who],
    { scope: full.slice(0, full.lastIndexOf("/")), name: ref.name, type: "mcp-server" },
    app,
  );
  await saveDraftFiles(
    as[who],
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${full}"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n${
            needs.length > 0
              ? `dependencies:\n${needs.map((n) => `  "${n}": "^1.0.0"\n`).join("")}`
              : ""
          }`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  const sent = await submitDraft(as[who], draft.id, app, storage);
  if (sent.status !== "approved") await decide(as.root, draft.id, { decision: "override" }, app);
  await publishSubmission(
    as[who],
    draft.id,
    { choice: { kind: "stable", bump: "major" } },
    app,
    storage,
  );
  return draft.id;
};

/** Whether `who` sees the item under this name: its page's full name, or null for not found. */
const seenAs = async (who: keyof typeof as, ref: ItemRef) => {
  try {
    return (await itemPage(as[who], ref, undefined, app)).item.fullName;
  } catch (error) {
    if (error instanceof ItemNotFoundError) return null;
    throw error;
  }
};

const marketplace = async (who: keyof typeof user) =>
  (
    JSON.parse(
      new TextDecoder().decode(
        await marketplaceAs(user[who], "claude-code", "https://r.example/", null, app, storage),
      ),
    ) as { plugins: { name: string }[] }
  ).plugins.map((p) => p.name);

/** Every version (id, item, version) and every tag (item, tag, version), exactly. */
const versionsAndTags = async () => ({
  versions: (
    await t.db
      .selectFrom("item_versions")
      .select(["id", "item_id", "version"])
      .orderBy("id")
      .execute()
  ).map((v) => `${v.id} ${v.item_id} ${v.version}`),
  tags: (
    await t.db
      .selectFrom("dist_tags")
      .select(["item_id", "tag", "version_id"])
      .orderBy("item_id")
      .orderBy("tag")
      .execute()
  ).map((d) => `${d.item_id} ${d.tag} ${d.version_id}`),
});

/** The registry API (rmk and MCP read through it) with `who`'s token: an item's status and name. */
const fromApi = async (email: string, ref: ItemRef) => {
  const exchanged = await exchangePassword({ email, password, name: "test" }, new Headers(), app);
  if (!exchanged.ok) throw new Error("no token");
  const response = await getRegistryItem(
    new Request(`http://localhost:3000/api/v1/items/@${ref.workspace}/${ref.scope}/${ref.name}`, {
      headers: { authorization: `Bearer ${exchanged.token.token}` },
    }),
    ref,
    {
      app,
      storage,
      guard: {
        ready: async () => true,
        authenticate: (value: string | null) => authenticateToken(value, app),
      },
    },
  );
  return {
    status: response.status,
    name: response.status === 200 ? (await response.json()).name : null,
  };
};

beforeEach(async () => {
  // The marketplace cache is the process's, keyed by the catalogue revision, which starts again
  // with each test's database: a marketplace from the test before would answer for this one.
  (globalThis as { __ronneMarketplaceCache?: unknown }).__ronneMarketplaceCache = undefined;
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-after-move-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  as.root = await signedIn("root@example.com");
  for (const name of ["member", "outsider", "ana"] as const) {
    await adminCreateUser(
      as.root,
      // They use the API with a token at once: nothing asks them to choose a password first (128).
      { email: `${name}@example.com`, name, role: "user", password, requireChange: false },
      app,
    );
    as[name] = await signedIn(`${name}@example.com`);
  }
  beta = (await createWorkspace(as.root, { name: "beta", description: "Beta." }, app)).id;
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  vault = (
    await createWorkspace(
      as.root,
      { name: "vault", description: "Vault.", visibility: "private" },
      app,
    )
  ).id;
  const member = (await getCurrentUser(as.member, app)) as CurrentUser;
  await setWorkspaceRole(app, member.id, "moderator", vault);
  for (const name of ["root", "member", "outsider", "ana"] as const)
    user[name] = (await getCurrentUser(as[name], app)) as CurrentUser;
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

describe("after a move (115)", () => {
  it("public → private: its members see it under the new name; nobody else sees it at all", async () => {
    const infra = await scope("infra", beta);
    await released({ workspace: "beta", scope: "infra", name: "deploy" });
    // Ana's submission, open in beta when it moves.
    await setWorkspaceRole(app, user.ana.id, "user", beta);
    const fmt = await createDraft(
      as.ana,
      { scope: "@beta/infra", name: "fmt", type: "mcp-server" },
      app,
    );
    await saveDraftFiles(
      as.ana,
      fmt.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@beta/infra/fmt"\ntype: mcp-server\ndescription: Fmt.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
            executable: false,
            loadedAt: fmt.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(as.ana, fmt.id, app, storage);
    // Read before the move: the move raises the catalogue revision, so a cached one isn't served.
    expect(await marketplace("outsider")).toEqual(["beta.infra.deploy"]);
    const before = await versionsAndTags();
    await askScopeMove(as.root, { scopeId: infra, to: "vault", confirm: "infra" }, app);
    const old = { workspace: "beta", scope: "infra", name: "deploy" };
    const now = { workspace: "vault", scope: "infra", name: "deploy" };
    // The member: the new name, and the old one as an alias of it.
    expect(await seenAs("member", now)).toBe("@vault/infra/deploy");
    expect(await seenAs("member", old)).toBe("@vault/infra/deploy");
    // Everyone else: not found by either name, and gone from their catalogue and marketplace.
    expect(await seenAs("outsider", now)).toBeNull();
    expect(await seenAs("outsider", old)).toBeNull();
    expect((await browseCatalogue(as.outsider, {}, app)).entries).toEqual([]);
    expect(await marketplace("outsider")).toEqual([]);
    expect(await marketplace("member")).toEqual(["vault.infra.deploy"]);
    // The catalogue's filter and its search, by the new workspace.
    const inVault = await browseCatalogue(as.member, { workspace: "vault", q: "deploy" }, app);
    expect(inVault.entries.map((e) => `${e.workspace}/${e.scope}/${e.name}`)).toEqual([
      "vault/infra/deploy",
    ]);
    expect((await browseCatalogue(as.member, { workspace: "beta" }, app)).entries).toEqual([]);
    // A lockfile's old name resolves and downloads for the member, and says its name now.
    const resolution = await resolveAs(
      user.member,
      { dependencies: { "@beta/infra/deploy": "^1.0.0" } },
      app,
    );
    expect(resolution.renamed).toEqual({ "@beta/infra/deploy": "@vault/infra/deploy" });
    const artifact = await downloadArtifactAs(user.member, old, "1.0.0", app, storage);
    expect(artifact.bytes.length).toBeGreaterThan(0);
    await expect(downloadArtifactAs(user.outsider, old, "1.0.0", app, storage)).rejects.toThrow();
    for (const ref of [old, now])
      expect(await fromApi("outsider@example.com", ref), ref.workspace).toEqual({
        status: 404,
        name: null,
      });
    // The submission open at the move waits for vault's reviewers now, named anew.
    const queue = await listQueue(as.member, { tab: "needs" }, app);
    expect(queue.rows.map((r) => `${r.workspace.name}/${r.scope.name}/${r.name}`)).toEqual([
      "vault/infra/fmt",
    ]);
    const manifest = await t.db
      .selectFrom("submission_files")
      .select("content")
      .where("submission_id", "=", fmt.id)
      .where("path", "=", "ronne.yaml")
      .executeTakeFirstOrThrow();
    expect(manifest.content).toContain('name: "@vault/infra/fmt"');
    // Versions and tags as they were.
    expect(await versionsAndTags()).toEqual(before);
  });

  it("private → public: everyone sees it, and the registry API answers by both names", async () => {
    const infra = await scope("infra", vault);
    await released({ workspace: "vault", scope: "infra", name: "deploy" });
    expect(
      await seenAs("outsider", { workspace: "vault", scope: "infra", name: "deploy" }),
    ).toBeNull();
    expect(await marketplace("outsider")).toEqual([]);
    const before = await versionsAndTags();
    await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
    expect(await seenAs("outsider", { workspace: "acme", scope: "infra", name: "deploy" })).toBe(
      "@acme/infra/deploy",
    );
    expect(await marketplace("outsider")).toEqual(["acme.infra.deploy"]);
    // The registry API (rmk and MCP read through it), with the outsider's token, by both names.
    for (const workspace of ["acme", "vault"])
      expect(
        await fromApi("outsider@example.com", { workspace, scope: "infra", name: "deploy" }),
        workspace,
      ).toEqual({ status: 200, name: "@acme/infra/deploy" });
    expect(await versionsAndTags()).toEqual(before);
  });

  it("personal → shared: reviewed at the move, and its open submissions in the new workspace's queue", async () => {
    const mine = await t.db
      .selectFrom("workspaces")
      .select(["id", "name"])
      .where("owner_id", "=", user.ana.id)
      .executeTakeFirstOrThrow();
    const tools = await scope("tools", mine.id);
    await released({ workspace: mine.name, scope: "tools", name: "lint" }, "ana");
    // A second draft, submitted: approved at once while personal (114).
    const draft = await createDraft(
      as.ana,
      { scope: `@${mine.name}/tools`, name: "fmt", type: "mcp-server" },
      app,
    );
    await saveDraftFiles(
      as.ana,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@${mine.name}/tools/fmt"\ntype: mcp-server\ndescription: Fmt.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
            executable: false,
            loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    const before = await versionsAndTags();
    const asked = await askScopeMove(as.ana, { scopeId: tools, to: "acme" }, app);
    expect(asked.outcome).toBe("requested");
    await approveScopeMove(as.root, { moveId: asked.moveId }, app);
    const page = await itemPage(
      as.outsider,
      { workspace: "acme", scope: "tools", name: "lint" },
      undefined,
      app,
    );
    expect(page.item.fullName).toBe("@acme/tools/lint");
    const reviewed = await t.db
      .selectFrom("item_versions")
      .select("reviewed")
      .executeTakeFirstOrThrow();
    expect(Boolean(reviewed.reviewed)).toBe(true);
    expect(await versionsAndTags()).toEqual(before);
    // Submitted in acme now, it waits for acme's reviewers, as any shared workspace's does.
    await setWorkspaceRole(app, user.ana.id, "user", acme);
    const sent = await submitDraft(as.ana, draft.id, app, storage);
    expect(sent.status).toBe("submitted");
    const queue = await listQueue(as.root, { tab: "needs" }, app);
    expect(queue.rows.map((r) => `${r.workspace.name}/${r.scope.name}/${r.name}`)).toEqual([
      "acme/tools/fmt",
    ]);
  });

  it("renamed for a clash: found by its new name, and its old one", async () => {
    const infra = await scope("infra", beta);
    await scope("infra", acme);
    await released({ workspace: "beta", scope: "infra", name: "deploy" });
    // Released naming the dependency by its name before the move.
    await scope("app", acme);
    await released({ workspace: "acme", scope: "app", name: "kit" }, "root", [
      "@beta/infra/deploy",
    ]);
    const before = await versionsAndTags();
    await askScopeMove(
      as.root,
      { scopeId: infra, to: "acme", name: "infra-tools", confirm: "infra" },
      app,
    );
    expect(await versionsAndTags()).toEqual(before);
    // That old name, written in a released version, still resolves to the item.
    const resolution = await resolveAs(
      user.outsider,
      { dependencies: { "@acme/app/kit": "^1.0.0" } },
      app,
    );
    expect(Object.keys(resolution.items).sort()).toEqual([
      "@acme/app/kit",
      "@acme/infra-tools/deploy",
    ]);
    expect(
      await seenAs("outsider", { workspace: "acme", scope: "infra-tools", name: "deploy" }),
    ).toBe("@acme/infra-tools/deploy");
    expect(await seenAs("outsider", { workspace: "beta", scope: "infra", name: "deploy" })).toBe(
      "@acme/infra-tools/deploy",
    );
    // The other infra scope's names are its own.
    expect(
      await seenAs("outsider", { workspace: "acme", scope: "infra", name: "deploy" }),
    ).toBeNull();
  });

  it("moved back where it came from: its first name is its own again", async () => {
    const infra = await scope("infra", beta);
    await released({ workspace: "beta", scope: "infra", name: "deploy" });
    const before = await versionsAndTags();
    await askScopeMove(as.root, { scopeId: infra, to: "acme", confirm: "infra" }, app);
    expect(await marketplace("outsider")).toEqual(["acme.infra.deploy"]);
    await askScopeMove(as.root, { scopeId: infra, to: "beta", confirm: "infra" }, app);
    expect(await versionsAndTags()).toEqual(before);
    expect(await seenAs("outsider", { workspace: "beta", scope: "infra", name: "deploy" })).toBe(
      "@beta/infra/deploy",
    );
    expect(await seenAs("outsider", { workspace: "acme", scope: "infra", name: "deploy" })).toBe(
      "@beta/infra/deploy",
    );
    expect(
      (await t.db.selectFrom("item_aliases").select("name").execute()).map((a) => a.name),
    ).toEqual(["@acme/infra/deploy"]);
    expect(await marketplace("outsider")).toEqual(["beta.infra.deploy"]);
  });
});
