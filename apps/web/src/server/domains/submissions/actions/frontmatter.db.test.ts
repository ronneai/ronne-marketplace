import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import { createRoot } from "../../identity/actions/root-account";
import { getCurrentUser, signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { createDraft, createDraftFromFilesAs, getDraft, saveDraftFiles } from "./drafts";
import { publishSubmission } from "./publish";
import { decide } from "./reviews";
import { checkSubmission, submitDraft } from "./submissions";

// A skill names the agent that runs it in its frontmatter (097): saved quoted, and a dependency.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let asAuthor: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-frontmatter-"));
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

const skillMd = (agent: string) =>
  `---\nname: helper\ndescription: Helps.\nagent: ${agent}\n---\nDo it.\n`;
const manifest =
  'name: "@team/helper"\ntype: skill\ndescription: Helps.\nskill:\n  entry: SKILL.md\n';

/** Saves `SKILL.md` (and `ronne.yaml`) in a new skill draft; returns the save's answer. */
const saveSkill = async (agent: string) => {
  const created = await createDraft(
    asAuthor,
    { scope: "team", name: "helper", type: "skill" },
    app,
  );
  const at = (path: string) => created.files.find((f) => f.path === path)?.updatedAt ?? null;
  const saved = await saveDraftFiles(
    asAuthor,
    created.id,
    {
      writes: [
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: skillMd(agent),
          executable: false,
          loadedAt: at("SKILL.md"),
        },
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: manifest,
          executable: false,
          loadedAt: at("ronne.yaml"),
        },
      ],
      deletes: [],
    },
    app,
  );
  return { id: created.id, saved };
};

const fileOf = async (id: string, path: string) =>
  (await getDraft(asAuthor, id, app)).files.find((f) => f.path === path)?.content ?? "";

/** An item `@team/<name>` of `type`, released as 1.0.0, then 1.1.0 when `again`. */
const released = async (name: string, type: "agent" | "rule", again = false) => {
  const storage = localStorage(storageRoot);
  const created = await createDraft(asAuthor, { scope: "team", name, type }, app);
  const yaml = created.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    asAuthor,
    created.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (yaml?.content ?? "").replace('description: ""', "description: Something."),
          executable: false,
          loadedAt: yaml?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(asAuthor, created.id, app, storage);
  await decide(asModerator, created.id, { decision: "approve" }, app);
  await publishSubmission(
    asAuthor,
    created.id,
    { choice: { kind: "stable", bump: "minor" } },
    app,
    storage,
  );
  if (!again) return;
  // A second release straight through the repository, as 015 would write it.
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const item = await items.findByName({ scope: "team", name: name });
  if (!item?.ownerId) throw new Error("not released");
  const version = await items.insertVersion({
    itemId: item.id,
    version: "1.1.0",
    manifest: { name: `@team/${name}`, description: "Something." },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `team/${name}/1.1.0.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy: item.ownerId,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(item.id, "latest", version);
};

describe("a skill's agent in its frontmatter (097)", () => {
  it("is saved quoted, and added to the dependencies on its latest release", async () => {
    await released("reviewer", "agent", true);
    const { id, saved } = await saveSkill("@team/reviewer");
    expect(saved.rewritten.sort()).toEqual(["SKILL.md", "ronne.yaml"]);
    expect(await fileOf(id, "SKILL.md")).toBe(skillMd('"@team/reviewer"'));
    expect(await fileOf(id, "ronne.yaml")).toBe(
      `${manifest}dependencies:\n  "@team/reviewer": ^1.1.0\n`,
    );
    expect(saved.issues).toEqual([]);
  });

  it("starts an unreleased agent on ^1.0.0, and leaves a plain name and a listed one alone", async () => {
    const { id } = await saveSkill("@team/later");
    expect(await fileOf(id, "ronne.yaml")).toContain('"@team/later": ^1.0.0');

    const plain = await saveSkill("Explore");
    expect(plain.saved.rewritten).toEqual([]);
    expect(await fileOf(plain.id, "ronne.yaml")).not.toContain("dependencies");
  });

  it("does the same for a draft uploaded with a token", async () => {
    const user = await getCurrentUser(asAuthor, app);
    if (!user) throw new Error("not signed in");
    const { draft, rewritten } = await createDraftFromFilesAs(
      { user, token: { id: "tok", name: "laptop", expiresAt: null } },
      new Headers(),
      {
        scope: "team",
        name: "helper",
        type: "skill",
        files: [
          { path: "ronne.yaml", encoding: "utf8", content: manifest },
          { path: "SKILL.md", encoding: "utf8", content: skillMd("@team/reviewer") },
        ],
      },
      app,
    );
    expect(rewritten.sort()).toEqual(["SKILL.md", "ronne.yaml"]);
    expect(await fileOf(draft.id, "SKILL.md")).toContain('agent: "@team/reviewer"');
    expect(await fileOf(draft.id, "ronne.yaml")).toContain('"@team/reviewer": ^1.0.0');
  });

  it("leaves dependencies alone when they aren't a map", async () => {
    const created = await createDraft(
      asAuthor,
      { scope: "team", name: "helper", type: "skill" },
      app,
    );
    const at = (path: string) => created.files.find((f) => f.path === path)?.updatedAt ?? null;
    const listed = `${manifest}dependencies:\n  - "@team/x"\n`;
    await saveDraftFiles(
      asAuthor,
      created.id,
      {
        writes: [
          {
            path: "SKILL.md",
            encoding: "utf8",
            content: skillMd("@team/reviewer"),
            executable: false,
            loadedAt: at("SKILL.md"),
          },
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: listed,
            executable: false,
            loadedAt: at("ronne.yaml"),
          },
        ],
        deletes: [],
      },
      app,
    );
    expect(await fileOf(created.id, "ronne.yaml")).toBe(listed);
  });

  it("refuses at submit an item that isn't an agent", async () => {
    await released("style", "rule");
    const { id } = await saveSkill("@team/style");
    expect(await checkSubmission(asAuthor, id, app)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "frontmatter_agent_type",
          message: "SKILL.md runs in @team/style, which is a rule, not an agent.",
        }),
      ]),
    );
  });
});
