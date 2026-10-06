import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { findDependencies } from "./composer";
import { createDraft, getDraft, saveDraftFiles } from "./drafts";
import { proposeChange } from "./proposals";
import { publishSubmission } from "./publish";
import { decide } from "./reviews";
import { submitDraft } from "./submissions";

// What picking a dependency offers (056, 089): your own in any state, and others' once published.
let t: TestDb;
let app: AppAuth;
let storageRoot: string;
let asAuthor: Headers;
let asOther: Headers;
let asModerator: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-dep-search-"));
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
  await createTestUser(app, { email: "author@example.com", password, name: "Ada Author" });
  await createTestUser(app, { email: "other@example.com", password, name: "Otto Other" });
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
  await createScope(asRoot, { name: "infra", description: "Infra." }, app);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

/** A draft of `type` by `headers`, with its description written. */
const draft = async (
  headers: Headers,
  scope: string,
  name: string,
  type: "rule" | "mcp-server" | "agent",
) => {
  const created = await createDraft(headers, { scope, name, type }, app);
  const manifest = created.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    created.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace('description: ""', "description: Something."),
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  return created.id;
};

const submitted = async (headers: Headers, scope: string, name: string, type: "rule" | "agent") => {
  const id = await draft(headers, scope, name, type);
  await submitDraft(headers, id, app);
  return id;
};

/** Publishes a new item by `headers`, as 1.0.0. */
const published = async (
  headers: Headers,
  scope: string,
  name: string,
  type: "rule" | "mcp-server",
) => {
  const storage = localStorage(storageRoot);
  const id = await draft(headers, scope, name, type);
  await submitDraft(headers, id, app, storage);
  await decide(asModerator, id, { decision: "approve" }, app);
  await publishSubmission(headers, id, { choice: { kind: "stable", bump: "major" } }, app, storage);
  return id;
};

/** Publishes an MCP server @team/github as 1.0.0, then 1.1.0. */
const publishedServer = async () => {
  const storage = localStorage(storageRoot);
  const id = await draft(asAuthor, "team", "github", "mcp-server");
  await submitDraft(asAuthor, id, app, storage);
  await decide(asModerator, id, { decision: "approve" }, app);
  await publishSubmission(
    asAuthor,
    id,
    { choice: { kind: "stable", bump: "minor" } },
    app,
    storage,
  );
  const next = await proposeChange(
    asAuthor,
    { item: "@team/github", version: "1.0.0" },
    app,
    storage,
  );
  const files = (await getDraft(asAuthor, next.id, app)).files;
  await saveDraftFiles(
    asAuthor,
    next.id,
    {
      writes: [
        {
          path: "README.md",
          encoding: "utf8",
          content: "# GitHub\n",
          executable: false,
          loadedAt: files.find((f) => f.path === "README.md")?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  await submitDraft(asAuthor, next.id, app, storage);
  await decide(asModerator, next.id, { decision: "approve" }, app);
  await publishSubmission(
    asAuthor,
    next.id,
    { choice: { kind: "stable", bump: "minor" } },
    app,
    storage,
  );
  return next.id;
};

const find = (q: string, extra: { exclude?: string[]; itemName?: string } = {}) =>
  findDependencies(asAuthor, { type: "agent", q, itemName: "@team/reviewer", ...extra }, app);

describe("findDependencies (056, 089)", () => {
  it("offers your own items in every state first, then others' published ones", async () => {
    await publishedServer();
    await published(asOther, "infra", "lint", "rule");
    await draft(asAuthor, "team", "house", "rule");
    await submitted(asAuthor, "team", "style", "rule");
    const back = await submitted(asAuthor, "team", "tone", "rule");
    await decide(asModerator, back, { decision: "request_changes", message: "Fix." }, app);
    const approved = await submitted(asAuthor, "team", "voice", "rule");
    await decide(asModerator, approved, { decision: "approve" }, app);

    const options = await find("");
    expect(options.map((o) => [o.name, o.status, o.mine])).toEqual([
      ["@team/github", "published", true],
      ["@team/voice", "approved", true],
      ["@team/tone", "changes_requested", true],
      ["@team/style", "submitted", true],
      ["@team/house", "draft", true],
      ["@infra/lint", "published", false],
    ]);
    expect(options[0]).toMatchObject({
      type: "mcp-server",
      versions: ["1.1.0", "1.0.0"],
      latest: "1.1.0",
    });
    expect(options[1]).toMatchObject({ versions: [], latest: null });
  });

  it("never offers others' drafts or items in review, approved or sent back", async () => {
    await draft(asOther, "infra", "secret", "rule");
    await submitted(asOther, "infra", "deploy", "rule");
    const approved = await submitted(asOther, "infra", "ready", "rule");
    await decide(asModerator, approved, { decision: "approve" }, app);
    const back = await submitted(asOther, "infra", "back", "rule");
    await decide(asModerator, back, { decision: "request_changes", message: "Fix." }, app);
    expect(await find("")).toEqual([]);
    expect(await find("infra")).toEqual([]);
  });

  it("finds your own published item past the catalogue's newest 12", async () => {
    await published(asAuthor, "team", "mine", "rule");
    for (let i = 1; i <= 13; i++) await published(asOther, "infra", `rule-${i}`, "rule");
    const options = await find("");
    expect(options).toHaveLength(12);
    expect(options[0]).toMatchObject({ name: "@team/mine", status: "published", mine: true });
    expect(options.slice(1).every((o) => !o.mine && o.status === "published")).toBe(true);
  });

  it("matches any part of @scope/name, and leaves out the item itself and ones already listed", async () => {
    await publishedServer();
    await submitted(asAuthor, "team", "style", "rule");
    await published(asOther, "infra", "deploy", "rule");
    expect((await find("@team/gi")).map((o) => o.name)).toEqual(["@team/github"]);
    expect((await find("infra")).map((o) => o.name)).toEqual(["@infra/deploy"]);
    expect((await find("@inf/dep")).map((o) => o.name)).toEqual(["@infra/deploy"]);
    expect((await find("STY")).map((o) => o.name)).toEqual(["@team/style"]);
    expect(
      (await find("", { exclude: ["@team/github"], itemName: "@team/style" })).map((o) => o.name),
    ).toEqual(["@infra/deploy"]);
  });

  it("offers items to every type, a rule too (096)", async () => {
    await submitted(asAuthor, "team", "style", "rule");
    await submitted(asAuthor, "team", "tone", "rule");
    expect(
      (await findDependencies(asAuthor, { type: "rule", q: "", itemName: "@team/tone" }, app)).map(
        (o) => o.name,
      ),
    ).toEqual(["@team/style"]);
  });
});
