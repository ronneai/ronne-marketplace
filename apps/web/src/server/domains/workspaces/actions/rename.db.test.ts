import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { browseCatalogue } from "../../items/actions/catalogue";
import { createScope } from "../../items/actions/scopes";
import { downloadArtifactAs, itemPage, resolveAs } from "../../items/actions/versions";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { proposeChange } from "../../submissions/actions/proposals";
import { publishSubmission } from "../../submissions/actions/publish";
import { decide } from "../../submissions/actions/reviews";
import { submitDraft } from "../../submissions/actions/submissions";
import { WorkspaceRenamedError } from "../../submissions/exceptions/errors";
import {
  GlobalWorkspaceError,
  InvalidWorkspaceNameError,
  WorkspaceNameTakenError,
  WorkspaceNotFoundError,
  WorkspaceRenameAliasError,
} from "../exceptions/errors";
import { kyselyWorkspaceRepository } from "../repositories/kysely-workspace-repository";
import { deleteWorkspace, renameWorkspace, requestAccess } from "./workspaces";

// Renaming a workspace (113): root and its admins; its items take the new name, the old ones kept
// as aliases (118); open requests kept for the new name join it; audited.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asRoot: Headers;
let asAdmin: Headers;
let asModerator: Headers;
let asUser: Headers;
let asOtherAdmin: Headers;
let author: CurrentUser;
let acme: string;
let other: string;
const password = "correct horse battery";

const workspace = (name: string, visibility: "public" | "private" = "public") =>
  kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name,
    description: `The ${name} team.`,
    visibility,
    createdBy: null,
    createdAt: new Date(),
  });

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-rename-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  const ids = {
    admin: await createTestUser(app, { email: "admin@example.com", password }),
    moderator: await createTestUser(app, { email: "mod@example.com", password }),
    user: await createTestUser(app, { email: "user@example.com", password }),
    otherAdmin: await createTestUser(app, { email: "other@example.com", password }),
  };
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  acme = await workspace("acme");
  other = await workspace("other");
  for (const workspaceId of [acme, other]) {
    await createScope(asRoot, { name: "team", description: "A team.", workspaceId }, app);
    await setWorkspaceRole(app, ids.moderator, "moderator", workspaceId);
    await setWorkspaceRole(app, ids.user, "user", workspaceId);
  }
  await setWorkspaceRole(app, ids.admin, "admin", acme);
  await setWorkspaceRole(app, ids.otherAdmin, "admin", other);
  asAdmin = await signedIn("admin@example.com");
  asModerator = await signedIn("mod@example.com");
  asUser = await signedIn("user@example.com");
  asOtherAdmin = await signedIn("other@example.com");
  author = (await getCurrentUser(asUser, app)) as CurrentUser;
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const rename = (headers: Headers, name: string, to: string) =>
  renameWorkspace(headers, { name, to }, app);

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

