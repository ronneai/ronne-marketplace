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
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  ProposalArtifactError,
  ProposalBaseNotFoundError,
  ProposalRenameError,
  SubmissionStaleError,
} from "../exceptions/errors";
import { createDraft, getDraft, renameDraft, saveDraftFiles } from "./drafts";
import { proposeChange } from "./proposals";
import { publishSubmission } from "./publish";
import { decide, getReview } from "./reviews";
import { submitDraft } from "./submissions";

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
  await submitDraft(headers, id, app);
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
    await submitDraft(asAuthor, second.id, app);
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
      await submitDraft(headers, id, app);
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

    // 1.0.1 is out: the second can't be approved, and the approved third can't be released.
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
    expect((await getReview(asModerator, second.id, app)).submission.status).toBe(
      "changes_requested",
    );
  });

  it("aren't made stale by a pre-release, or by a yanked newer version", async () => {
    await releasedSkill();
    const item = { item: "@team/secure-coding", version: "1.0.0" };
    const beta = await proposeChange(asOther, item, app, storage);
    await write(asOther, beta.id, { "README.md": "Beta." });
    await submitDraft(asOther, beta.id, app);
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
    await submitDraft(asAuthor, waiting.id, app);
    await expect(
      decide(asModerator, waiting.id, { decision: "approve" }, app),
    ).resolves.toMatchObject({
      status: "approved",
    });
  });
});
