import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
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
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { NotAMemberError, SubmissionNotFoundError } from "../exceptions/errors";
import { itemNameOf } from "../models/submission";
import { createDraft, saveDraftFiles } from "./drafts";
import { prepareRelease, publishSubmission, releaseMany } from "./publish";
import {
  approveMany,
  comment,
  countDependents,
  countNeedsReview,
  decide,
  getReview,
  listDependents,
  listQueue,
} from "./reviews";
import { submitDraft, viewSubmission } from "./submissions";

// Reviewing and releasing happen in the item's workspace (091): a moderator of acme approves,
// releases and sees acme's submissions, and nothing of beta's; root does both.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
const ws: Record<"acme" | "beta", string> = { acme: "", beta: "" };
let authorId: string;
let asRoot: Headers;
let asAuthor: Headers;
let asAcmeMod: Headers;
let asBetaMod: Headers;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-workspace-reviews-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  asRoot = await signedIn("root@example.com");
  for (const name of ["acme", "beta"] as const) {
    ws[name] = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
      name,
      description: `The ${name} team.`,
      visibility: "public",
      createdBy: null,
      createdAt: new Date(),
    });
    await createScope(
      asRoot,
      { name, description: `${name}'s tools.`, workspaceId: ws[name] },
      app,
    );
  }
  authorId = await createTestUser(app, { email: "author@example.com", password });
  const acmeMod = await createTestUser(app, { email: "acme-mod@example.com", password });
  const betaMod = await createTestUser(app, { email: "beta-mod@example.com", password });
  for (const name of ["acme", "beta"] as const)
    await setWorkspaceRole(app, authorId, "user", ws[name]);
  await setWorkspaceRole(app, acmeMod, "moderator", ws.acme);
  await setWorkspaceRole(app, betaMod, "moderator", ws.beta);
  asAuthor = await signedIn("author@example.com");
  asAcmeMod = await signedIn("acme-mod@example.com");
  asBetaMod = await signedIn("beta-mod@example.com");
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A valid skill in `scope`, submitted by the author. */
const submitted = async (scope: "acme" | "beta", name = "fmt") => {
  // Each workspace has a scope of its own name (118: `@acme/acme/acme`).
  const draft = await createDraft(
    asAuthor,
    { scope: `@${scope}/${scope}`, name, type: "skill" },
    app,
  );
  await saveDraftFiles(
    asAuthor,
    draft.id,
    {
      writes: draft.files.map((file) => ({
        path: file.path,
        encoding: "utf8" as const,
        content: file.content.replace('description: ""', "description: Formats code."),
        executable: file.executable,
        loadedAt: file.updatedAt,
      })),
      deletes: [],
    },
    app,
  );
  await submitDraft(asAuthor, draft.id, app, storage);
  return draft.id;
};

const status = async (id: string) =>
  (
    await t.db
      .selectFrom("submissions")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).status;

const stable = { choice: { kind: "stable" as const, bump: "patch" as const } };

