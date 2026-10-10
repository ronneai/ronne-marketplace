import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatItemName } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
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
import { browseCatalogue, searchCatalogueAs } from "../../items/actions/catalogue";
import { createScope, listScopesAs } from "../../items/actions/scopes";
import { itemPage, resolveAs } from "../../items/actions/versions";
import { ItemNotFoundError } from "../../items/exceptions/errors";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { SubmissionInvalidError } from "../exceptions/errors";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission } from "./publish";
import { decide } from "./reviews";
import { checkSubmission, submitDraft } from "./submissions";

// The workspace in item names (118): scope names unique per workspace, items named
// `@workspace/scope/name` outside global, and old names kept as aliases that reserve their name.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asAuthor: Headers;
let asModerator: Headers;
let asRoot: Headers;
let asOutsider: Headers;
let author: CurrentUser;
let outsider: CurrentUser;
let acme: string;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-old-names-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  const authorId = await createTestUser(app, { email: "author@example.com", password });
  const moderatorId = await createTestUser(app, {
    email: "mod@example.com",
    password,
    role: "moderator",
  });
  await createTestUser(app, { email: "out@example.com", password });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  asOutsider = await signedIn("out@example.com");
  // Two workspaces, each with a scope called `team`.
  await createScope(asRoot, { name: "team", description: "Global's team." }, app);
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme's team.",
    visibility: "public",
    createdBy: null,
    createdAt: new Date(),
  });
  await createScope(asRoot, { name: "team", description: "Acme's team.", workspaceId: acme }, app);
  await setWorkspaceRole(app, authorId, "user", acme);
  await setWorkspaceRole(app, moderatorId, "moderator", acme);
  author = (await getCurrentUser(asAuthor, app)) as CurrentUser;
  outsider = (await getCurrentUser(asOutsider, app)) as CurrentUser;
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A draft of `@{workspace}/team/{name}` with this manifest body after `name:`, by the author. */
const draftOf = async (
  workspace: "global" | "acme",
  name: string,
  type: "mcp-server" | "bundle",
  dependencies: Record<string, string> = {},
) => {
  const itemName = formatItemName({ workspace, scope: "team", name });
  const scope = workspace === "global" ? "team" : `@${workspace}/team`;
  const draft = await createDraft(asAuthor, { scope, name, type }, app);
  const at = draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null;
  const needs = Object.entries(dependencies)
    .map(([dependency, range]) => `  "${dependency}": "${range}"\n`)
    .join("");
  const body =
    type === "bundle"
      ? `type: bundle\ndescription: A set.\ndependencies:\n${needs}`
      : `type: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n${needs ? `dependencies:\n${needs}` : ""}`;
  await saveDraftFiles(
    asAuthor,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${itemName}"\n${body}`,
          executable: false,
          loadedAt: at,
        },
      ],
      deletes: [],
    },
    app,
  );
  return draft.id;
};

const approve = (id: string, headers: Headers) => decide(headers, id, { decision: "approve" }, app);
const release = (id: string) =>
  publishSubmission(asAuthor, id, { choice: { kind: "stable", bump: "minor" } }, app, storage);

/** Submitted, approved and released: global's by root, acme's by acme's moderator. */
const published = async (
  workspace: "global" | "acme",
  name: string,
  type: "mcp-server" | "bundle" = "mcp-server",
  dependencies: Record<string, string> = {},
) => {
  const id = await draftOf(workspace, name, type, dependencies);
  await submitDraft(asAuthor, id, app, storage);
  await approve(id, workspace === "global" ? asRoot : asModerator);
  await release(id);
  return id;
};

const itemId = async (workspace: string, name: string) =>
  (
    await t.db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .select("items.id")
      .where("workspaces.name", "=", workspace)
      .where("items.name", "=", name)
      .executeTakeFirstOrThrow()
  ).id;

/** An old name for an item, as a move or a rename leaves it. */
const alias = async (name: string, item: string) =>
  t.db
    .insertInto("item_aliases")
    .values({ name, item_id: item, reason: "move", created_at: toDbDate(new Date(), t.dialect) })
    .execute();

