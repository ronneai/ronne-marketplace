import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyRegistryLookup } from "../repositories/kysely-registry-lookup";
import { createDraft, saveDraftFiles } from "./drafts";
import { publishSubmission } from "./publish";
import { decide } from "./reviews";
import {
  checkSubmission,
  dependencyMarks,
  submitDraft,
  viewSubmission,
  withdrawSubmission,
} from "./submissions";

// 013's registry checks, now against what 015 publishes.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let asAuthor: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-registry-"));
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asAuthor = await signedIn("author@example.com");
  asModerator = await signedIn("mod@example.com");
  await createScope(asRoot, { name: "team", description: "A team." }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A draft whose ronne.yaml is `manifest`, with its other template files. */
const draftWith = async (
  name: string,
  type: "skill" | "agent" | "mcp-server",
  manifest: string,
) => {
  const draft = await createDraft(asAuthor, { scope: "team", name, type }, app);
  const at = (path: string) => draft.files.find((f) => f.path === path)?.updatedAt ?? null;
  const writes = [
    {
      path: "ronne.yaml",
      encoding: "utf8" as const,
      content: manifest,
      executable: false,
      loadedAt: at("ronne.yaml"),
    },
  ];
  const skill = draft.files.find((f) => f.path === "SKILL.md");
  if (skill)
    writes.push({
      path: "SKILL.md",
      encoding: "utf8",
      content: skill.content.replace('description: ""', "description: Something."),
      executable: false,
      loadedAt: skill.updatedAt,
    });
  await saveDraftFiles(asAuthor, draft.id, { writes, deletes: [] }, app);
  return draft.id;
};

/** An MCP server draft, not submitted. */
const serverDraft = (name: string) =>
  draftWith(
    name,
    "mcp-server",
    `name: "@team/${name}"\ntype: mcp-server\ndescription: Something.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
  );

/** Publishes an MCP server as 1.0.0. */
const released = async (name: string) => {
  const id = await draftWith(
    name,
    "mcp-server",
    `name: "@team/${name}"\ntype: mcp-server\ndescription: Something.\nmcp-server:\n  transport: stdio\n  command: npx\n`,
  );
  await submitDraft(asAuthor, id, app);
  await decide(asModerator, id, { decision: "approve" }, app);
  await publishSubmission(
    asAuthor,
    id,
    { choice: { kind: "stable", bump: "patch" } },
    app,
    localStorage(storageRoot),
  );
};

const skillNeeding = (name: string, dependencies: string) =>
  draftWith(
    name,
    "skill",
    `name: "@team/${name}"\ntype: skill\ndescription: Something.\nskill:\n  entry: SKILL.md\ndependencies:\n${dependencies}`,
  );

const codes = async (id: string) => (await checkSubmission(asAuthor, id, app)).map((i) => i.code);

describe("registry checks against published items", () => {
  it("accepts a dependency on a released item whose range matches", async () => {
    await released("github");
    const id = await skillNeeding("reviewer", '  "@team/github": "^1.0.0"\n');
    expect(await codes(id)).toEqual([]);
    await expect(submitDraft(asAuthor, id, app)).resolves.toMatchObject({ status: "submitted" });
  });

  it("refuses an unmatched range, a type this item can't depend on, and yanked versions", async () => {
    await released("github");
    expect(await codes(await skillNeeding("a", '  "@team/github": "^2.0.0"\n'))).toEqual([
      "dependency_range",
    ]);

    // A skill may depend on MCP servers only; publish a skill and depend on it.
    const other = await draftWith(
      "helper",
      "skill",
      'name: "@team/helper"\ntype: skill\ndescription: Something.\nskill:\n  entry: SKILL.md\n',
    );
    await submitDraft(asAuthor, other, app);
    await decide(asModerator, other, { decision: "approve" }, app);
    await publishSubmission(
      asAuthor,
      other,
      { choice: { kind: "stable", bump: "patch" } },
      app,
      localStorage(storageRoot),
    );
    expect(await codes(await skillNeeding("b", '  "@team/helper": "^1.0.0"\n'))).toEqual([
      "dependency_type",
    ]);

    await t.db
      .updateTable("item_versions")
      .set({ yanked_at: toDbDate(new Date(), t.dialect) })
      .execute();
    expect(await codes(await skillNeeding("c", '  "@team/github": "^1.0.0"\n'))).toEqual([
      "dependency_range",
    ]);
  });

  it("refuses a new item with a published item's name", async () => {
    await released("github");
    const id = await draftWith(
      "github",
      "mcp-server",
      'name: "@team/github"\ntype: mcp-server\ndescription: Again.\nmcp-server:\n  transport: stdio\n  command: npx\n',
    );
    const [issue] = await checkSubmission(asAuthor, id, app);
    expect(issue).toMatchObject({ code: "name_taken" });
    expect(issue?.message).toContain("already a published item");
  });
});

describe("dependencies on their way (056)", () => {
  const storage = () => localStorage(storageRoot);

  it("lists a name's submissions that aren't drafts, newest first, with their dependencies", async () => {
    const lookup = kyselyRegistryLookup(t.db, t.dialect);
    const draft = await serverDraft("github");
    expect(await lookup.submissionsNamed("team", "github")).toEqual([]);
    await submitDraft(asAuthor, draft, app);
    const reviewer = await skillNeeding("reviewer", '  "@team/github": "^1.0.0"\n');
    await submitDraft(asAuthor, reviewer, app);
    expect(await lookup.submissionsNamed("team", "github")).toEqual([
      { id: draft, status: "submitted", type: "mcp-server", proposal: false, dependencies: {} },
    ]);
    expect(await lookup.submissionsNamed("team", "reviewer")).toEqual([
      expect.objectContaining({ dependencies: { "@team/github": "^1.0.0" } }),
    ]);
  });

  it("submits a dependent of one in review, and releases it only after its dependency", async () => {
    const github = await serverDraft("github");
    const reviewer = await skillNeeding("reviewer", '  "@team/github": "^1.0.0"\n');
    expect(await codes(reviewer)).toEqual(["dependency_not_found"]);

    await submitDraft(asAuthor, github, app);
    expect(await checkSubmission(asAuthor, reviewer, app)).toEqual([
      expect.objectContaining({ severity: "warning", code: "dependency_pending" }),
    ]);
    await submitDraft(asAuthor, reviewer, app);
    await decide(asModerator, reviewer, { decision: "approve" }, app);
    await decide(asModerator, github, { decision: "approve" }, app);

    const release = (id: string) =>
      publishSubmission(
        asAuthor,
        id,
        { choice: { kind: "stable", bump: "patch" } },
        app,
        storage(),
      );
    await expect(release(reviewer)).rejects.toMatchObject({
      message:
        "It can't be released yet: @team/github isn't released yet (it's approved). Release it first.",
      issues: [
        expect.objectContaining({
          code: "dependency_unreleased",
          message: "@team/github isn't released yet (it's approved). Release it first.",
        }),
      ],
    });
    await release(github);
    await expect(release(reviewer)).resolves.toMatchObject({ version: "1.0.0" });
  });

  it("marks what each waits on, for whoever may see it", async () => {
    const github = await serverDraft("github");
    await submitDraft(asAuthor, github, app);
    const reviewer = await skillNeeding("reviewer", '  "@team/github": "^1.0.0"\n');
    const draft = await viewSubmission(asAuthor, reviewer, app);
    expect(await dependencyMarks(asAuthor, [draft], app)).toEqual({
      [reviewer]: [{ kind: "waits", dependency: "@team/github", status: "submitted" }],
    });
    // A draft is private: a moderator gets no marks for it.
    expect(await dependencyMarks(asModerator, [draft], app)).toEqual({});

    await submitDraft(asAuthor, reviewer, app);
    await decide(asModerator, github, { decision: "reject", message: "No." }, app);
    const submitted = await viewSubmission(asModerator, reviewer, app);
    expect(await dependencyMarks(asModerator, [submitted], app)).toEqual({
      [reviewer]: [
        { kind: "blocked", dependency: "@team/github", status: "rejected", through: [] },
      ],
    });
  });

  it("refuses a dependency whose submission was withdrawn", async () => {
    const github = await serverDraft("github");
    await submitDraft(asAuthor, github, app);
    await withdrawSubmission(asAuthor, github, app);
    expect(await codes(await skillNeeding("reviewer", '  "@team/github": "^1.0.0"\n'))).toEqual([
      "dependency_closed",
    ]);
  });
});