describe("reviewing in a workspace (091)", () => {
  it("a moderator of acme sees and decides acme's submissions, and can't see beta's", async () => {
    const inAcme = await submitted("acme");
    const inBeta = await submitted("beta");
    await expect(getReview(asAcmeMod, inBeta, app, storage)).rejects.toThrow(
      SubmissionNotFoundError,
    );
    await expect(viewSubmission(asAcmeMod, inBeta, app)).rejects.toThrow(SubmissionNotFoundError);
    await expect(decide(asAcmeMod, inBeta, { decision: "approve" }, app)).rejects.toThrow(
      SubmissionNotFoundError,
    );
    await expect(comment(asAcmeMod, inBeta, { body: "Looks fine." }, app)).rejects.toThrow(
      SubmissionNotFoundError,
    );
    expect(await status(inBeta)).toBe("submitted");

    expect((await getReview(asAcmeMod, inAcme, app, storage)).can.decide).toBe(true);
    await decide(asAcmeMod, inAcme, { decision: "approve" }, app);
    expect(await status(inAcme)).toBe("approved");
  });

  it("shows each moderator only their workspaces' queue and counts; root sees every one", async () => {
    await submitted("acme");
    await submitted("beta", "lint");
    await submitted("beta", "fmt");
    const names = async (headers: Headers, workspace?: string) =>
      (await listQueue(headers, { tab: "needs", workspace }, app)).rows.map((row) =>
        itemNameOf(row),
      );
    expect(await names(asAcmeMod)).toEqual(["@acme/acme/fmt"]);
    expect(await names(asBetaMod)).toEqual(["@beta/beta/lint", "@beta/beta/fmt"]);
    expect(await names(asRoot)).toEqual(["@acme/acme/fmt", "@beta/beta/lint", "@beta/beta/fmt"]);
    expect(await countNeedsReview(asAcmeMod, app)).toBe(1);
    expect(await countNeedsReview(asBetaMod, app)).toBe(2);
    expect(await countNeedsReview(asRoot, app)).toBe(3);
    expect(await countNeedsReview(asAuthor, app)).toBe(0);
    // The queue's Workspace filter: the ones the reviewer moderates; another's matches nothing.
    expect(
      (await listQueue(asAcmeMod, { tab: "needs" }, app)).workspaces.map((w) => w.name),
    ).toEqual(["acme"]);
    expect((await listQueue(asRoot, { tab: "needs" }, app)).workspaces.map((w) => w.name)).toEqual([
      "acme",
      "beta",
      "global",
    ]);
    expect(await names(asRoot, "beta")).toEqual(["@beta/beta/lint", "@beta/beta/fmt"]);
    expect(await names(asAcmeMod, "beta")).toEqual([]);
    await expect(listQueue(asAuthor, { tab: "needs" }, app)).rejects.toThrow(ForbiddenError);
  });

  it("approving many skips what's outside the reviewer's workspaces, as not found", async () => {
    const inAcme = await submitted("acme");
    const inBeta = await submitted("beta");
    const results = await approveMany(
      asAcmeMod,
      {
        items: [
          { id: inAcme, revision: 1 },
          { id: inBeta, revision: 1 },
        ],
      },
      app,
    );
    // Another workspace's is "not found", as its review page is: nothing about it is revealed.
    expect(results).toEqual([
      expect.objectContaining({ id: inAcme, result: "approved" }),
      { id: inBeta, result: "not_found" },
    ]);
    expect(await status(inBeta)).toBe("submitted");
  });

  it("says why for your own submission in a workspace you don't moderate", async () => {
    // acme's moderator is a plain user in beta, and submits there.
    const both = await createTestUser(app, { email: "both@example.com", password });
    await setWorkspaceRole(app, both, "moderator", ws.acme);
    await setWorkspaceRole(app, both, "user", ws.beta);
    const asBoth = await signedIn("both@example.com");
    const draft = await createDraft(
      asBoth,
      { scope: "@beta/beta", name: "mine", type: "skill" },
      app,
    );
    await saveDraftFiles(
      asBoth,
      draft.id,
      {
        writes: draft.files.map((file) => ({
          path: file.path,
          encoding: "utf8" as const,
          content: file.content.replace('description: ""', "description: Mine."),
          executable: file.executable,
          loadedAt: file.updatedAt,
        })),
        deletes: [],
      },
      app,
    );
    await submitDraft(asBoth, draft.id, app, storage);
    expect(await approveMany(asBoth, { items: [{ id: draft.id, revision: 1 }] }, app)).toEqual([
      expect.objectContaining({ result: "not_approvable", reason: "Not a moderator in beta" }),
    ]);
  });
});

