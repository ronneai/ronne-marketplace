import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ItemRef } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
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
import { createScope } from "../../items/actions/scopes";
import { downloadArtifactAs, itemPage, resolveAs } from "../../items/actions/versions";
import { ItemNotFoundError } from "../../items/exceptions/errors";
import { addFavorite, listFavorites } from "../../shelves/actions/favorites";
import { pinItem } from "../../shelves/actions/pins";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { proposeChange } from "../../submissions/actions/proposals";
import { publishSubmission } from "../../submissions/actions/publish";
import { decide, listQueue } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import { askItemMove, createWorkspace } from "./workspaces";

// After an item moves to another scope of its workspace (134, task 5): from the next request it is
// seen, filtered, searched, resolved, downloaded, reviewed and offered in the feeds under its new
// name; the old one answers as an alias; its versions, checksums, tags, downloads, pins and
// favorites don't change.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
const as: Record<"root" | "mod" | "reader", Headers> = {} as never;
const user: Record<"root" | "mod" | "reader", CurrentUser> = {} as never;
let acme: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const full = (ref: ItemRef) =>
  ref.workspace === "global"
    ? `@${ref.scope}/${ref.name}`
    : `@${ref.workspace}/${ref.scope}/${ref.name}`;

/** Released 1.0.0 by root; returns the item's id. */
const released = async (ref: ItemRef) => {
  const name = full(ref);
  const draft = await createDraft(
    as.root,
    { scope: name.slice(0, name.lastIndexOf("/")), name: ref.name, type: "mcp-server" },
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
          content: `name: "${name}"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
          executable: false,
          loadedAt: draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(as.root, draft.id, app, storage);
  await decide(as.root, draft.id, { decision: "override", message: "Root's call." }, app);
  await publishSubmission(
    as.root,
    draft.id,
    { choice: { kind: "stable", bump: "major" } },
    app,
    storage,
  );
  return (
    await t.db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .select("items.id")
      .where("items.name", "=", ref.name)
      .where("scopes.name", "=", ref.scope)
      .executeTakeFirstOrThrow()
  ).id;
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

/** Everything a move must leave alone: versions with their checksums and tarballs, tags, downloads. */
const untouched = async () => ({
  versions: (
    await t.db
      .selectFrom("item_versions")
      .select(["id", "item_id", "version", "sha256", "artifact_path"])
      .orderBy("id")
      .execute()
  ).map((v) => `${v.id} ${v.item_id} ${v.version} ${v.sha256} ${v.artifact_path}`),
  tags: (
    await t.db
      .selectFrom("dist_tags")
      .select(["item_id", "tag", "version_id"])
      .orderBy("item_id")
      .orderBy("tag")
      .execute()
  ).map((d) => `${d.item_id} ${d.tag} ${d.version_id}`),
  downloads: (
    await t.db.selectFrom("items").select(["id", "download_count"]).orderBy("id").execute()
  ).map((i) => `${i.id} ${i.download_count}`),
  pins: (await t.db.selectFrom("item_pins").select(["item_id", "shelf"]).execute()).map(
    (p) => `${p.item_id} ${p.shelf}`,
  ),
});

/** The registry API (rmk and MCP read through it) with `who`'s token: an item's status and name. */
const fromApi = async (email: string, ref: ItemRef) => {
  const exchanged = await exchangePassword({ email, password, name: "test" }, new Headers(), app);
  if (!exchanged.ok) throw new Error("no token");
  const response = await getRegistryItem(
    new Request(`http://localhost:3000/api/v1/items/${full(ref)}`, {
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
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-after-item-move-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  as.root = await signedIn("root@example.com");
  for (const name of ["mod", "reader"] as const) {
    await adminCreateUser(
      as.root,
      { email: `${name}@example.com`, name, role: "user", password, requireChange: false },
      app,
    );
    as[name] = await signedIn(`${name}@example.com`);
  }
  acme = (await createWorkspace(as.root, { name: "acme", description: "Acme." }, app)).id;
  const mod = (await getCurrentUser(as.mod, app)) as CurrentUser;
  await setWorkspaceRole(app, mod.id, "moderator", acme);
  await setWorkspaceRole(app, mod.id, "moderator", GLOBAL_WORKSPACE_ID);
  for (const name of ["root", "mod", "reader"] as const)
    user[name] = (await getCurrentUser(as[name], app)) as CurrentUser;
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const moveTo = (itemId: string, toScopeId: string) =>
  askItemMove(as.mod, { itemId, toScopeId }, app);

describe("after an item moves to another scope (134)", () => {
  it("in a shared workspace: everything finds it under the new name, and the old one still works", async () => {
    await createScope(as.root, { name: "infra", description: "Infra.", workspaceId: acme }, app);
    const devops = (
      await createScope(as.root, { name: "devops", description: "Devops.", workspaceId: acme }, app)
    ).id;
    const old = { workspace: "acme", scope: "infra", name: "deploy" };
    const now = { workspace: "acme", scope: "devops", name: "deploy" };
    const deploy = await released(old);
    await downloadArtifactAs(user.reader, old, "1.0.0", app, storage);
    await addFavorite(as.reader, deploy, app);
    await pinItem(as.root, { kind: "workspace", workspaceId: acme }, deploy, app);
    // An open proposal, waiting for review.
    const proposal = await proposeChange(
      as.root,
      { item: full(old), version: "1.0.0" },
      app,
      storage,
    );
    await saveDraftFiles(
      as.root,
      proposal.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "${full(old)}"\ntype: mcp-server\ndescription: A better server.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
            executable: false,
            loadedAt: proposal.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(as.root, proposal.id, app, storage);
    expect(await marketplace("reader")).toEqual(["acme.infra.deploy"]);
    const before = await untouched();

    await moveTo(deploy, devops);

    // The item page by its new name, and by its old one as an alias of it.
    expect(await seenAs("reader", now)).toBe("@acme/devops/deploy");
    expect(await seenAs("reader", old)).toBe("@acme/devops/deploy");
    // The catalogue lists it under the new scope; search finds it there.
    const listed = await browseCatalogue(as.reader, { q: "deploy" }, app);
    expect(listed.entries.map((e) => `${e.workspace}/${e.scope}/${e.name}`)).toEqual([
      "acme/devops/deploy",
    ]);
    // The plugin feed offers it under its new name: a new plugin in Claude Code (118).
    expect(await marketplace("reader")).toEqual(["acme.devops.deploy"]);
    // A lockfile's old name resolves and downloads, and says its name now.
    const resolution = await resolveAs(
      user.reader,
      { dependencies: { [full(old)]: "^1.0.0" } },
      app,
    );
    expect(resolution.renamed).toEqual({ [full(old)]: full(now) });
    expect(
      (await downloadArtifactAs(user.reader, old, "1.0.0", app, storage)).bytes.length,
    ).toBeGreaterThan(0);
    // The registry API (rmk and MCP) answers by both names with the new one.
    for (const ref of [old, now])
      expect(await fromApi("reader@example.com", ref), full(ref)).toEqual({
        status: 200,
        name: full(now),
      });
    // The proposal waits for the same workspace's reviewers, in the item's new scope.
    const queue = await listQueue(as.mod, { tab: "needs" }, app);
    expect(queue.rows.map((r) => `${r.workspace.name}/${r.scope.name}/${r.name}`)).toEqual([
      "acme/devops/deploy",
    ]);
    // Favorites follow it; versions, checksums, tarballs, tags, downloads and pins as they were.
    expect(await listFavorites(as.reader, app)).toEqual([deploy]);
    // The download just above counted once more, under the same item; nothing else changed.
    const counted = before.downloads.map((line) => {
      const [id, count] = line.split(" ");
      return id === deploy ? `${id} ${Number(count) + 1}` : line;
    });
    expect(await untouched()).toEqual({ ...before, downloads: counted });
  });

  it("in global: short names, before and after", async () => {
    await createScope(
      as.root,
      { name: "tools", description: "Tools.", workspaceId: GLOBAL_WORKSPACE_ID },
      app,
    );
    const kit = (
      await createScope(
        as.root,
        { name: "kit", description: "Kit.", workspaceId: GLOBAL_WORKSPACE_ID },
        app,
      )
    ).id;
    const old = { workspace: "global", scope: "tools", name: "lint" };
    const now = { workspace: "global", scope: "kit", name: "lint" };
    const lint = await released(old);
    const before = await untouched();
    await moveTo(lint, kit);
    expect(await seenAs("reader", now)).toBe("@kit/lint");
    expect(await seenAs("reader", old)).toBe("@kit/lint");
    expect(await marketplace("reader")).toEqual(["kit.lint"]);
    const resolution = await resolveAs(
      user.reader,
      { dependencies: { "@tools/lint": "^1.0.0" } },
      app,
    );
    expect(resolution.renamed).toEqual({ "@tools/lint": "@kit/lint" });
    expect(await fromApi("reader@example.com", old)).toEqual({ status: 200, name: "@kit/lint" });
    expect(await untouched()).toEqual(before);
  });

  it("moved back: its first name is its name again, and the second answers as an alias", async () => {
    const infra = (
      await createScope(as.root, { name: "infra", description: "Infra.", workspaceId: acme }, app)
    ).id;
    const devops = (
      await createScope(as.root, { name: "devops", description: "Devops.", workspaceId: acme }, app)
    ).id;
    const first = { workspace: "acme", scope: "infra", name: "deploy" };
    const second = { workspace: "acme", scope: "devops", name: "deploy" };
    const deploy = await released(first);
    const before = await untouched();
    await moveTo(deploy, devops);
    await moveTo(deploy, infra);
    expect(await seenAs("reader", first)).toBe("@acme/infra/deploy");
    expect(await seenAs("reader", second)).toBe("@acme/infra/deploy");
    expect(await marketplace("reader")).toEqual(["acme.infra.deploy"]);
    const resolution = await resolveAs(
      user.reader,
      { dependencies: { [full(second)]: "^1.0.0" } },
      app,
    );
    expect(resolution.renamed).toEqual({ [full(second)]: full(first) });
    expect(await untouched()).toEqual(before);
  });
});
