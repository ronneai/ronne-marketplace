import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import {
  cookieHeaders,
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../../identity/testing/test-auth";
import { createScope, listScopes } from "../../items/actions/scopes";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import { NotAMemberError } from "../exceptions/errors";
import {
  createDraft,
  deleteDraft,
  getDraft,
  listMySubmissions,
  renameDraft,
  saveDraftFiles,
} from "./drafts";
import { decide } from "./reviews";
import {
  checkManyDrafts,
  checkSubmission,
  restoreSubmission,
  submitDraft,
  submitManyDrafts,
  viewSubmission,
  withdrawSubmission,
} from "./submissions";

// Drafts, proposals and submits need membership of the scope's workspace (091). A removed member
// still reads, withdraws and deletes their own, but can't edit, submit, resubmit or restore them.
let t: TestDb;
let app: AppAuth;
let acme: string;
let memberId: string;
let asRoot: Headers;
let asMember: Headers;
let asOutsider: Headers;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  memberId = await createTestUser(app, { email: "member@example.com", password });
  // A moderator of global, to show a role elsewhere gives nothing in acme.
  await createTestUser(app, { email: "outsider@example.com", password, role: "moderator" });
  asRoot = await signedIn("root@example.com");
  asMember = await signedIn("member@example.com");
  asOutsider = await signedIn("outsider@example.com");
  acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name: "acme",
    description: "Acme's team.",
    visibility: "public",
    createdBy: null,
    createdAt: new Date(),
  });
  await setWorkspaceRole(app, memberId, "user", acme);
  await createScope(asRoot, { name: "acme", description: "Acme's tools.", workspaceId: acme }, app);
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(() => t.cleanup());

const removeMember = () =>
  t.db
    .deleteFrom("workspace_members")
    .where("workspace_id", "=", acme)
    .where("user_id", "=", memberId)
    .execute();

/** A draft of a valid skill in @acme, ready to submit. */
const readyDraft = async (name = "fmt") => {
  const draft = await createDraft(asMember, { scope: "acme", name, type: "skill" }, app);
  await saveDraftFiles(
    asMember,
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
  return draft;
};

const status = async (id: string) =>
  (
    await t.db
      .selectFrom("submissions")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).status;

describe("drafting in a workspace (091)", () => {
  it("offers only the scopes of your workspaces in the new draft form; root gets every one", async () => {
    const names = async (headers: Headers) =>
      (await listScopes(headers, {}, app)).scopes.map((s) => `${s.name}:${s.role}`);
    expect(await names(asMember)).toEqual(["acme:user", "team:user"]);
    expect(await names(asOutsider)).toEqual(["team:moderator"]);
    expect(await names(asRoot)).toEqual(["acme:root", "team:root"]);
  });

  it("lets a member draft in acme and refuses everyone else, a moderator elsewhere too", async () => {
    await expect(
      createDraft(asOutsider, { scope: "acme", name: "fmt", type: "skill" }, app),
    ).rejects.toThrow(new NotAMemberError("acme"));
    await expect(
      createDraft(asMember, { scope: "acme", name: "fmt", type: "skill" }, app),
    ).resolves.toMatchObject({ workspace: { id: acme, name: "acme" } });
    await expect(
      createDraft(asRoot, { scope: "acme", name: "lint", type: "skill" }, app),
    ).resolves.toMatchObject({ status: "draft" });
  });

  it("refuses moving a draft into a workspace you aren't in", async () => {
    const draft = await createDraft(asOutsider, { scope: "team", name: "fmt", type: "skill" }, app);
    await expect(
      renameDraft(asOutsider, draft.id, { scope: "acme", name: "fmt" }, app),
    ).rejects.toThrow(NotAMemberError);
    expect((await getDraft(asOutsider, draft.id, app)).scope.name).toBe("team");
  });
});

describe("a removed member's drafts and submissions (091)", () => {
  it("reads and lists them, but can't save, check, submit or rename a draft", async () => {
    const draft = await readyDraft();
    await removeMember();
    expect((await getDraft(asMember, draft.id, app)).id).toBe(draft.id);
    expect((await viewSubmission(asMember, draft.id, app)).mine).toBe(true);
    expect((await listMySubmissions(asMember, app)).map((s) => s.id)).toEqual([draft.id]);
    await expect(
      saveDraftFiles(asMember, draft.id, { writes: [], deletes: [] }, app),
    ).rejects.toThrow(NotAMemberError);
    await expect(checkSubmission(asMember, draft.id, app)).rejects.toThrow(NotAMemberError);
    await expect(submitDraft(asMember, draft.id, app)).rejects.toThrow(NotAMemberError);
    await expect(
      renameDraft(asMember, draft.id, { scope: "acme", name: "other" }, app),
    ).rejects.toThrow(NotAMemberError);
    expect(await status(draft.id)).toBe("draft");
  });

  it("can't move a draft out of the workspace either", async () => {
    const draft = await readyDraft();
    await removeMember();
    await expect(
      renameDraft(asMember, draft.id, { scope: "team", name: "fmt" }, app),
    ).rejects.toThrow(new NotAMemberError("acme"));
    expect((await getDraft(asMember, draft.id, app)).scope.name).toBe("acme");
  });

  it("can't resubmit one sent back for changes, or change it, and sees it read-only", async () => {
    const draft = await readyDraft();
    await submitDraft(asMember, draft.id, app);
    await decide(asRoot, draft.id, { decision: "request_changes", message: "Fix it." }, app);
    await removeMember();
    await expect(submitDraft(asMember, draft.id, app)).rejects.toThrow(NotAMemberError);
    await expect(
      saveDraftFiles(asMember, draft.id, { writes: [], deletes: [] }, app),
    ).rejects.toThrow(NotAMemberError);
    expect(await status(draft.id)).toBe("changes_requested");
    expect(await viewSubmission(asMember, draft.id, app)).toMatchObject({
      mine: true,
      member: false,
    });
  });

  it("can still delete a draft", async () => {
    const draft = await readyDraft();
    await removeMember();
    await deleteDraft(asMember, draft.id, app);
    expect(await t.db.selectFrom("submissions").select("id").execute()).toEqual([]);
  });

  it("withdraws a submission in review, and can't restore it", async () => {
    const draft = await readyDraft();
    await submitDraft(asMember, draft.id, app);
    await removeMember();
    await withdrawSubmission(asMember, draft.id, app, "archive");
    expect(await status(draft.id)).toBe("withdrawn");
    await expect(restoreSubmission(asMember, draft.id, app)).rejects.toThrow(NotAMemberError);
    expect(await status(draft.id)).toBe("withdrawn");
  });

  it("bulk check and submit skip it with the reason, and still submit the others", async () => {
    const inAcme = await readyDraft("fmt");
    const elsewhere = await createDraft(asMember, { scope: "team", name: "x", type: "skill" }, app);
    await removeMember();
    const checked = await checkManyDrafts(asMember, { ids: [inAcme.id, elsewhere.id] }, app);
    expect(checked.drafts.map((d) => [d.id, d.result])).toEqual([
      [inAcme.id, "not_a_member"],
      [elsewhere.id, "not_ready"],
    ]);
    const [skipped] = (await submitManyDrafts(asMember, { ids: [inAcme.id] }, app)).results;
    expect(skipped).toMatchObject({
      result: "not_a_member",
      issues: [{ code: "not_a_member", message: new NotAMemberError("acme").message }],
    });
    expect(await status(inAcme.id)).toBe("draft");
  });
});
