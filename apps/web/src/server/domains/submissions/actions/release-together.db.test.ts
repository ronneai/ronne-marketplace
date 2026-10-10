import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { SubmissionInvalidError } from "../exceptions/errors";
import { kyselyReleaseStore } from "../repositories/kysely-release-store";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import type { ReleaseStore } from "../repositories/release-store";
import * as service from "../services/publish";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission, releaseMany } from "./publish";
import { decide } from "./reviews";
import { submitDraft, withdrawSubmission } from "./submissions";

// Releasing together (112): an approved item with its unreleased dependencies, all or none.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asAuthor: Headers;
let asModerator: Headers;
let asRoot: Headers;
let acme: string;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-release-together-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  const authorId = await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
  // Another public workspace, where the author is a member and the moderator isn't.
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme's team.",
    visibility: "public",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, authorId, "user", acme);
  await createScope(asRoot, { name: "acme", description: "Acme's tools.", workspaceId: acme }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A draft with this ronne.yaml, by the author. */
const draftWith = async (
  scope: string,
  name: string,
  type: "mcp-server" | "bundle",
  manifest: string,
) => {
  const draft = await createDraft(asAuthor, { scope, name, type }, app);
  const at = draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null;
  await saveDraftFiles(
    asAuthor,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: manifest,
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
const server = (name: string, scope = "team") =>
  draftWith(
    scope,
    name,
    "mcp-server",
    `name: "${scope.startsWith("@") ? scope : `@${scope}`}/${name}"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
  );
const bundle = (name: string, needs: string[]) =>
  draftWith(
    "team",
    name,
    "bundle",
    `name: "@team/${name}"\ntype: bundle\ndescription: A set.\ndependencies:\n${needs.map((n) => `  "${n.startsWith("@") ? n : `@team/${n}`}": "^1.0.0"\n`).join("")}`,
  );
const approve = (id: string, headers = asModerator) =>
  decide(headers, id, { decision: "approve" }, app);
const release = (id: string, headers = asAuthor, using = storage) =>
  publishSubmission(headers, id, { choice: { kind: "stable", bump: "minor" } }, app, using);
const statusOf = async (id: string) =>
  (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
    ?.status;
const versionsOf = async (name: string) =>
  (
    await t.db
      .selectFrom("item_versions")
      .innerJoin("items", "items.id", "item_versions.item_id")
      .select("item_versions.version")
      .where("items.name", "=", name)
      .execute()
  ).map((row) => row.version);

describe("Release takes an item's unreleased dependencies with it (112)", () => {
  it("releases a chain from its top, every one at 1.0.0, in one go", async () => {
    const c = await server("c");
    const b = await bundle("b", ["c"]);
    const a = await bundle("a", ["b"]);
    await submitDraft(asAuthor, a, app, storage);
    for (const id of [a, b, c]) await approve(id);
    const released = await release(a);
    expect(released).toMatchObject({ version: "1.0.0" });
    expect(released.with.map((m) => [m.name, m.version])).toEqual([
      ["@team/c", "1.0.0"],
      ["@team/b", "1.0.0"],
    ]);
    expect(await Promise.all([a, b, c].map(statusOf))).toEqual([
      "published",
      "published",
      "published",
    ]);
  });

  it("releases two items that need each other, each pointing at the other", async () => {
    const a = await bundle("a", ["b"]);
    const b = await bundle("b", ["a"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    await approve(b);
    const released = await release(b);
    expect(released.with.map((m) => m.name)).toEqual(["@team/a"]);
    const links = await t.db
      .selectFrom("version_dependencies")
      .innerJoin("item_versions", "item_versions.id", "version_dependencies.version_id")
      .innerJoin("items as from", "from.id", "item_versions.item_id")
      .innerJoin("items as to", "to.id", "version_dependencies.depends_on_item_id")
      .select(["from.name as from", "to.name as to"])
      .execute();
    expect(links.map((l) => `${l.from}→${l.to}`).sort()).toEqual(["a→b", "b→a"]);
  });

  it("refuses, with why, while a member is still in review, and releases nothing", async () => {
    const b = await server("b");
    const a = await bundle("a", ["b"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    const refused = await release(a).catch((error) => error);
    expect(refused).toBeInstanceOf(SubmissionInvalidError);
    expect(refused.message).toBe(
      "It can't be released yet: it waits on @team/b, which is submitted.",
    );
    expect([await statusOf(a), await statusOf(b)]).toEqual(["approved", "submitted"]);
    expect(await versionsOf("b")).toEqual([]);
  });

  it("refuses, with why, a member the person may not release", async () => {
    // The moderator moderates global, where the bundle is, but not acme, where its server is.
    const b = await server("b", "@acme/acme");
    const a = await bundle("a", ["@acme/acme/b"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    await approve(b, asRoot);
    const refused = await release(a, asModerator).catch((error) => error);
    expect(refused).toBeInstanceOf(SubmissionInvalidError);
    expect(refused.message).toBe(
      "It can't be released yet: @acme/acme/b can't be released with it: only its author, a moderator or root releases it.",
    );
    expect([await statusOf(a), await statusOf(b)]).toEqual(["approved", "approved"]);
    // The author may release both.
    expect((await release(a)).with.map((m) => m.name)).toEqual(["@acme/acme/b"]);
  });

  it("releases nothing when recording one of them fails", async () => {
    const b = await server("b");
    const a = await bundle("a", ["b"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    await approve(b);
    // The second version's insert fails, after the first one was written in the transaction.
    let inserts = 0;
    const store = kyselyReleaseStore(t.db, t.dialect);
    const failing: ReleaseStore = {
      ...store,
      transaction: (work) =>
        store.transaction(({ submissions, items }) =>
          work({
            submissions,
            items: {
              ...items,
              insertVersion: async (version) => {
                if (++inserts === 2) throw new Error("The database went away.");
                return items.insertVersion(version);
              },
            },
          }),
        ),
    };
    const user = await getCurrentUser(asAuthor, app);
    const refused = await service
      .publishSubmission(
        {
          repo: kyselySubmissionRepository(t.db, t.dialect, UNFILTERED),
          store: failing,
          storage,
        },
        { user, ip: null },
        a,
        { choice: { kind: "stable", bump: "minor" } },
      )
      .catch((error) => error);
    expect(String(refused)).toContain("The database went away.");
    expect(inserts).toBe(2);
    expect([await statusOf(a), await statusOf(b)]).toEqual(["approved", "approved"]);
    expect([await versionsOf("a"), await versionsOf("b")]).toEqual([[], []]);
  });
});

describe("Releasing many goes in groups (112)", () => {
  it("releases a group and what depends on it in one batch, and leaves a group that can't go", async () => {
    const pair1 = await bundle("ping", ["pong"]);
    const pair2 = await bundle("pong", ["ping"]);
    await submitDraft(asAuthor, pair1, app, storage);
    await approve(pair1);
    await approve(pair2);
    const user = await bundle("user", ["ping"]);
    await submitDraft(asAuthor, user, app, storage);
    await approve(user);
    const waiting = await server("waiting");
    const held = await bundle("held", ["waiting"]);
    await submitDraft(asAuthor, held, app, storage);
    await approve(held);

    const results = await releaseMany(
      asAuthor,
      { ids: [user, held], settings: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    expect(Object.fromEntries(results.map((r) => [r.name, r.result]))).toEqual({
      "@team/ping": "published",
      "@team/pong": "published",
      "@team/user": "published",
      "@team/held": "not_releasable",
    });
    expect(await statusOf(waiting)).toBe("submitted");
  });
});

describe("Release together, the hard cases (112)", () => {
  it("in bulk, takes back what it brought for an item that can't go", async () => {
    const b = await server("b");
    const c = await server("c");
    const a = await bundle("a", ["b", "c"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    await approve(b);
    const results = await releaseMany(
      asAuthor,
      { ids: [a], settings: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    expect(results.map((r) => [r.name, r.result])).toEqual([["@team/a", "not_releasable"]]);
    expect([await statusOf(b), await statusOf(c)]).toEqual(["approved", "submitted"]);
    expect(await versionsOf("b")).toEqual([]);
  });

  it("refuses when a dependency outside the group is yanked while it's being released", async () => {
    const x = await server("x");
    await submitDraft(asAuthor, x, app, storage);
    await approve(x);
    await release(x);
    const a = await bundle("a", ["x"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    // x 1.0.0 is yanked after the checks, while a's artifact is being stored.
    const yanking: StorageAdapter = {
      ...storage,
      put: async (key, bytes) => {
        await storage.put(key, bytes);
        await t.db
          .updateTable("item_versions")
          .set({ yanked_at: toDbDate(new Date(), t.dialect), yank_reason: "Broken." })
          .execute();
      },
    };
    const refused = await release(a, asAuthor, yanking).catch((error) => error);
    expect(refused.message).toBe(
      "It can't be released yet: No published version of @team/x matches ^1.0.0.",
    );
    expect(await statusOf(a)).toBe("approved");
    expect(await versionsOf("a")).toEqual([]);
  });

  it("isn't blocked for good by an artifact a failed release left behind", async () => {
    const b = await server("b");
    const a = await bundle("a", ["b"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    await approve(b);
    // b's artifact is stored, then a's fails: nothing is released.
    const failing: StorageAdapter = {
      ...storage,
      put: async (key, bytes) => {
        if (key.startsWith("team/a/")) throw new Error("The disk is full.");
        return storage.put(key, bytes);
      },
    };
    await expect(release(a, asAuthor, failing)).rejects.toThrow("The disk is full.");
    expect(await storage.exists("team/b/1.0.0.tgz")).toBe(true);
    // b comes back with other content, and is released as 1.0.0 all the same.
    await withdrawSubmission(asAuthor, a, app);
    await withdrawSubmission(asAuthor, b, app);
    const other = await draftWith(
      "team",
      "b",
      "mcp-server",
      'name: "@team/b"\ntype: mcp-server\ndescription: Another server.\nmcp-server:\n  transport: stdio\n  command: npx\n',
    );
    await submitDraft(asAuthor, other, app, storage);
    await approve(other);
    const released = await release(other);
    expect(released.version).toBe("1.0.0");
    const row = await t.db
      .selectFrom("item_versions")
      .select("artifact_path")
      .where("id", "=", released.versionId)
      .executeTakeFirstOrThrow();
    expect(row.artifact_path).toMatch(/^team\/b\/1\.0\.0-[0-9a-f]{12}\.tgz$/);
  });

  it("says which range a member's version misses, as a pre-release", async () => {
    const b = await server("b");
    const a = await bundle("a", ["b"]);
    await submitDraft(asAuthor, a, app, storage);
    await approve(a);
    await approve(b);
    const refused = await publishSubmission(
      asAuthor,
      a,
      { choice: { kind: "prerelease", id: "beta", bump: "minor" } },
      app,
      storage,
    ).catch((error) => error);
    expect(refused.message).toBe(
      "It can't be released yet: @team/b goes out as 1.0.0-beta.1, which @team/a's range ^1.0.0 doesn't match.",
    );
  });
});