describe("releasing in a workspace (091)", () => {
  it("a moderator releases their workspace's approved ones, not another's; root both", async () => {
    const inAcme = await submitted("acme");
    const inBeta = await submitted("beta");
    await decide(asAcmeMod, inAcme, { decision: "approve" }, app);
    await decide(asBetaMod, inBeta, { decision: "approve" }, app);
    await expect(publishSubmission(asAcmeMod, inBeta, stable, app, storage)).rejects.toThrow(
      SubmissionNotFoundError,
    );
    const prepared = await prepareRelease(asAcmeMod, { ids: [inAcme, inBeta] }, app, storage);
    expect(prepared.candidates.map((c) => c.id)).toEqual([inAcme]);
    expect(prepared.refused).toEqual([
      expect.objectContaining({ id: inBeta, result: "not_found" }),
    ]);
    await publishSubmission(asAcmeMod, inAcme, stable, app, storage);
    await publishSubmission(asRoot, inBeta, stable, app, storage);
    expect([await status(inAcme), await status(inBeta)]).toEqual(["published", "published"]);
  });

  it("releasing many: another workspace's isn't found; a removed author's own says why", async () => {
    const inBeta = await submitted("beta");
    await decide(asBetaMod, inBeta, { decision: "approve" }, app);
    // A moderator of acme who is a plain user in beta doesn't see beta's submissions at all.
    const both = await createTestUser(app, { email: "both@example.com", password });
    await setWorkspaceRole(app, both, "moderator", ws.acme);
    await setWorkspaceRole(app, both, "user", ws.beta);
    const settings = { kind: "stable" as const, bump: "suggested" as const };
    expect(
      await releaseMany(
        await signedIn("both@example.com"),
        { ids: [inBeta], settings },
        app,
        storage,
      ),
    ).toEqual([expect.objectContaining({ id: inBeta, result: "not_found" })]);

    await t.db
      .deleteFrom("workspace_members")
      .where("workspace_id", "=", ws.beta)
      .where("user_id", "=", authorId)
      .execute();
    expect(await releaseMany(asAuthor, { ids: [inBeta], settings }, app, storage)).toEqual([
      expect.objectContaining({
        id: inBeta,
        result: "not_releasable",
        reason: new NotAMemberError("beta", "release your items there").message,
      }),
    ]);
    expect(await status(inBeta)).toBe("approved");
  });

  it("the author releases their own approved one while a member, and not once removed", async () => {
    const first = await submitted("acme", "fmt");
    const second = await submitted("acme", "lint");
    for (const id of [first, second]) await decide(asAcmeMod, id, { decision: "approve" }, app);
    expect((await getReview(asAuthor, first, app, storage)).can.publish).toBe(true);
    await publishSubmission(asAuthor, first, stable, app, storage);

    await t.db
      .deleteFrom("workspace_members")
      .where("workspace_id", "=", ws.acme)
      .where("user_id", "=", authorId)
      .execute();
    const review = await getReview(asAuthor, second, app, storage);
    expect(review.can).toMatchObject({ publish: false, comment: false });
    await expect(publishSubmission(asAuthor, second, stable, app, storage)).rejects.toThrow(
      NotAMemberError,
    );
    await expect(comment(asAuthor, second, { body: "Any news?" }, app)).rejects.toThrow(
      NotAMemberError,
    );
    // Its workspace's moderators still decide and release it.
    await publishSubmission(asAcmeMod, second, stable, app, storage);
    expect(await status(second)).toBe("published");
  });
});

describe("dependents across workspaces (091)", () => {
  /** A submitted rule in `scope` that depends on `on`. */
  const dependent = async (scope: "acme" | "beta", name: string, on: string) => {
    const draft = await createDraft(
      asAuthor,
      { scope: `@${scope}/${scope}`, name, type: "rule" },
      app,
    );
    const manifest = draft.files.find((f) => f.path === "ronne.yaml");
    if (!manifest) throw new Error("no manifest");
    await saveDraftFiles(
      asAuthor,
      draft.id,
      {
        writes: draft.files.map((file) => ({
          path: file.path,
          encoding: "utf8" as const,
          content:
            file.path === "ronne.yaml"
              ? `${file.content.replace('description: ""', "description: A rule.")}dependencies:\n  "${on}": "^1.0.0"\n`
              : file.content,
          executable: file.executable,
          loadedAt: file.updatedAt,
        })),
        deletes: [],
      },
      app,
    );
    await submitDraft(asAuthor, draft.id, app, storage);
    return draft.id;
  };

  it("lists only the dependents the reviewer could open, and nothing without a session", async () => {
    const fmt = await submitted("acme");
    await dependent("acme", "house-style", "@acme/acme/fmt");
    await dependent("beta", "secret-plan", "@acme/acme/fmt");
    const names = async (headers: Headers) =>
      (await listDependents(headers, fmt, app)).map((d) => d.name);
    expect(await names(asAcmeMod)).toEqual(["@acme/acme/house-style"]);
    expect(await names(asRoot)).toEqual(["@acme/acme/house-style", "@beta/beta/secret-plan"]);
    expect((await getReview(asAcmeMod, fmt, app, storage)).dependents.map((d) => d.name)).toEqual([
      "@acme/acme/house-style",
    ]);
    // The author's withdraw warning counts every one, in any workspace: only the number.
    expect(await countDependents(asAuthor, fmt, app)).toBe(2);
    await expect(listDependents(asBetaMod, fmt, app)).rejects.toThrow(SubmissionNotFoundError);
    await expect(countDependents(asBetaMod, fmt, app)).rejects.toThrow(SubmissionNotFoundError);
    await expect(listDependents(new Headers(), fmt, app)).rejects.toThrow(ForbiddenError);
  });
});
