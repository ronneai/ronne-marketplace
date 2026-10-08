import type { ItemType } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { createScope } from "../../items/actions/scopes";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { DEPENDENCY_REPORTS_MAX, PICKER_PAGE_SIZE } from "../models/composer";
import { dependencyReports, searchDependencies } from "./composer";
import { createDraft, saveDraftFiles } from "./drafts";
import { submitDraft } from "./submissions";

// What the visual composer (031) reads: the catalogue's facts and 013's checks, per dependency.
let t: TestDb;
let app: AppAuth;
let asUser: Headers;
let asRoot: Headers;
let userId: string;
let publisher: string;
let scopeId: string;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  userId = await createTestUser(app, { email: "u@example.com", password });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  asRoot = await signedIn("root@example.com");
  await createScope(asRoot, { name: "team", description: "A scope." }, app);
  asUser = await signedIn("u@example.com");
  scopeId = (
    await t.db
      .selectFrom("scopes")
      .select("id")
      .where("name", "=", "team")
      .executeTakeFirstOrThrow()
  ).id;
});
afterEach(() => t.cleanup());

let clock = Date.UTC(2026, 8, 1);
const tick = () => {
  clock += 60_000;
  return new Date(clock);
};

/** Releases versions of `@team/<name>` through the repository, as 015 would. */
const release = async (
  name: string,
  options: {
    type?: ItemType;
    versions?: string[];
    yanked?: boolean;
    targets?: Record<string, unknown>;
    /** Item ids the versions depend on, each on `^1.0.0`. */
    dependsOn?: string[];
    /** Who first published it: root unless said. */
    ownerId?: string;
  } = {},
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId =
    (await items.findByName("team", name))?.id ??
    (await items.insertItem({
      scopeId,
      name,
      type: options.type ?? "skill",
      description: "",
      ownerId: options.ownerId ?? publisher,
      createdAt: tick(),
    }));
  for (const version of options.versions ?? ["1.0.0"]) {
    const id = await items.insertVersion({
      itemId,
      version,
      manifest: {
        name: `@team/${name}`,
        description: `The ${name} item.`,
        ...(options.targets ? { targets: options.targets } : {}),
      },
      readme: null,
      files: [],
      notes: null,
      artifactPath: `team/${name}/${version}.tgz`,
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: publisher,
      publishedAt: tick(),
      submissionId: null,
      dependencies: (options.dependsOn ?? []).map((dependency) => ({
        itemId: dependency,
        range: "^1.0.0",
      })),
      riskFlags: [],
    });
    await items.setTag(itemId, version.includes("-") ? "next" : "latest", id);
    if (options.yanked) await items.setYanked(id, { at: tick(), reason: "Broken." });
  }
  return itemId;
};

/** A rule draft `@team/<name>` by `headers`, with its description, submitted when asked. */
const ownRule = async (name: string, submit: boolean, headers: Headers = asUser) => {
  const created = await createDraft(headers, { scope: "team", name, type: "rule" }, app);
  const manifest = created.files.find((f) => f.path === "ronne.yaml");
  await saveDraftFiles(
    headers,
    created.id,
    {
      writes: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: (manifest?.content ?? "").replace('description: ""', "description: A rule."),
          executable: false,
          loadedAt: manifest?.updatedAt ?? null,
        },
      ],
      deletes: [],
    },
    app,
  );
  if (submit) await submitDraft(headers, created.id, app);
  return created.id;
};

const reports = (
  dependencies: Record<string, string>,
  type: ItemType = "agent",
  headers: Headers = asUser,
) => dependencyReports(headers, { itemName: "@team/reviewer", type, dependencies }, app);