describe("the workspace in item names (118)", () => {
  it("keeps two workspaces' same-named items apart, each by its full name", async () => {
    await published("global", "lint");
    await published("acme", "lint");
    const names = (await browseCatalogue(asAuthor, { sort: "name" }, app)).entries.map((e) =>
      formatItemName(e),
    );
    expect(names.sort()).toEqual(["@acme/team/lint", "@team/lint"]);
    const global = await itemPage(asAuthor, { scope: "team", name: "lint" }, undefined, app);
    const inAcme = await itemPage(
      asAuthor,
      { workspace: "acme", scope: "team", name: "lint" },
      undefined,
      app,
    );
    expect([global.item.fullName, inAcme.item.fullName]).toEqual(["@team/lint", "@acme/team/lint"]);
    expect(global.item.id).not.toBe(inAcme.item.id);
  });

  it("searches by a three-part name, the workspace included", async () => {
    await published("global", "lint");
    await published("acme", "lint");
    const found = async (q: string) =>
      (await browseCatalogue(asAuthor, { q }, app)).entries.map((e) => formatItemName(e));
    expect(await found("acme/team/li")).toEqual(["@acme/team/lint"]);
    expect((await found("team/lint")).sort()).toEqual(["@acme/team/lint", "@team/lint"]);
  });

  it("finds an item by its old name, as its new one, only for who sees it", async () => {
    await published("acme", "deploy");
    await alias("@team/deploy", await itemId("acme", "deploy"));
    const page = await itemPage(asAuthor, { scope: "team", name: "deploy" }, undefined, app);
    expect(page.item.fullName).toBe("@acme/team/deploy");
    // Private, acme's items are unknown to an outsider, by either name.
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", acme)
      .execute();
    await expect(
      itemPage(asOutsider, { scope: "team", name: "deploy" }, undefined, app),
    ).rejects.toThrow(ItemNotFoundError);
    await expect(
      resolveAs(outsider, { dependencies: { "@team/deploy": "^1.0.0" } }, app),
    ).rejects.toThrow(/isn't a published item/);
  });

  it("resolves one item asked for by two names as one, and says which name it has now", async () => {
    await published("acme", "base");
    await alias("@team/base", await itemId("acme", "base"));
    const resolution = await resolveAs(
      author,
      { dependencies: { "@team/base": "^1.0.0", "@acme/team/base": "^1.0.0" } },
      app,
    );
    expect(Object.keys(resolution.items)).toEqual(["@acme/team/base"]);
    expect(resolution.renamed).toEqual({ "@team/base": "@acme/team/base" });
  });

  it("refuses a new item named like another item's old name", async () => {
    await published("acme", "deploy");
    await alias("@team/deploy", await itemId("acme", "deploy"));
    const id = await draftOf("global", "deploy", "mcp-server");
    const issues = await checkSubmission(asAuthor, id, app, storage);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "name_taken",
        message: "@team/deploy was the name of another item; pick another name.",
      }),
    );
    await expect(submitDraft(asAuthor, id, app, storage)).rejects.toThrow(SubmissionInvalidError);
  });

  it("never releases into the item an old name belongs to", async () => {
    await published("acme", "fmt");
    const id = await draftOf("global", "fmt", "mcp-server");
    await submitDraft(asAuthor, id, app, storage);
    await approve(id, asRoot);
    // The name becomes another item's old name after the approval.
    const other = await itemId("acme", "fmt");
    await alias("@team/fmt", other);
    await expect(release(id)).rejects.toThrow(
      expect.objectContaining({
        name: expect.stringMatching(/ItemNameTakenError|SubmissionInvalidError/),
      }),
    );
    const versions = await t.db
      .selectFrom("item_versions")
      .select("version")
      .where("item_id", "=", other)
      .execute();
    expect(versions.map((v) => v.version)).toEqual(["1.0.0"]);
  });

  it("takes a dependency by its old name, with a warning, and records the item", async () => {
    await published("acme", "base");
    const base = await itemId("acme", "base");
    await alias("@team/base", base);
    const id = await draftOf("acme", "kit", "bundle", { "@team/base": "^1.0.0" });
    const issues = await checkSubmission(asAuthor, id, app, storage);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "dependency_renamed",
        message:
          "@team/base is now @acme/team/base. It still works under its old name; use the new one.",
      }),
    );
    await submitDraft(asAuthor, id, app, storage);
    await approve(id, asModerator);
    await release(id);
    const recorded = await t.db
      .selectFrom("version_dependencies")
      .select("depends_on_item_id")
      .execute();
    expect(recorded.map((r) => r.depends_on_item_id)).toEqual([base]);
  });
  it("refuses an old name to someone who doesn't see its item, as taken, saying nothing of it", async () => {
    await published("acme", "deploy");
    await alias("@team/deploy", await itemId("acme", "deploy"));
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", acme)
      .execute();
    const draft = await createDraft(
      asOutsider,
      { scope: "team", name: "deploy", type: "skill" },
      app,
    );
    // Valid otherwise, so the registry's checks run.
    await saveDraftFiles(
      asOutsider,
      draft.id,
      {
        writes: draft.files.map((file) => ({
          path: file.path,
          encoding: "utf8" as const,
          content: file.content.replaceAll('description: ""', "description: Deploys."),
          executable: file.executable,
          loadedAt: file.updatedAt,
        })),
        deletes: [],
      },
      app,
    );
    const issues = await checkSubmission(asOutsider, draft.id, app, storage);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "name_taken",
        message: "@team/deploy is taken; pick another name.",
      }),
    );
  });

  it("answers an outsider's resolve by an old name exactly as an unknown name", async () => {
    await published("acme", "deploy");
    await alias("@team/deploy", await itemId("acme", "deploy"));
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", acme)
      .execute();
    const message = async (name: string) => {
      try {
        await resolveAs(outsider, { dependencies: { [name]: "^1.0.0" } }, app);
        return "resolved";
      } catch (error) {
        return (error as Error).message.replace(name, "X");
      }
    };
    expect(await message("@team/deploy")).toBe(await message("@team/nothing-here"));
    expect(await message("@team/deploy")).toBe("X isn't a published item.");
  });

  it("asks one item, named twice, for both ranges, whichever comes first; a tag and a range conflict", async () => {
    await published("acme", "base");
    await alias("@team/base", await itemId("acme", "base"));
    for (const dependencies of [
      { "@team/base": "^1.0.0", "@acme/team/base": "^2.0.0" },
      { "@acme/team/base": "^2.0.0", "@team/base": "^1.0.0" },
    ])
      await expect(resolveAs(author, { dependencies }, app)).rejects.toThrow(
        /has no published version/,
      );
    // Ranges of any form: an `||` keeps needing the other name's range.
    await expect(
      resolveAs(
        author,
        { dependencies: { "@team/base": "^1.0.0 || ^2.0.0", "@acme/team/base": "^2.0.0" } },
        app,
      ),
    ).rejects.toThrow(/has no published version/);
    const both = await resolveAs(
      author,
      { dependencies: { "@team/base": "^1.0.0", "@acme/team/base": "1.0.0 - 1.5.0" } },
      app,
    );
    expect(both.items["@acme/team/base"]?.version).toBe("1.0.0");
    await expect(
      resolveAs(
        author,
        { dependencies: { "@team/base": "latest", "@acme/team/base": "^1.0.0" } },
        app,
      ),
    ).rejects.toThrow(
      "@team/base and @acme/team/base are the same item, @acme/team/base, asked for as latest and ^1.0.0.",
    );
  });

  it("pages the catalogue by name past two items of the same scope and name", async () => {
    await published("global", "lint");
    await published("acme", "lint");
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await searchCatalogueAs(author, { sort: "name", limit: 1, cursor }, app);
      seen.push(...page.entries.map((e) => formatItemName(e)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual(["@acme/team/lint", "@team/lint"]);
  });

  it("finds an item by its whole old name in a search, for who sees it", async () => {
    await published("acme", "deploy");
    await alias("@old/deploy", await itemId("acme", "deploy"));
    const found = async (headers: Headers) =>
      (await browseCatalogue(headers, { q: "@old/deploy" }, app)).entries.map((e) =>
        formatItemName(e),
      );
    expect(await found(asAuthor)).toEqual(["@acme/team/deploy"]);
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", acme)
      .execute();
    expect(await found(asOutsider)).toEqual([]);
  });
  it("tells someone who doesn't see the old name's item only that the name is taken, at release", async () => {
    await published("acme", "fmt");
    const draft = await createDraft(
      asOutsider,
      { scope: "team", name: "fmt", type: "mcp-server" },
      app,
    );
    const at = draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null;
    await saveDraftFiles(
      asOutsider,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content:
              'name: "@team/fmt"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n',
            executable: false,
            loadedAt: at,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(asOutsider, draft.id, app, storage);
    await approve(draft.id, asRoot);
    await alias("@team/fmt", await itemId("acme", "fmt"));
    await t.db
      .updateTable("workspaces")
      .set({ visibility: "private" })
      .where("id", "=", acme)
      .execute();
    const said = await publishSubmission(
      asOutsider,
      draft.id,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    ).then(
      () => "released",
      (error: Error & { issues?: { message: string }[] }) =>
        [error.message, ...(error.issues ?? []).map((i) => i.message)].join(" | "),
    );
    expect(said).toContain("@team/fmt is taken; pick another name.");
    expect(said).not.toContain("was the name of another item");
  });
  it("pages the scopes past two of the same name", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listScopesAs(author, { limit: 1, cursor }, app);
      seen.push(...page.scopes.map((s) => `${s.workspace.name}/${s.name}`));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual(["acme/team", "global/team"]);
  });
});
