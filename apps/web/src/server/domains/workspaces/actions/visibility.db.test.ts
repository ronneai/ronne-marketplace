import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogueRevision } from "../../../db/catalogue-revision";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { unyank, yank } from "../../items/actions/versions";
import { VersionDependsOnPrivateError } from "../../items/exceptions/errors";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { createDraft, saveDraftFiles } from "../../submissions/actions/drafts";
import { submitDraft } from "../../submissions/actions/submissions";
import {
  GlobalWorkspaceError,
  InvalidWorkspaceVisibilityError,
  WorkspaceHasOutsideDependentsError,
} from "../exceptions/errors";
import { UNFILTERED } from "../models/viewer";
import {
  createWorkspace,
  findWorkspace,
  setWorkspaceVisibility,
  visibilityImpact,
} from "./workspaces";

// Making a workspace private or public (093): root only, global stays public, refused while
// released items outside depend on its items, and audited with a catalogue revision bump.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
let asAdmin: Headers;
let asAuthor: Headers;
let acme: string;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

const released = async (scopeName: string, name: string, dependsOn?: string) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", scopeName)
    .executeTakeFirstOrThrow();
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
    dependencies: dependsOn ? [{ itemId: dependsOn, range: "^1.0.0" }] : [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
  return itemId;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  const adminId = await createTestUser(app, { email: "a@example.com", password });
  await createTestUser(app, { email: "w@example.com", password });
  asRoot = await signedIn("root@example.com");
  acme = (await createWorkspace(asRoot, { name: "acme", description: "Acme." }, app)).id;
  await setWorkspaceRole(app, adminId, "admin", acme);
  asAdmin = await signedIn("a@example.com");
  asAuthor = await signedIn("w@example.com");
  await createScope(asRoot, { name: "team", description: "Public." }, app);
  await createScope(asRoot, { name: "acme-infra", description: "Acme.", workspaceId: acme }, app);
});
afterEach(() => t.cleanup());

const visibility = async (name: string) => (await findWorkspace(asRoot, name, app))?.visibility;