describe("dependencyReports", () => {
  it("gives each dependency its catalogue facts: type, listed version, description and tools", async () => {
    await release("secure-coding", { versions: ["1.0.0", "1.4.0", "2.0.0-beta.1"] });
    await release("github", { type: "mcp-server", targets: { codex: { enabled: false } } });
    const found = await reports({ "@team/secure-coding": "^1.0.0", "@team/github": "1.0.0" });
    expect(found["@team/secure-coding"]).toEqual({
      facts: {
        type: "skill",
        // `latest`'s, not the newer pre-release.
        version: "1.4.0",
        description: "The secure-coding item.",
        tools: ["Claude Code", "Codex", "Cursor"],
      },
      status: null,
      problems: [],
    });
    expect(found["@team/github"]?.facts).toMatchObject({
      type: "mcp-server",
      tools: ["Claude Code", "Cursor"],
    });
  });

  it("says what submitting would: not published, no matching version; any type is fine (096)", async () => {
    await release("secure-coding");
    await release("other-agent", { type: "agent" });
    await release("withdrawn", { type: "rule", yanked: true });
    const found = await reports({
      "@team/nowhere": "^1.0.0",
      "not a name": "^1.0.0",
      "@team/other-agent": "^1.0.0",
      "@team/secure-coding": "^2.0.0",
      "@team/withdrawn": "^1.0.0",
    });
    expect(found["@team/nowhere"]).toEqual({
      facts: null,
      status: null,
      problems: [
        "@team/nowhere isn't a published item or in review. Submit it first: a dependency counts once it's in review.",
      ],
    });
    expect(found["not a name"]?.facts).toBeNull();
    expect(found["not a name"]?.problems[0]).toContain("isn't a published item");
    expect(found["@team/other-agent"]?.facts?.type).toBe("agent");
    // An agent on another agent: any type may depend on any type.
    expect(found["@team/other-agent"]?.problems).toEqual([]);
    expect(found["@team/secure-coding"]?.problems).toEqual([
      "No published version of @team/secure-coding matches ^2.0.0.",
    ]);
    // Every version yanked: still in the catalogue, but nothing to install.
    expect(found["@team/withdrawn"]?.facts?.version).toBe("1.0.0");
    expect(found["@team/withdrawn"]?.problems).toEqual([
      "No published version of @team/withdrawn matches ^1.0.0.",
    ]);
    // A bundle too.
    expect(
      (await reports({ "@team/other-agent": "^1.0.0" }, "bundle"))["@team/other-agent"],
    ).toEqual({ facts: expect.objectContaining({ type: "agent" }), status: null, problems: [] });
  });

  it("gives your own unreleased one its status, without 056's warning repeated (089)", async () => {
    await ownRule("tone", true);
    await ownRule("house", false);
    await ownRule("theirs", true, asRoot);
    const found = await reports({
      "@team/tone": "^1.0.0",
      "@team/house": "^1.0.0",
      "@team/theirs": "^1.0.0",
    });
    expect(found["@team/tone"]).toEqual({ facts: null, status: "submitted", problems: [] });
    // A draft has to be submitted first: its problem stays, beside its badge.
    expect(found["@team/house"]).toEqual({
      facts: null,
      status: "draft",
      problems: [
        "@team/house isn't a published item or in review. Submit it first: a dependency counts once it's in review.",
      ],
    });
    expect(found["@team/theirs"]).toEqual({
      facts: null,
      status: null,
      problems: [
        "@team/theirs isn't released yet. You can depend on someone else's item once it's published.",
      ],
    });
  });

  it("leaves a range that isn't a semver range to 011's checks", async () => {
    await release("secure-coding");
    const found = await reports({ "@team/secure-coding": "latest", "@team/nowhere": "" });
    expect(found["@team/secure-coding"]?.problems).toEqual([]);
    expect(found["@team/nowhere"]?.problems).toHaveLength(1);
  });

  it("finds a circle through one dependency", async () => {
    const reviewer = await release("reviewer", { type: "agent" });
    await release("looping", { dependsOn: [reviewer] });
    expect((await reports({ "@team/looping": "^1.0.0" }))["@team/looping"]?.problems).toEqual([
      "The dependencies go round in a circle: @team/reviewer → @team/looping → @team/reviewer.",
    ]);
  });

  it("reports on a bounded number, and on nothing for input that isn't dependencies", async () => {
    const many = Object.fromEntries(
      Array.from({ length: DEPENDENCY_REPORTS_MAX + 5 }, (_, i) => [`@team/item-${i}`, "^1.0.0"]),
    );
    expect(Object.keys(await reports(many))).toHaveLength(DEPENDENCY_REPORTS_MAX);
    expect(await reports({})).toEqual({});
    expect(await reports({ "@team/a": 1 } as unknown as Record<string, string>)).toEqual({});
    expect(await reports({ "@team/a": "^1.0.0" }, "nothing" as ItemType)).toEqual({});
  });

  it("is for signed-in users", async () => {
    await expect(reports({ "@team/a": "^1.0.0" }, "agent", new Headers())).rejects.toThrow(
      ForbiddenError,
    );
  });
});

const search = (
  input: Partial<Parameters<typeof searchDependencies>[1]> = {},
  headers: Headers = asUser,
) => searchDependencies(headers, { type: "agent", ...input }, app);
const found = async (input: Partial<Parameters<typeof searchDependencies>[1]> = {}) =>
  (await search(input)).entries.map((entry) => entry.name);