/** A draft of `@{workspace}/team/{name}`, an MCP server, by the user. */
const drafted = async (name: string, workspaceName = "acme") => {
  const draft = await createDraft(
    asUser,
    { scope: `@${workspaceName}/team`, name, type: "mcp-server" },
    app,
  );
  const at = draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null;
  await saveDraftFiles(
    asUser,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "@${workspaceName}/team/${name}"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
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

/** `@{workspace}/team/{name}`, drafted by the user, approved by the moderator and released. */
const released = async (name: string, workspaceName = "acme", into = storage) => {
  const id = await drafted(name, workspaceName);
  await submitDraft(asUser, id, app, into);
  await decide(asModerator, id, { decision: "approve" }, app);
  await publishSubmission(asUser, id, { choice: { kind: "stable", bump: "minor" } }, app, into);
  return id;
};

const aliases = async () =>
  (await t.db.selectFrom("item_aliases").select(["name", "reason"]).orderBy("name").execute()).map(
    (row) => `${row.name} ${row.reason}`,
  );

describe("renaming a workspace (113)", () => {
  it("is root's and the workspace's admins', no one else's", async () => {
    for (const headers of [asModerator, asUser, asOtherAdmin])
      await expect(rename(headers, "acme", "acme-team")).rejects.toThrow(ForbiddenError);
    expect((await rename(asAdmin, "acme", "acme-team")).name).toBe("acme-team");
    expect((await rename(asRoot, "acme-team", "acme")).name).toBe("acme");
    // An admin of another workspace can't rename this one under any name it has.
    await expect(rename(asOtherAdmin, "acme", "x")).rejects.toThrow(ForbiddenError);
  });

  it("never renames global, nor a workspace that isn't there", async () => {
    await expect(rename(asRoot, "global", "everyone")).rejects.toThrow(GlobalWorkspaceError);
    await expect(rename(asRoot, "nowhere", "somewhere")).rejects.toThrow(WorkspaceNotFoundError);
  });

  it("follows the name rule, refuses reserved and taken names, and skips the same name", async () => {
    await expect(rename(asAdmin, "acme", "Not a name")).rejects.toThrow(InvalidWorkspaceNameError);
    await expect(rename(asAdmin, "acme", "admin")).rejects.toThrow(InvalidWorkspaceNameError);
    await expect(rename(asAdmin, "acme", "other")).rejects.toThrow(WorkspaceNameTakenError);
    // `global` is reserved: no workspace can be given it.
    await expect(rename(asAdmin, "acme", "global")).rejects.toThrow(InvalidWorkspaceNameError);
    // A private workspace's name is taken too: names are unique, whoever sees them.
    await workspace("hidden", "private");
    await expect(rename(asAdmin, "acme", "hidden")).rejects.toThrow(WorkspaceNameTakenError);
    // The same name, in any case, changes and audits nothing.
    expect((await rename(asAdmin, "acme", " ACME ")).name).toBe("acme");
    expect(await events("workspace.renamed")).toHaveLength(0);
  });

  it("gives a name to one of two renames at once", async () => {
    const results = await Promise.allSettled([
      rename(asRoot, "acme", "same"),
      rename(asRoot, "other", "same"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(WorkspaceNameTakenError);
    const names = (await t.db.selectFrom("workspaces").select("name").execute()).map((r) => r.name);
    expect(names.filter((name) => name === "same")).toHaveLength(1);
  });

  it("renames one workspace once when two ask at once: the old name is gone for the second", async () => {
    await released("deploy");
    const results = await Promise.allSettled([
      rename(asRoot, "acme", "x1"),
      rename(asAdmin, "acme", "x2"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(WorkspaceNotFoundError);
    expect(await events("workspace.renamed")).toHaveLength(1);
    expect(await aliases()).toEqual(["@acme/team/deploy rename"]);
  });

  it("lets one of a rename and a delete of the same workspace through", async () => {
    await workspace("empty");
    const results = await Promise.allSettled([
      rename(asRoot, "empty", "e1"),
      deleteWorkspace(asRoot, { name: "empty" }, app),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("raises the catalogue revision, so plugin feeds rebuild with the new names", async () => {
    const revision = async () =>
      Number(
        (await t.db.selectFrom("catalogue_revision").select("revision").executeTakeFirstOrThrow())
          .revision,
      );
    const before = await revision();
    await rename(asAdmin, "acme", "acme-platform");
    expect(await revision()).toBe(before + 1);
    await rename(asAdmin, "acme-platform", "ACME-PLATFORM");
    expect(await revision()).toBe(before + 1);
  });

  it("names the item anew in drafts and submissions not released yet, which then release", async () => {
    // Approved under the old name, released after the rename.
    const approved = await drafted("late");
    await submitDraft(asUser, approved, app, storage);
    await decide(asModerator, approved, { decision: "approve" }, app);
    // A draft, still being written.
    const draft = await drafted("early");
    await rename(asAdmin, "acme", "acme-platform");

    await publishSubmission(
      asUser,
      approved,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    const page = await itemPage(
      asUser,
      { workspace: "acme-platform", scope: "team", name: "late" },
      undefined,
      app,
    );
    expect(page.item.fullName).toBe("@acme-platform/team/late");
    const working = await t.db
      .selectFrom("submission_files")
      .select("content")
      .where("submission_id", "=", draft)
      .where("path", "=", "ronne.yaml")
      .executeTakeFirstOrThrow();
    expect(working.content).toContain('name: "@acme-platform/team/early"');
    // Submits under the new name.
    await submitDraft(asUser, draft, app, storage);
  });

  it("renames what drafts name of the workspace: a sibling dependency and a skill's agent", async () => {
    /** A draft of `@acme/team/{name}` with these files written over the starting ones. */
    const draftWith = async (
      name: string,
      type: "agent" | "skill",
      files: Record<string, string>,
    ) => {
      const draft = await createDraft(asUser, { scope: "@acme/team", name, type }, app);
      await saveDraftFiles(
        asUser,
        draft.id,
        {
          writes: Object.entries(files).map(([path, content]) => ({
            path,
            encoding: "utf8" as const,
            content,
            executable: false,
            loadedAt: draft.files.find((f) => f.path === path)?.updatedAt ?? null,
          })),
          deletes: [],
        },
        app,
      );
      return draft.id;
    };
    await draftWith("runner", "agent", {
      "ronne.yaml":
        'name: "@acme/team/runner"\ntype: agent\ndescription: Runs it.\nagent:\n  prompt: prompt.md\n',
      "prompt.md": "Run it.\n",
    });
    const skill = await draftWith("checks", "skill", {
      "ronne.yaml":
        'name: "@acme/team/checks"\ntype: skill\ndescription: Checks.\nskill:\n  entry: SKILL.md\ndependencies:\n  "@acme/team/runner": ^0.1.0\n',
      "SKILL.md":
        '---\nname: checks\ndescription: Checks.\nagent: "@acme/team/runner"\n---\nCheck it.\n',
    });
    await rename(asAdmin, "acme", "acme-platform");
    const file = async (path: string) =>
      (
        await t.db
          .selectFrom("submission_files")
          .select("content")
          .where("submission_id", "=", skill)
          .where("path", "=", path)
          .executeTakeFirstOrThrow()
      ).content;
    expect(await file("ronne.yaml")).toContain('"@acme-platform/team/runner": ^0.1.0');
    expect(await file("SKILL.md")).toContain('agent: "@acme-platform/team/runner"');
    // The skill and the agent it runs go to review together, under the new names.
    const sent = await submitDraft(asUser, skill, app, storage);
    expect(sent.with).toHaveLength(1);
  });

  it("gives a draft or a proposal made during a rename the new name, or refuses it", async () => {
    await released("base");
    const [draft, proposal] = await Promise.allSettled([
      createDraft(asUser, { scope: "@acme/team", name: "fresh", type: "mcp-server" }, app),
      proposeChange(asUser, { item: "@acme/team/base", version: "1.0.0" }, app, storage),
      rename(asAdmin, "acme", "acme-platform"),
    ]);
    const manifests = (
      await t.db
        .selectFrom("submission_files")
        .innerJoin("submissions", "submissions.id", "submission_files.submission_id")
        .select("submission_files.content")
        .where("submission_files.path", "=", "ronne.yaml")
        .where("submissions.status", "!=", "published")
        .execute()
    ).map((row) => row.content);
    // Whatever was made names acme-platform; nothing unreleased says @acme/ any more (a release
    // keeps the files it was released with).
    expect(manifests.filter((text) => text.includes("@acme/"))).toEqual([]);
    for (const result of [draft, proposal])
      if (result?.status === "rejected") expect((result.reason as Error).name).toMatch(/Error$/);
  });

  it("leaves a ronne.yaml whose bytes aren't UTF-8 as it was", async () => {
    const draft = await drafted("latin");
    const bytes = Buffer.concat([
      Buffer.from('name: "@acme/team/latin"\ndescription: "Caf'),
      Buffer.from([0xe9]),
      Buffer.from('"\n'),
    ]).toString("base64");
    await t.db
      .updateTable("submission_files")
      .set({ encoding: "base64", content: bytes })
      .where("submission_id", "=", draft)
      .where("path", "=", "ronne.yaml")
      .execute();
    await rename(asAdmin, "acme", "acme-platform");
    const after = await t.db
      .selectFrom("submission_files")
      .select(["encoding", "content"])
      .where("submission_id", "=", draft)
      .where("path", "=", "ronne.yaml")
      .executeTakeFirstOrThrow();
    expect(after).toEqual({ encoding: "base64", content: bytes });
  });

  it("names the item anew in a ronne.yaml stored as base64 too", async () => {
    const draft = await drafted("b64");
    await t.db
      .updateTable("submission_files")
      .set({
        encoding: "base64",
        content: Buffer.from(
          'name: "@acme/team/b64"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n',
        ).toString("base64"),
      })
      .where("submission_id", "=", draft)
      .where("path", "=", "ronne.yaml")
      .execute();
    await rename(asAdmin, "acme", "acme-platform");
    await submitDraft(asUser, draft, app, storage);
  });

  it("names the item anew in a revision made by a submit at the same time", async () => {
    const draft = await drafted("racing");
    await Promise.allSettled([
      submitDraft(asUser, draft, app, storage),
      rename(asAdmin, "acme", "acme-platform"),
    ]);
    const revision = await t.db
      .selectFrom("submission_revisions")
      .innerJoin(
        "submission_revision_files",
        "submission_revision_files.revision_id",
        "submission_revisions.id",
      )
      .select("submission_revision_files.content")
      .where("submission_revisions.submission_id", "=", draft)
      .where("submission_revision_files.path", "=", "ronne.yaml")
      .executeTakeFirstOrThrow();
    expect(revision.content).toContain('name: "@acme-platform/team/racing"');
  });

  it("renames its items and keeps their old names, which install and resolve", async () => {
    await released("deploy");
    await rename(asAdmin, "acme", "acme-platform");
    expect(await aliases()).toEqual(["@acme/team/deploy rename"]);

    const page = await itemPage(
      asUser,
      { workspace: "acme", scope: "team", name: "deploy" },
      undefined,
      app,
    );
    expect(page.item.fullName).toBe("@acme-platform/team/deploy");
    const catalogue = await browseCatalogue(asUser, {}, app);
    expect(catalogue.entries.map((e) => e.workspace)).toEqual(["acme-platform"]);
    // A lockfile's old name still resolves and downloads, and says the name it has now.
    const resolution = await resolveAs(
      author,
      { dependencies: { "@acme/team/deploy": "^1.0.0" } },
      app,
    );
    expect(resolution.renamed).toEqual({ "@acme/team/deploy": "@acme-platform/team/deploy" });
    const artifact = await downloadArtifactAs(
      author,
      { workspace: "acme", scope: "team", name: "deploy" },
      "1.0.0",
      app,
      storage,
    );
    expect(artifact.bytes.length).toBeGreaterThan(0);
    // Still one item.
    const deploys = await t.db
      .selectFrom("items")
      .select("id")
      .where("name", "=", "deploy")
      .execute();
    expect(deploys).toHaveLength(1);
  });

  it("drops an old name that's the item's own again after a rename back", async () => {
    await released("deploy");
    await rename(asAdmin, "acme", "acme-platform");
    await rename(asAdmin, "acme-platform", "acme");
    expect(await aliases()).toEqual(["@acme-platform/team/deploy rename"]);
    await rename(asAdmin, "acme", "acme-platform");
    expect(await aliases()).toEqual(["@acme/team/deploy rename"]);
  });

  it("refuses a name that would give an item another item's old name", async () => {
    await released("deploy");
    // other's own deploy had the name `@next/team/deploy` once (other was `next`).
    await released("deploy", "other");
    const otherItem = (
      await t.db
        .selectFrom("items")
        .innerJoin("scopes", "scopes.id", "items.scope_id")
        .select("items.id")
        .where("scopes.workspace_id", "=", other)
        .executeTakeFirstOrThrow()
    ).id;
    await t.db
      .insertInto("item_aliases")
      .values({
        name: "@next/team/deploy",
        item_id: otherItem,
        reason: "rename",
        created_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    await expect(rename(asAdmin, "acme", "next")).rejects.toThrow(
      new WorkspaceRenameAliasError(["@next/team/deploy"]),
    );
    // Nothing changed.
    const acmeNow = await t.db
      .selectFrom("workspaces")
      .select("name")
      .where("id", "=", acme)
      .executeTakeFirst();
    expect(acmeNow?.name).toBe("acme");
    expect(await events("workspace.renamed")).toHaveLength(0);
  });

  it("joins the requests kept for the new name, except a member's, and audits the rename", async () => {
    await released("deploy");
    // Someone asks to join `acme-platform` before it exists, and a member of acme does too.
    await createTestUser(app, { email: "asker@example.com", password });
    const asker = await signIn(
      new Headers(),
      { email: "asker@example.com", password, rememberMe: false },
      app,
    );
    if (!asker.ok) throw new Error(asker.error);
    const asAsker = cookieHeaders(asker.headers.get("set-cookie"));
    expect(await requestAccess(asAsker, { workspace: "acme-platform" }, app)).toBe("sent");
    expect(await requestAccess(asModerator, { workspace: "acme-platform" }, app)).toBe("sent");
    // And someone asked to join acme under its old name.
    await createTestUser(app, { email: "early@example.com", password });
    const early = await signIn(
      new Headers(),
      { email: "early@example.com", password, rememberMe: false },
      app,
    );
    if (!early.ok) throw new Error(early.error);
    const asEarly = cookieHeaders(early.headers.get("set-cookie"));
    expect(await requestAccess(asEarly, { workspace: "acme" }, app)).toBe("sent");

    await rename(asAdmin, "acme", "acme-platform");
    const requests = await t.db
      .selectFrom("workspace_access_requests")
      .innerJoin("user", "user.id", "workspace_access_requests.user_id")
      .select(["user.email", "workspace_id", "workspace_name", "status"])
      .orderBy("user.email")
      .execute();
    expect(requests).toEqual([
      {
        email: "asker@example.com",
        workspace_id: acme,
        workspace_name: "acme-platform",
        status: "open",
      },
      {
        email: "early@example.com",
        workspace_id: acme,
        workspace_name: "acme-platform",
        status: "open",
      },
      {
        email: "mod@example.com",
        workspace_id: null,
        workspace_name: "acme-platform",
        status: "cancelled",
      },
    ]);
    // Asked again under the new name, it's the same request.
    expect(await requestAccess(asEarly, { workspace: "acme-platform" }, app)).toBe(
      "already_requested",
    );
    // The old name is a name no workspace has: a request to it is kept by name.
    expect(await requestAccess(asOtherAdmin, { workspace: "acme" }, app)).toBe("sent");

    const [event] = await events("workspace.renamed");
    expect(event?.metadata).toEqual({
      from: "acme",
      to: "acme-platform",
      items: 1,
      requestsJoined: 1,
    });
    expect(event?.targetId).toBe(acme);
  });

  it("refuses a release packed under the workspace's old name", async () => {
    // The rename lands between packing (stored under @acme/…) and recording the release.
    const renaming: StorageAdapter = {
      ...storage,
      put: async (path, bytes) => {
        await storage.put(path, bytes);
        if (path.includes("/deploy/"))
          await t.db
            .updateTable("workspaces")
            .set({ name: "acme-platform" })
            .where("id", "=", acme)
            .execute();
      },
    };
    await expect(released("deploy", "acme", renaming)).rejects.toThrow(
      new WorkspaceRenamedError("acme", "acme-platform"),
    );
    expect(await t.db.selectFrom("items").select("id").execute()).toHaveLength(0);
  });
});
