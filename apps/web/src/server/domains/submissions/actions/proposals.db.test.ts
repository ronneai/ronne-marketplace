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
import { UNFILTERED } from "../../workspaces/models/viewer";
import {
  ConflictNotFoundError,
  NotAMemberError,
  NotAProposalError,
  ProposalArtifactError,
  ProposalBaseNotFoundError,
  ProposalCurrentError,
  ProposalRenameError,
  SubmissionInvalidError,
  SubmissionStaleError,
} from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, getDraft, renameDraft, saveDraftFiles } from "./drafts";
import { proposalPanel, proposeChange, rebaseProposal, resolveConflict } from "./proposals";
import { publishSubmission } from "./publish";
import { decide, getReview } from "./reviews";
import { checkSubmission, submitDraft } from "./submissions";

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
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-proposals-"));
  storage = localStorage(storageRoot);
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "other@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asAuthor = await signedIn("author@example.com");
  asOther = await signedIn("other@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(
    await signedIn("root@example.com"),
    { name: "team", description: "A team." },
    app,
  );
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const text = (draft: { files: { path: string; content: string }[] }, path: string) =>
  draft.files.find((f) => f.path === path)?.content ?? "";

/** Writes files over a draft's, as the editor saves them. */
const write = async (headers: Headers, id: string, files: Record<string, string>) => {
  const draft = await getDraft(headers, id, app);
  await saveDraftFiles(
    headers,
    id,
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
};

/** Submits, approves and releases a submission. */
const release = async (
  headers: Headers,
  id: string,
  bump: "patch" | "minor" | "major" = "patch",
) => {
  await submitDraft(headers, id, app, storage);
  await decide(asModerator, id, { decision: "approve" }, app);
  return publishSubmission(headers, id, { choice: { kind: "stable", bump } }, app, storage);
};

/** @team/secure-coding 1.0.0, released by the author, with a README. */
const releasedSkill = async () => {
  const draft = await createDraft(
    asAuthor,
    { scope: "team", name: "secure-coding", type: "skill" },
    app,
  );
  const manifest = text(draft, "ronne.yaml").replace(
    'description: ""',
    "description: Checks code.",
  );
  await write(asAuthor, draft.id, {
    "ronne.yaml": manifest,
    "SKILL.md": text(draft, "SKILL.md").replace('description: ""', "description: Checks code."),
    "README.md": "# Secure coding\n\nVersion one.\n",
  });
  await release(asAuthor, draft.id);
};

describe("proposeChange", () => {
  it("needs membership of the item's workspace: a non-member reads it, but can't propose (091)", async () => {
    await releasedSkill();
    const other = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "other@example.com")
      .executeTakeFirstOrThrow();
    await t.db.deleteFrom("workspace_members").where("user_id", "=", other.id).execute();
    await expect(
      proposeChange(asOther, { item: "@team/secure-coding", version: "1.0.0" }, app, storage),
    ).rejects.toThrow(new NotAMemberError("global"));
    expect(
      await t.db.selectFrom("submissions").select("id").where("status", "=", "draft").execute(),
    ).toEqual([]);
    await setWorkspaceRole(app, other.id, "user");
    await expect(
      proposeChange(asOther, { item: "@team/secure-coding", version: "1.0.0" }, app, storage),
    ).resolves.toMatchObject({ status: "draft", workspace: { name: "global" } });
  });

  it("starts a draft from a version's files, with the item's scope, name and type", async () => {
    await releasedSkill();
    const draft = await proposeChange(
      asOther,
      { item: "@team/secure-coding", version: "1.0.0" },
      app,
      storage,
    );
    expect(draft).toMatchObject({
      scope: { name: "team" },
      name: "secure-coding",
      type: "skill",
      status: "draft",
      proposal: { baseVersion: "1.0.0" },
    });
    expect(draft.files.map((f) => f.path)).toEqual(["README.md", "SKILL.md", "ronne.yaml"]);
    expect(text(draft, "README.md")).toBe("# Secure coding\n\nVersion one.\n");
    // The release wrote `version` into the manifest; a proposal leaves it to the next release.
    expect(text(draft, "ronne.yaml")).toContain("description: Checks code.");
    expect(text(draft, "ronne.yaml")).not.toMatch(/^version:/m);
    // It reads back as a proposal too.
    expect((await getDraft(asOther, draft.id, app)).proposal).toMatchObject({
      baseVersion: "1.0.0",
    });
  });

  it("is released as the item's next version, and a later proposal can start from either", async () => {
    await releasedSkill();
    const first = await proposeChange(
      asOther,
      { item: "@team/secure-coding", version: "1.0.0" },
      app,
      storage,
    );
    // Two open proposals for one item are fine: neither needs a free name.
    const second = await proposeChange(
      asAuthor,
      { item: "@team/secure-coding", version: "1.0.0" },
      app,
      storage,
    );
    await write(asOther, first.id, { "README.md": "# Secure coding\n\nVersion two.\n" });
    await write(asAuthor, second.id, { "NOTES.md": "Another change.\n" });
    await submitDraft(asAuthor, second.id, app, storage);
    expect((await release(asOther, first.id, "minor")).version).toBe("1.1.0");

    const fromOld = await proposeChange(
      asOther,
      { item: "@team/secure-coding", version: "1.0.0" },
      app,
      storage,
    );
    expect(text(fromOld, "README.md")).toContain("Version one.");
    const fromNew = await proposeChange(
      asOther,
      { item: "@team/secure-coding", version: "1.1.0" },
      app,
      storage,
    );
    expect(fromNew.proposal?.baseVersion).toBe("1.1.0");
    expect(text(fromNew, "README.md")).toContain("Version two.");
  });

  it("keeps the scope and name: renaming a proposal is refused", async () => {
    await releasedSkill();
    const draft = await proposeChange(
      asOther,
      { item: "@team/secure-coding", version: "1.0.0" },
      app,
      storage,
    );
    await expect(
      renameDraft(asOther, draft.id, { scope: "team", name: "other-name" }, app),
    ).rejects.toThrow(ProposalRenameError);
  });

  it("refuses unknown items and versions, a missing artifact, and signed-out users", async () => {
    await releasedSkill();
    await expect(
      proposeChange(asOther, { item: "@team/nope", version: "1.0.0" }, app, storage),
    ).rejects.toThrow(ProposalBaseNotFoundError);
    await expect(
      proposeChange(asOther, { item: "not a name", version: "1.0.0" }, app, storage),
    ).rejects.toThrow(ProposalBaseNotFoundError);
    await expect(
      proposeChange(asOther, { item: "@team/secure-coding", version: "9.9.9" }, app, storage),
    ).rejects.toThrow(ProposalBaseNotFoundError);
    await expect(
      proposeChange(
        asOther,
        { item: "@team/secure-coding", version: "1.0.0" },
        app,
        localStorage(join(storageRoot, "empty")),
      ),
    ).rejects.toThrow(ProposalArtifactError);
    await expect(
      proposeChange(new Headers(), { item: "@team/secure-coding", version: "1.0.0" }, app, storage),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("stale proposals", () => {
  it("go stale when a newer version is released, and can't be approved or released", async () => {
    await releasedSkill();
    const item = { item: "@team/secure-coding", version: "1.0.0" };
    const first = await proposeChange(asOther, item, app, storage);
    const second = await proposeChange(asOther, item, app, storage);
    const third = await proposeChange(asAuthor, item, app, storage);
    for (const [headers, id, readme] of [
      [asOther, first.id, "One."],
      [asOther, second.id, "Two."],
      [asAuthor, third.id, "Three."],
    ] as const) {
      await write(headers, id, { "README.md": readme });
      await submitDraft(headers, id, app, storage);
    }
    // The third is approved before anything else is released.
    await decide(asModerator, third.id, { decision: "approve" }, app);
    await decide(asModerator, first.id, { decision: "approve" }, app);
    await publishSubmission(
      asOther,
      first.id,
      { choice: { kind: "stable", bump: "patch" } },
      app,
      storage,
    );

    // 1.0.1 is out: reviewers see it's stale, the second can't be approved, and the approved third
    // can't be released.
    expect((await getReview(asModerator, second.id, app, storage)).proposal?.stale).toBe("1.0.1");
    await expect(decide(asModerator, second.id, { decision: "approve" }, app)).rejects.toThrow(
      SubmissionStaleError,
    );
    await expect(
      publishSubmission(
        asAuthor,
        third.id,
        { choice: { kind: "stable", bump: "patch" } },
        app,
        storage,
      ),
    ).rejects.toThrow(/1\.0\.1 has been released since/);
    // Other decisions still work on a stale proposal.
    await decide(
      asModerator,
      second.id,
      { decision: "request_changes", message: "Rebase, please." },
      app,
    );
    expect((await getReview(asModerator, second.id, app, storage)).submission.status).toBe(
      "changes_requested",
    );
  });

  it("aren't made stale by a pre-release, or by a yanked newer version", async () => {
    await releasedSkill();
    const item = { item: "@team/secure-coding", version: "1.0.0" };
    const beta = await proposeChange(asOther, item, app, storage);
    await write(asOther, beta.id, { "README.md": "Beta." });
    await submitDraft(asOther, beta.id, app, storage);
    await decide(asModerator, beta.id, { decision: "approve" }, app);
    await publishSubmission(
      asOther,
      beta.id,
      { choice: { kind: "prerelease", id: "beta", bump: "minor" } },
      app,
      storage,
    );
    const waiting = await proposeChange(asAuthor, item, app, storage);
    await write(asAuthor, waiting.id, { "README.md": "Stable." });
    await submitDraft(asAuthor, waiting.id, app, storage);
    await expect(
      decide(asModerator, waiting.id, { decision: "approve" }, app),
    ).resolves.toMatchObject({
      status: "approved",
    });
  });
});

describe("rebase", () => {
  const item = { item: "@team/secure-coding", version: "1.0.0" };
  /** Someone else's proposal released as 1.1.0, changing `files`. */
  const releaseNewer = async (files: Record<string, string>) => {
    const newer = await proposeChange(asAuthor, item, app, storage);
    await write(asAuthor, newer.id, files);
    await release(asAuthor, newer.id, "minor");
  };

  it("merges what each side changed, and the result is released as the next version", async () => {
    await releasedSkill();
    const mine = await proposeChange(asOther, item, app, storage);
    await write(asOther, mine.id, { "README.md": "# Mine\n", "NOTES.md": "Added.\n" });
    const skill = text(await getDraft(asOther, mine.id, app), "SKILL.md");
    await releaseNewer({ "SKILL.md": `${skill}\nMore from 1.1.0.\n` });

    const rebased = await rebaseProposal(asOther, mine.id, app, storage);
    expect(rebased).toMatchObject({
      status: "draft",
      conflicts: [],
      proposal: { baseVersion: "1.1.0", conflicts: [] },
    });
    expect(text(rebased, "README.md")).toBe("# Mine\n");
    expect(text(rebased, "NOTES.md")).toBe("Added.\n");
    expect(text(rebased, "SKILL.md")).toContain("More from 1.1.0.");
    // What's saved matches what was returned.
    const saved = await getDraft(asOther, mine.id, app);
    expect(saved.proposal?.baseVersion).toBe("1.1.0");
    expect(text(saved, "SKILL.md")).toContain("More from 1.1.0.");
    await expect(rebaseProposal(asOther, mine.id, app, storage)).rejects.toThrow(
      ProposalCurrentError,
    );

    expect((await release(asOther, mine.id, "minor")).version).toBe("1.2.0");
  });

  it("lists conflicts, refuses to submit until they're resolved, and sends a submitted proposal back", async () => {
    await releasedSkill();
    const mine = await proposeChange(asOther, item, app, storage);
    await write(asOther, mine.id, { "README.md": "# Mine\n" });
    await submitDraft(asOther, mine.id, app, storage);
    await releaseNewer({ "README.md": "# Theirs\n" });

    const rebased = await rebaseProposal(asOther, mine.id, app, storage);
    expect(rebased).toMatchObject({ status: "changes_requested", conflicts: ["README.md"] });
    expect(text(rebased, "README.md")).toBe("# Mine\n");
    const events = await kyselySubmissionRepository(t.db, t.dialect, UNFILTERED).events(mine.id);
    expect(events.at(-1)).toMatchObject({ kind: "rebase", body: "1.1.0" });

    await expect(submitDraft(asOther, mine.id, app, storage)).rejects.toThrow(
      SubmissionInvalidError,
    );
    await expect(resolveConflict(asOther, mine.id, "SKILL.md", app, storage)).rejects.toThrow(
      ConflictNotFoundError,
    );
    expect(await resolveConflict(asOther, mine.id, "README.md", app, storage)).toEqual([]);
    await expect(submitDraft(asOther, mine.id, app, storage)).resolves.toMatchObject({
      status: "submitted",
    });
    await expect(decide(asModerator, mine.id, { decision: "approve" }, app)).resolves.toMatchObject(
      {
        status: "approved",
      },
    );
  });

  it("a removed member opens their stale proposal, but can't rebase it or resolve its conflicts (091)", async () => {
    await releasedSkill();
    const mine = await proposeChange(asOther, item, app, storage);
    await write(asOther, mine.id, { "README.md": "# Mine\n" });
    await submitDraft(asOther, mine.id, app, storage);
    await releaseNewer({ "README.md": "# Theirs\n" });
    await rebaseProposal(asOther, mine.id, app, storage);
    const other = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "other@example.com")
      .executeTakeFirstOrThrow();
    await t.db.deleteFrom("workspace_members").where("user_id", "=", other.id).execute();

    const panel = await proposalPanel(asOther, mine.id, app, storage);
    expect(panel.conflicts.map((c) => c.path)).toEqual(["README.md"]);
    await expect(resolveConflict(asOther, mine.id, "README.md", app, storage)).rejects.toThrow(
      NotAMemberError,
    );
    await expect(submitDraft(asOther, mine.id, app, storage)).rejects.toThrow(NotAMemberError);
    // Refused before anything else is looked at, current or not.
    await expect(rebaseProposal(asOther, mine.id, app, storage)).rejects.toThrow(NotAMemberError);
    expect((await getDraft(asOther, mine.id, app)).proposal).toMatchObject({
      baseVersion: "1.1.0",
      conflicts: ["README.md"],
    });
  });

  it("is for the author's own proposals only", async () => {
    await releasedSkill();
    const mine = await proposeChange(asOther, item, app, storage);
    await expect(rebaseProposal(asOther, mine.id, app, storage)).rejects.toThrow(
      ProposalCurrentError,
    );
    await expect(rebaseProposal(asAuthor, mine.id, app, storage)).rejects.toThrow(/doesn't exist/);
    const fresh = await createDraft(asOther, { scope: "team", name: "new-one", type: "rule" }, app);
    await expect(rebaseProposal(asOther, fresh.id, app, storage)).rejects.toThrow(
      NotAProposalError,
    );
  });
});

describe("the review of a proposal", () => {
  const item = { item: "@team/secure-coding", version: "1.0.0" };

  it("refuses to submit a proposal that changes nothing", async () => {
    await releasedSkill();
    const draft = await proposeChange(asOther, item, app, storage);
    await expect(submitDraft(asOther, draft.id, app, storage)).rejects.toThrow(
      SubmissionInvalidError,
    );
    const issues = await checkSubmission(asOther, draft.id, app, storage);
    expect(issues.map((i) => i.message)).toEqual([
      "No changes to 1.0.0: change something before submitting.",
    ]);
    // Arranging the canvas (031) changes nothing that would be released.
    await write(asOther, draft.id, { ".ronne/layout.json": '{"version":1,"nodes":{}}\n' });
    expect((await checkSubmission(asOther, draft.id, app, storage)).map((i) => i.code)).toEqual([
      "no_changes",
    ]);
  });

  /** Saves `files` over the proposal with `using` as storage, and returns what the save answers. */
  const saveWith = async (id: string, files: Record<string, string>, using: StorageAdapter) => {
    const draft = await getDraft(asOther, id, app);
    return saveDraftFiles(
      asOther,
      id,
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
      using,
    );
  };

  it("says on save that it changes nothing, as Submit would (#142)", async () => {
    await releasedSkill();
    const draft = await proposeChange(asOther, item, app, storage);
    const readme = text(draft, "README.md");
    const same = await saveWith(draft.id, { "README.md": readme }, storage);
    expect(same.submitIssues).toEqual(await checkSubmission(asOther, draft.id, app, storage));
    expect(same.submitIssues.map((i) => i.code)).toEqual(["no_changes"]);
    const changed = await saveWith(draft.id, { "README.md": `${readme}More.\n` }, storage);
    expect(changed.submitIssues).toEqual([]);
  });

  it("keeps the registry's issues when the base version can't be read on save (#142)", async () => {
    await releasedSkill();
    const draft = await proposeChange(asOther, item, app, storage);
    const unreadable: StorageAdapter = {
      ...storage,
      get: async () => {
        throw new Error("The disk went away.");
      },
    };
    const saved = await saveWith(
      draft.id,
      {
        "ronne.yaml": `${text(draft, "ronne.yaml")}dependencies:\n  "@team/secure-coding-x": "^9.0.0"\n`,
      },
      unreadable,
    );
    expect(saved.submitIssues.map((i) => i.code)).toEqual([
      "dependency_not_found",
      "registry_checks_failed",
    ]);
  });

  it("keeps the canvas layout out of a proposal's changes and its suggested bump", async () => {
    await releasedSkill();
    const draft = await proposeChange(asOther, item, app, storage);
    await write(asOther, draft.id, {
      ".ronne/layout.json": '{"version":1,"nodes":{}}\n',
      "README.md": "# Secure coding\n\nVersion two.\n",
    });
    await submitDraft(asOther, draft.id, app, storage);
    const view = await getReview(asModerator, draft.id, app, storage);
    expect(view.proposal?.changes?.map((c) => c.path)).toEqual(["README.md"]);
    expect(view.proposal?.unreleased).toEqual([".ronne/layout.json"]);
    // Not "`.ronne/layout.json` is new", which would make it a minor release.
    expect(view.proposal?.suggested).toEqual({
      bump: "patch",
      reasons: ["nothing is added or removed"],
    });
  });

  it("shows the changes to the base version, the manifest fields, stale, and the suggested bump", async () => {
    await releasedSkill();
    const draft = await proposeChange(asOther, item, app, storage);
    const manifest = text(draft, "ronne.yaml");
    await write(asOther, draft.id, {
      "README.md": "# Secure coding\n\nVersion two.\n",
      "docs/usage.md": "Use it.\n",
      "ronne.yaml": manifest.replace(
        "description: Checks code.",
        "description: Checks code better.",
      ),
    });
    await submitDraft(asOther, draft.id, app, storage);
    const view = await getReview(asModerator, draft.id, app, storage);
    expect(view.proposal).toMatchObject({
      baseVersion: "1.0.0",
      stale: null,
      manifest: [{ field: "description", before: "Checks code.", after: "Checks code better." }],
      suggested: { bump: "minor", reasons: ["`docs/usage.md` is new"] },
    });
    expect(view.proposal?.changes?.map((c) => [c.path, c.status])).toEqual([
      ["README.md", "changed"],
      ["docs/usage.md", "added"],
      ["ronne.yaml", "changed"],
    ]);

    // A new item has no proposal view.
    const fresh = await createDraft(asOther, { scope: "team", name: "fresh", type: "rule" }, app);
    await write(asOther, fresh.id, {
      "ronne.yaml": text(fresh, "ronne.yaml").replace('description: ""', "description: New."),
    });
    await submitDraft(asOther, fresh.id, app, storage);
    expect((await getReview(asModerator, fresh.id, app, storage)).proposal).toBeNull();
  });
});