describe("searchDependencies", () => {
  beforeEach(async () => {
    await release("secure-coding", { versions: ["1.0.0", "1.4.0"] });
    await release("github", { type: "mcp-server" });
    await release("on-save", { type: "hook" });
    await release("style", { type: "rule" });
    await release("review", { type: "command" });
    await release("other-agent", { type: "agent" });
    await release("starter", { type: "bundle" });
    await release("quiet", { type: "output-style" });
  });

  it("offers an agent items of every type, newest first, with the catalogue's facts (096)", async () => {
    const page = await search();
    expect(page.entries.map((entry) => entry.name)).toEqual([
      "@team/quiet",
      "@team/starter",
      "@team/other-agent",
      "@team/review",
      "@team/style",
      "@team/on-save",
      "@team/github",
      "@team/secure-coding",
    ]);
    expect(page.nextCursor).toBeNull();
    expect(page.entries.at(-1)).toEqual({
      name: "@team/secure-coding",
      type: "skill",
      version: "1.4.0",
      description: "The secure-coding item.",
      tools: ["Claude Code", "Codex", "Cursor"],
      status: "published",
      mine: false,
    });
  });

  it("puts your own first on the first page: published whatever its rank, then drafts and open submissions (089)", async () => {
    await release("mine", { type: "rule", ownerId: userId });
    for (let i = 0; i < PICKER_PAGE_SIZE; i++) await release(`extra-${i}`);
    await ownRule("house", false);
    await ownRule("tone", true);
    // Root's draft and submission are never offered.
    await ownRule("secret", false, asRoot);
    await ownRule("pending", true, asRoot);

    const first = await search();
    expect(first.entries.slice(0, 3)).toEqual([
      expect.objectContaining({ name: "@team/mine", status: "published", mine: true }),
      expect.objectContaining({ name: "@team/tone", status: "submitted", mine: true }),
      expect.objectContaining({ name: "@team/house", status: "draft", mine: true }),
    ]);
    expect(first.entries[1]).toMatchObject({ type: "rule", version: "1.0.0", tools: [] });
    const later = await search({ cursor: first.nextCursor ?? undefined });
    const names = [...first.entries, ...later.entries].map((entry) => entry.name);
    expect(names.filter((name) => name === "@team/mine")).toHaveLength(1);
    expect(names).not.toContain("@team/secret");
    expect(names).not.toContain("@team/pending");
    expect(later.entries.every((entry) => !entry.mine)).toBe(true);
  });

  it("offers every type to every type (096), and nothing to an unknown type", async () => {
    for (const type of ["bundle", "skill", "rule", "output-style"] as const)
      expect(await found({ type })).toHaveLength(8);
    expect(await found({ type: "nothing" as ItemType })).toEqual([]);
  });

  it("searches names and descriptions, and narrows to one type", async () => {
    expect(await found({ q: "  secure " })).toEqual(["@team/secure-coding"]);
    expect(await found({ q: "nothing like it" })).toEqual([]);
    expect(await found({ only: "hook" })).toEqual(["@team/on-save"]);
    expect(await found({ only: "agent" })).toEqual(["@team/other-agent"]);
    expect(await found({ type: "rule", only: "bundle" })).toEqual(["@team/starter"]);
  });

  it("leaves out items with nothing to install, and lists a pre-release-only item by its version", async () => {
    await release("withdrawn", { type: "rule", yanked: true });
    await release("upcoming", { versions: ["1.0.0-beta.1"] });
    const page = await search();
    expect(page.entries.map((entry) => entry.name)).not.toContain("@team/withdrawn");
    expect(page.entries[0]).toMatchObject({ name: "@team/upcoming", version: "1.0.0-beta.1" });
  });

  it("pages through a large catalogue", async () => {
    for (let i = 0; i < PICKER_PAGE_SIZE; i++) await release(`extra-${i}`);
    const first = await search();
    expect(first.entries).toHaveLength(PICKER_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const second = await search({ cursor: first.nextCursor ?? undefined });
    expect(second.entries).toHaveLength(8);
    expect(second.nextCursor).toBeNull();
    const names = [...first.entries, ...second.entries].map((entry) => entry.name);
    expect(new Set(names).size).toBe(PICKER_PAGE_SIZE + 8);
  });

  it("is for signed-in users", async () => {
    await expect(search({}, new Headers())).rejects.toThrow(ForbiddenError);
  });
});
