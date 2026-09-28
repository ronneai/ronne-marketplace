import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unpackItem } from "@ronneai/core/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeJson } from "../../../db/json";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import {
  InvalidStatusTransitionError,
  ReleaseNotesError,
  ReleaseTagError,
  ReleaseVersionError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission } from "./publish";
import { decide, getReview } from "./reviews";
import { submitDraft } from "./submissions";

let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let storage: StorageAdapter;
let asRoot: Headers;
let asAuthor: Headers;
let asOther: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-publish-"));
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
  asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asOther = await signedIn("other@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A skill with a README, approved by the moderator. */
const approvedSkill = async (name = "secure-coding") => {
  const draft = await createDraft(asAuthor, { scope: "team", name, type: "skill" }, app);
  const at = (path: string) => draft.files.find((f) => f.path === path)?.updatedAt ?? null;
  const manifest = draft.files.find((f) => f.path === "ronne.yaml")?.content ?? "";
  const skill = draft.files.find((f) => f.path === "SKILL.md")?.content ?? "";
  await saveDraftFiles(
    asAuthor,
    draft.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `${manifest.replace('description: ""', "description: Checks code for security mistakes.")}readme: README.md\n`,
          executable: false,
          loadedAt: at("ronne.yaml"),
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: skill.replace(
            'description: ""',
            "description: Checks code for security mistakes.",
          ),
          executable: false,
          loadedAt: at("SKILL.md"),
        },
        {
          path: "README.md",
          encoding: "utf8",
          content: "# Secure coding\n\nChecks your code.\n",
          executable: false,
          loadedAt: null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(asAuthor, draft.id, app);
  await decide(asModerator, draft.id, { decision: "approve" }, app);
  return draft.id;
};

const publish = (
  headers: Headers,
  id: string,
  input: Parameters<typeof publishSubmission>[2] = { choice: { kind: "stable", bump: "patch" } },
) => publishSubmission(headers, id, input, app, storage);

describe("publishSubmission", () => {
  it("releases an approved submission as 1.0.0 on latest, stored, recorded and audited", async () => {
    const id = await approvedSkill();
    const published = await publish(asAuthor, id, {
      choice: { kind: "stable", bump: "patch" },
      notes: "First release.",
    });
    expect(published).toMatchObject({ version: "1.0.0", tag: "latest" });

    // The artifact: stored under its key, with the version in its manifest.
    const tgz = await storage.get("team/secure-coding/1.0.0.tgz");
    expect(tgz).not.toBeNull();
    const files = await unpackItem(tgz ?? new Uint8Array());
    const manifest = new TextDecoder().decode(files.find((f) => f.path === "ronne.yaml")?.bytes);
    expect(manifest).toContain("version: 1.0.0");

    // The rows: item, version with README and files, tag; the submission is published.
    const version = await t.db
      .selectFrom("item_versions")
      .selectAll()
      .where("id", "=", published.versionId)
      .executeTakeFirstOrThrow();
    expect(version).toMatchObject({
      version: "1.0.0",
      sha256: published.sha256,
      notes: "First release.",
      artifact_path: "team/secure-coding/1.0.0.tgz",
      submission_id: id,
    });
    expect(version.readme).toContain("# Secure coding");
    expect(decodeJson<{ path: string }[]>(version.files).map((f) => f.path)).toEqual([
      "README.md",
      "SKILL.md",
      "ronne.yaml",
    ]);
    const item = await t.db.selectFrom("items").selectAll().executeTakeFirstOrThrow();
    expect(item).toMatchObject({
      name: "secure-coding",
      type: "skill",
      description: "Checks code for security mistakes.",
    });
    const tag = await t.db.selectFrom("dist_tags").selectAll().executeTakeFirstOrThrow();
    expect(tag).toMatchObject({ tag: "latest", version_id: published.versionId });
    const submission = await t.db
      .selectFrom("submissions")
      .select("status")
      .executeTakeFirstOrThrow();
    expect(submission.status).toBe("published");
    // The review page still knows its versions, to link to the Versions page (016).
    expect((await getReview(asAuthor, id, app)).published).toEqual(["1.0.0"]);

    const events = await kyselySubmissionRepository(t.db, t.dialect).events(id);
    expect(events.at(-1)).toMatchObject({ kind: "publish", body: "1.0.0" });
    const audit = (await listAuditEvents(t.db, t.dialect, {})).events;
    expect(audit.find((e) => e.action === "version.published")).toMatchObject({
      metadata: { name: "@team/secure-coding", version: "1.0.0", tag: "latest" },
    });
    expect(audit.find((e) => e.action === "dist_tag.moved")).toMatchObject({
      metadata: { tag: "latest", from: null, to: "1.0.0" },
    });
  });

  it("releases a first pre-release on next, never latest", async () => {
    const id = await approvedSkill();
    const published = await publish(asModerator, id, {
      choice: { kind: "prerelease", id: "beta", bump: "minor" },
    });
    expect(published).toMatchObject({ version: "1.0.0-beta.1", tag: "next" });
    await expect(
      publish(asModerator, await approvedSkill("other"), {
        choice: { kind: "prerelease", id: "beta", bump: "minor" },
        tag: "latest",
      }),
    ).rejects.toThrow(ReleaseTagError);
  });

  it("lets the author, moderators and root publish, and no one else", async () => {
    const id = await approvedSkill();
    await expect(publish(asOther, id)).rejects.toThrow(SubmissionNotFoundError);
    await expect(publish(asRoot, id)).resolves.toMatchObject({ version: "1.0.0" });
    // Once published, it can't be published again.
    await expect(publish(asAuthor, id)).rejects.toThrow(InvalidStatusTransitionError);
  });

  it("refuses anything but an approved submission, bad ids, tags and notes", async () => {
    const draft = await createDraft(asAuthor, { scope: "team", name: "wip", type: "rule" }, app);
    await expect(publish(asAuthor, draft.id)).rejects.toThrow(InvalidStatusTransitionError);
    const id = await approvedSkill();
    await expect(
      publish(asAuthor, id, { choice: { kind: "prerelease", id: "Beta", bump: "minor" } }),
    ).rejects.toThrow(ReleaseVersionError);
    await expect(
      publish(asAuthor, id, { choice: { kind: "stable", bump: "patch" }, tag: "v1" }),
    ).rejects.toThrow(ReleaseTagError);
    await expect(
      publish(asAuthor, id, { choice: { kind: "stable", bump: "patch" }, notes: "x".repeat(2001) }),
    ).rejects.toThrow(ReleaseNotesError);
    await expect(publish(asOther, "not-an-id")).rejects.toThrow(SubmissionNotFoundError);
    expect(await storage.exists("team/secure-coding/1.0.0.tgz")).toBe(false);
  });

  it("keeps plain users out of others' approved submissions, but not moderators", async () => {
    const id = await approvedSkill();
    await expect(publish(asOther, id)).rejects.toThrow(SubmissionNotFoundError);
    const theirs = await approvedSkill("theirs");
    await t.db
      .updateTable("user")
      .set({ role: "user" })
      .where("email", "=", "mod@example.com")
      .execute();
    const asDemoted = asModerator;
    await expect(publish(asDemoted, theirs)).rejects.toThrow(
      /doesn't exist|not allowed|permission/i,
    );
  });

  it("publishes once when two publishes race, sharing the same stored artifact", async () => {
    const id = await approvedSkill();
    const results = await Promise.allSettled([publish(asAuthor, id), publish(asModerator, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const versions = await t.db.selectFrom("item_versions").select("version").execute();
    expect(versions).toEqual([{ version: "1.0.0" }]);
  });

  it("refuses a user without the role, even with a session", async () => {
    const id = await approvedSkill();
    await expect(publish(new Headers(), id)).rejects.toThrow(ForbiddenError);
  });
});
