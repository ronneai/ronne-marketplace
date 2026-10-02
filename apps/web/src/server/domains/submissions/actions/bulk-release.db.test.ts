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
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { BulkLimitError } from "../exceptions/errors";
import { createDraft, getDraft, saveDraftFiles } from "./drafts";
import { proposeChange } from "./proposals";
import { prepareRelease, publishSubmission, releaseMany } from "./publish";
import { decide } from "./reviews";
import { submitDraft } from "./submissions";

// Releasing many at once (055): dependencies first, each on its own.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asAuthor: Headers;
let asOther: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-bulk-release-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password, name: "Ada Author" });
  await createTestUser(app, { email: "other@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asOther = await signedIn("other@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A draft with this ronne.yaml (and the template's other files), by `headers`. */
const draftWith = async (
  headers: Headers,
  name: string,
  type: "mcp-server" | "bundle",
  manifest: string,
) => {
  const draft = await createDraft(headers, { scope: "team", name, type }, app);
  const at = draft.files.find((f) => f.path === "ronne.yaml")?.updatedAt ?? null;
  await saveDraftFiles(
    headers,
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

const server = (name: string, headers = asAuthor) =>
  draftWith(
    headers,
    name,
    "mcp-server",
    `name: "@team/${name}"\ntype: mcp-server\ndescription: A server.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
  );
const bundle = (name: string, needs: string[], headers = asAuthor) =>
  draftWith(
    headers,
    name,
    "bundle",
    `name: "@team/${name}"\ntype: bundle\ndescription: A set.\ndependencies:\n${needs.map((n) => `  "@team/${n}": "^1.0.0"\n`).join("")}`,
  );

const approved = async (id: string, headers = asAuthor) => {
  await submitDraft(headers, id, app, storage);
  await decide(asModerator, id, { decision: "approve" }, app);
  return id;
};

const stable = { kind: "stable" as const, bump: "suggested" as const };
const release = (headers: Headers, ids: string[], store = storage) =>
  releaseMany(headers, { ids, settings: stable, notes: "Together." }, app, store);
const audited = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("releaseMany (055)", () => {
  it("adds an approved dependency for its dependent, and releases it first", async () => {
    const github = await approved(await server("github"));
    const kit = await approved(await bundle("kit", ["github"]));

    const prepared = await prepareRelease(asAuthor, { ids: [kit] }, app, storage);
    expect(prepared.candidates.map((c) => [c.name, c.includedFor, c.dependsOn])).toEqual([
      ["@team/github", ["@team/kit"], []],
      ["@team/kit", undefined, ["@team/github"]],
    ]);
    expect(prepared.candidates[0]).toMatchObject({ published: [], author: "Ada Author" });

    const results = await release(asAuthor, [kit]);
    expect(results.map((r) => [r.id, r.result, r.result === "published" && r.version])).toEqual([
      [github, "published", "1.0.0"],
      [kit, "published", "1.0.0"],
    ]);
    const published = await audited("version.published");
    expect(published.map((e) => (e.metadata as { via?: string }).via)).toEqual(["bulk", "bulk"]);
  });

  it("skips a dependent when its dependency in the batch fails, and releases the rest", async () => {
    await approved(await server("github"));
    const kit = await approved(await bundle("kit", ["github"]));
    const other = await approved(await server("other"));
    const failing: StorageAdapter = {
      ...storage,
      put: async (key, bytes) => {
        if (key.startsWith("team/github/")) throw new Error("The disk is full.");
        return storage.put(key, bytes);
      },
    };
    const results = await release(asAuthor, [kit, other], failing);
    expect(results.map((r) => [r.result, r.name])).toEqual([
      ["not_releasable", "@team/github"],
      ["skipped", "@team/kit"],
      ["published", "@team/other"],
    ]);
    expect(results[0]).toMatchObject({ reason: expect.stringContaining("The disk is full.") });
  });

  it("refuses a dependent whose dependency is still in review, or yanked", async () => {
    const github = await server("github");
    await submitDraft(asAuthor, github, app, storage);
    const kit = await approved(await bundle("kit", ["github"]));
    expect(await release(asAuthor, [kit])).toEqual([
      {
        id: kit,
        name: "@team/kit",
        result: "not_releasable",
        reason: "It waits on @team/github, which is submitted.",
      },
    ]);

    // Released, then yanked: nothing installable matches any more.
    await decide(asModerator, github, { decision: "approve" }, app);
    await publishSubmission(
      asAuthor,
      github,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    await t.db
      .updateTable("item_versions")
      .set({ yanked_at: toDbDate(new Date(), t.dialect) })
      .execute();
    const [yanked] = await release(asAuthor, [kit]);
    expect(yanked).toMatchObject({ result: "not_releasable" });
  });

  it("lets a user release only their own, and a moderator anyone's", async () => {
    const theirs = await approved(await server("theirs", asOther), asOther);
    // Someone else's submission looks the same as none to a user.
    expect((await release(asAuthor, [theirs]))[0]).toEqual({
      id: theirs,
      name: null,
      result: "not_found",
    });
    expect((await release(asModerator, [theirs]))[0]).toMatchObject({ result: "published" });
  });

  it("refuses the second of two proposals for one item once the first is out", async () => {
    const github = await approved(await server("github"));
    await publishSubmission(
      asAuthor,
      github,
      { choice: { kind: "stable", bump: "minor" } },
      app,
      storage,
    );
    const base = { item: "@team/github", version: "1.0.0" };
    const proposals: string[] = [];
    for (const readme of ["One.", "Two."]) {
      const proposal = await proposeChange(asAuthor, base, app, storage);
      const files = (await getDraft(asAuthor, proposal.id, app)).files;
      await saveDraftFiles(
        asAuthor,
        proposal.id,
        {
          writes: [
            {
              path: "README.md",
              encoding: "utf8",
              content: readme,
              executable: false,
              loadedAt: files.find((f) => f.path === "README.md")?.updatedAt ?? null,
            },
          ],
          deletes: [],
        },
        app,
      );
      proposals.push(await approved(proposal.id));
    }
    const results = await release(asAuthor, proposals);
    expect(results.map((r) => r.result)).toEqual(["published", "not_releasable"]);
    expect(results[1]).toMatchObject({ reason: expect.stringContaining("1.1.0") });
  });

  it("releases each once when two people release the same ones at once", async () => {
    const ids = [await approved(await server("one")), await approved(await server("two"))];
    const [a, b] = await Promise.all([release(asAuthor, ids), release(asModerator, ids)]);
    const published = [...a, ...b].filter((r) => r.result === "published");
    expect(published.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect(await audited("version.published")).toHaveLength(2);
  });

  it("takes at most 50", async () => {
    const many = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    await expect(release(asAuthor, many)).rejects.toThrow(BulkLimitError);
  });
});