describe("a workspace's visibility (093)", () => {
  it("is chosen when root creates it: public unless private is asked for", async () => {
    await createWorkspace(
      asRoot,
      { name: "hidden", description: "Hidden.", visibility: "private" },
      app,
    );
    expect(await visibility("hidden")).toBe("private");
    expect(await visibility("acme")).toBe("public");
    await expect(
      createWorkspace(asRoot, { name: "odd", description: "Odd.", visibility: "secret" }, app),
    ).rejects.toThrow(InvalidWorkspaceVisibilityError);
  });

  it("turns private and back, audited, raising the catalogue revision each time", async () => {
    const before = await catalogueRevision(t.db);
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app);
    expect(await visibility("acme")).toBe("private");
    const between = await catalogueRevision(t.db);
    expect(between).not.toEqual(before);
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "public" }, app);
    expect(await visibility("acme")).toBe("public");
    expect(await catalogueRevision(t.db)).not.toEqual(between);
    const events = (await listAuditEvents(t.db, t.dialect, {})).events
      .filter((e) => e.action === "workspace.updated")
      .map((e) => e.metadata);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "acme", visibility: "private", from: "public" }),
        expect.objectContaining({ name: "acme", visibility: "public", from: "private" }),
      ]),
    );
  });

  it("is refused while released items outside depend on its items, and lists them", async () => {
    const deploy = await released("acme-infra", "deploy");
    await released("team", "front", deploy);
    await released("team", "back", deploy);
    await released("acme-infra", "inside", deploy);
    const impact = await visibilityImpact(asRoot, "acme", app);
    expect(impact.dependents).toEqual(["@team/back", "@team/front"]);
    const refused = setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app);
    await expect(refused).rejects.toThrow(WorkspaceHasOutsideDependentsError);
    await expect(refused).rejects.toThrow(
      "2 items outside acme depend on its items: @team/back, @team/front.",
    );
    expect(await visibility("acme")).toBe("public");
  });

  it("counts every version outside that isn't yanked, not only the listed one", async () => {
    const deploy = await released("acme-infra", "deploy");
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    // @team/old's 1.0.0 depends on deploy; its latest, 2.0.0, doesn't.
    const old = await released("team", "old", deploy);
    const later = await items.insertVersion({
      itemId: old,
      version: "2.0.0",
      manifest: { name: "@team/old", description: "old" },
      readme: null,
      files: [],
      notes: null,
      artifactPath: "team/old-2.tgz",
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: rootId,
      publishedAt: new Date(),
      submissionId: null,
      dependencies: [],
      riskFlags: [],
    });
    await items.setTag(old, "latest", later);
    expect((await visibilityImpact(asRoot, "acme", app)).dependents).toEqual(["@team/old"]);
    // Yanked, it no longer installs: it doesn't hold the workspace back.
    await t.db
      .updateTable("item_versions")
      .set({ yanked_at: toDbDate(new Date(), t.dialect), yank_reason: "Old." })
      .where("item_id", "=", old)
      .where("version", "=", "1.0.0")
      .execute();
    expect((await visibilityImpact(asRoot, "acme", app)).dependents).toEqual([]);
  });

  it("keeps yanked a version outside that depends on it, once it's private", async () => {
    const deploy = await released("acme-infra", "deploy");
    await released("team", "yy", deploy);
    await yank(asRoot, { scope: "team", name: "yy" }, { version: "1.0.0", reason: "Old." }, app);
    // Yanked, it doesn't hold the workspace back.
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app);
    await expect(
      unyank(asRoot, { scope: "team", name: "yy" }, { version: "1.0.0" }, app),
    ).rejects.toThrow(VersionDependsOnPrivateError);
    // Public again, it can come back.
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "public" }, app);
    await unyank(asRoot, { scope: "team", name: "yy" }, { version: "1.0.0" }, app);
  });

  it("changes nothing, and records nothing, when it's already so", async () => {
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "public" }, app);
    const revision = await catalogueRevision(t.db);
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "public" }, app);
    expect(await catalogueRevision(t.db)).toEqual(revision);
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "workspace.updated",
    );
    expect(events).toEqual([]);
  });

  it("takes only public or private: nothing else, not even empty, and says which", async () => {
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app);
    for (const odd of ["", "Public", " private", "secret"])
      await expect(
        setWorkspaceVisibility(asRoot, { name: "acme", visibility: odd }, app),
        odd,
      ).rejects.toThrow("A workspace is public or private.");
    expect(await visibility("acme")).toBe("private");
  });

  it("makes one change when two roots make it private at once", async () => {
    const results = await Promise.allSettled([
      setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app),
      setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const events = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "workspace.updated",
    );
    expect(events).toHaveLength(1);
  });

  it("warns of open submissions outside that depend on its items", async () => {
    await released("acme-infra", "deploy");
    const draft = await createDraft(
      asAuthor,
      { scope: "team", name: "waiting", type: "agent" },
      app,
    );
    const manifest = draft.files.find((f) => f.path === "ronne.yaml");
    await saveDraftFiles(
      asAuthor,
      draft.id,
      {
        writes: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "@team/waiting"\ntype: agent\ndescription: Waits.\nagent:\n  prompt: prompt.md\ndependencies:\n  "@acme-infra/deploy": "^1.0.0"\n`,
            executable: false,
            loadedAt: manifest?.updatedAt ?? null,
          },
        ],
        deletes: [],
      },
      app,
    );
    await submitDraft(asAuthor, draft.id, app);
    expect(await visibilityImpact(asRoot, "acme", app)).toEqual({
      dependents: [],
      openDependents: ["@team/waiting"],
    });
    // A warning only: it's allowed, and the submission will fail at release.
    await setWorkspaceVisibility(asRoot, { name: "acme", visibility: "private" }, app);
    expect(await visibility("acme")).toBe("private");
  });

  it("is root's alone: a workspace's admin can't, and global stays public", async () => {
    await expect(
      setWorkspaceVisibility(asAdmin, { name: "acme", visibility: "private" }, app),
    ).rejects.toThrow(ForbiddenError);
    await expect(visibilityImpact(asAdmin, "acme", app)).rejects.toThrow(ForbiddenError);
    await expect(
      setWorkspaceVisibility(asRoot, { name: "global", visibility: "private" }, app),
    ).rejects.toThrow(GlobalWorkspaceError);
    await expect(
      setWorkspaceVisibility(asRoot, { name: "acme", visibility: "hidden" }, app),
    ).rejects.toThrow(InvalidWorkspaceVisibilityError);
  });
});
