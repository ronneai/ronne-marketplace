import type { ItemType, RiskFlag } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createRoot } from "../../identity/actions/root-account";
import { signIn } from "../../identity/actions/session";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { ItemNotFoundError, VersionNotFoundError } from "../exceptions/errors";
import { kyselyItemRepository } from "../repositories/kysely-item-repository";
import { CATALOGUE_PAGE_SIZE } from "../services/catalogue";
import { browseCatalogue, dependencyFacts, homeLists } from "./catalogue";
import { createScope } from "./scopes";
import { itemPage, unyank, yank } from "./versions";

let t: TestDb;
let app: AppAuth;
let asUser: Headers;
let asModerator: Headers;
let publisher: string;
const scopeIds: Record<string, string> = {};
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, { email: "mod@example.com", password, role: "moderator" });
  const signedIn = async (email: string) => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    return cookieHeaders(result.headers.get("set-cookie"));
  };
  const asRoot = await signedIn("root@example.com");
  asUser = await signedIn("u@example.com");
  asModerator = await signedIn("mod@example.com");
  for (const name of ["team", "tools"]) {
    await createScope(asRoot, { name, description: "A scope." }, app);
    scopeIds[name] = (
      await t.db
        .selectFrom("scopes")
        .select("id")
        .where("name", "=", name)
        .executeTakeFirstOrThrow()
    ).id;
  }
});
afterEach(() => t.cleanup());

let clock = Date.UTC(2026, 8, 1);
const tick = () => {
  clock += 60_000;
  return new Date(clock);
};

/** Releases versions of an item through the repository, as 015 would, `latest` on the last stable. */
const release = async (
  name: string,
  options: {
    scope?: string;
    type?: ItemType;
    description?: string;
    keywords?: string[];
    versions?: string[];
    flags?: RiskFlag[];
    targets?: Record<string, unknown>;
  } = {},
) => {
  const items = kyselyItemRepository(t.db, t.dialect);
  const scope = options.scope ?? "team";
  const existing = await items.findByName(scope, name);
  const itemId =
    existing?.id ??
    (await items.insertItem({
      scopeId: scopeIds[scope] ?? "",
      name,
      type: options.type ?? "skill",
      description: options.description ?? "",
      ownerId: publisher,
      createdAt: tick(),
    }));
  const ids: Record<string, string> = {};
  for (const version of options.versions ?? ["1.0.0"]) {
    ids[version] = await items.insertVersion({
      itemId,
      version,
      manifest: {
        name: `@${scope}/${name}`,
        description: options.description ?? `The ${name} item.`,
        keywords: options.keywords ?? [],
        ...(options.targets ? { targets: options.targets } : {}),
      },
      readme: null,
      files: [],
      notes: null,
      artifactPath: `${scope}/${name}/${version}.tgz`,
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: publisher,
      publishedAt: tick(),
      submissionId: null,
      dependencies: [],
      riskFlags: options.flags ?? [],
    });
    await items.setTag(itemId, version.includes("-") ? "next" : "latest", ids[version] ?? "");
  }
  return { itemId, ids };
};

const names = (page: { entries: { scope: string; name: string }[] }) =>
  page.entries.map((e) => `@${e.scope}/${e.name}`);
const browse = (query: Parameters<typeof browseCatalogue>[1] = {}) =>
  browseCatalogue(asUser, query, app);

describe("the catalogue", () => {
  it("lists items with a published version, newest release first, from the listed version", async () => {
    await release("older", { versions: ["1.0.0", "1.1.0", "2.0.0-beta.1"], flags: [] });
    await release("newer", {
      flags: [{ kind: "network", message: "It mentions `example.com`." }],
      keywords: ["security", "lint"],
    });
    // An item without versions (never released) isn't listed.
    await kyselyItemRepository(t.db, t.dialect).insertItem({
      scopeId: scopeIds.team ?? "",
      name: "empty",
      type: "rule",
      description: "",
      ownerId: null,
      createdAt: tick(),
    });
    const page = await browse();
    expect(names(page)).toEqual(["@team/newer", "@team/older"]);
    expect(page.entries[0]).toMatchObject({
      version: "1.0.0",
      description: "The newer item.",
      keywords: ["security", "lint"],
      risky: true,
      installable: true,
      downloadCount: 0,
    });
    // latest, not the newer pre-release on next.
    expect(page.entries[1]).toMatchObject({ version: "1.1.0", risky: false });
    expect(page.nextCursor).toBeNull();
  });

  it("searches name, description and keywords, ignoring case, with % and _ as themselves", async () => {
    await release("fmt", { description: "Formats code." });
    await release("guard", { description: "Stops 100% of leaks." });
    await release("linter", { keywords: ["code_quality"] });
    expect(names(await browse({ q: "FMT" }))).toEqual(["@team/fmt"]);
    expect(names(await browse({ q: "formats" }))).toEqual(["@team/fmt"]);
    expect(names(await browse({ q: "code_quality" }))).toEqual(["@team/linter"]);
    expect(names(await browse({ q: "100%" }))).toEqual(["@team/guard"]);
    expect(names(await browse({ q: "e_q" }))).toEqual(["@team/linter"]);
    expect(names(await browse({ q: "c%e" }))).toEqual([]);
  });

  it("filters by type and scope, and counts types for the search and scope", async () => {
    await release("a", { type: "skill" });
    await release("b", { type: "hook", scope: "tools" });
    await release("c", { type: "hook" });
    expect(names(await browse({ type: "hook" }))).toEqual(["@team/c", "@tools/b"]);
    expect(names(await browse({ scope: "tools" }))).toEqual(["@tools/b"]);
    const page = await browse({ scope: "team", type: "hook" });
    expect(page.typeCounts.find((c) => c.type === "hook")?.count).toBe(1);
    expect(page.typeCounts.find((c) => c.type === "skill")?.count).toBe(1);
    expect(page.typeCounts).toHaveLength(11);
    expect(page.scopes).toEqual(["team", "tools"]);
    // An unknown type or sort is dropped, not an error.
    expect((await browse({ type: "nope", sort: "nope" })).query).toMatchObject({
      type: null,
      sort: "recent",
    });
  });

  it("lists the items a tool supports, and says each item's support", async () => {
    await release("skill", { type: "skill" });
    await release("style", { type: "output-style" });
    await release("off-in-cursor", { type: "rule", targets: { cursor: { enabled: false } } });
    await release("policy", { type: "permission-policy", scope: "tools" });
    expect(names(await browse({ tool: "cursor", sort: "name" }))).toEqual([
      "@team/skill",
      "@tools/policy",
    ]);
    expect(names(await browse({ tool: "claude-code" }))).toHaveLength(4);
    const page = await browse({ tool: "codex", sort: "name" });
    expect(names(page)).toEqual(["@team/off-in-cursor", "@team/skill", "@tools/policy"]);
    expect(page.query.tool).toBe("codex");
    expect(page.typeCounts.find((c) => c.type === "output-style")?.count).toBe(0);
    expect(page.entries.find((e) => e.name === "off-in-cursor")?.support).toEqual({
      "claude-code": "native",
      codex: "native",
      cursor: "off",
    });
    expect(page.entries.find((e) => e.name === "policy")?.support).toMatchObject({
      codex: "degraded",
    });
    // An unknown tool is dropped, not an error.
    expect((await browse({ tool: "copilot" })).query.tool).toBeNull();
  });

  it("sorts by name, and lists items with every version yanked last", async () => {
    await release("zeta");
    const { ids } = await release("alpha");
    await release("mid", { scope: "tools" });
    await yank(
      asModerator,
      { scope: "team", name: "alpha" },
      { version: "1.0.0", reason: "Broken." },
      app,
    );
    const page = await browse({ sort: "name" });
    expect(names(page)).toEqual(["@team/zeta", "@tools/mid", "@team/alpha"]);
    expect(page.entries.at(-1)).toMatchObject({ installable: false, version: "1.0.0" });
    expect(names(await browse())).toEqual(["@tools/mid", "@team/zeta", "@team/alpha"]);
    // Unyanking lists it with the others again.
    await unyank(asModerator, { scope: "team", name: "alpha" }, { version: "1.0.0" }, app);
    expect(names(await browse({ sort: "name" }))).toEqual([
      "@team/alpha",
      "@team/zeta",
      "@tools/mid",
    ]);
    expect(ids["1.0.0"]).toBeDefined();
  });

  it("follows latest when a yank moves it back", async () => {
    await release("tool", { versions: ["1.0.0", "1.1.0"] });
    await yank(
      asModerator,
      { scope: "team", name: "tool" },
      { version: "1.1.0", reason: "Bad." },
      app,
    );
    expect((await browse()).entries[0]).toMatchObject({ version: "1.0.0", installable: true });
  });

  it("pages with a cursor in both sorts, installable items first", async () => {
    for (let i = 0; i < CATALOGUE_PAGE_SIZE + 2; i++)
      await release(`item-${String(i).padStart(2, "0")}`);
    await yank(
      asModerator,
      { scope: "team", name: "item-00" },
      { version: "1.0.0", reason: "x" },
      app,
    );
    for (const sort of ["recent", "name"]) {
      const first = await browse({ sort });
      expect(first.entries).toHaveLength(CATALOGUE_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();
      const second = await browse({ sort, cursor: first.nextCursor ?? "" });
      expect(names(second)).toHaveLength(2);
      expect(names(second).at(-1)).toBe("@team/item-00");
      expect(second.nextCursor).toBeNull();
      const all = [...names(first), ...names(second)];
      expect(new Set(all).size).toBe(CATALOGUE_PAGE_SIZE + 2);
    }
    // A malformed cursor starts from the beginning.
    expect((await browse({ cursor: "garbage" })).entries).toHaveLength(CATALOGUE_PAGE_SIZE);
  });

  it("is for signed-in users only", async () => {
    await expect(browseCatalogue(new Headers(), {}, app)).rejects.toThrow(ForbiddenError);
    await expect(homeLists(new Headers(), app)).rejects.toThrow(ForbiddenError);
  });
});

describe("the home page's lists", () => {
  it("shows recent installable items, and most used by downloads, leaving out items with none", async () => {
    await release("one");
    const two = await release("two");
    const three = await release("three");
    await release("gone");
    await yank(
      asModerator,
      { scope: "team", name: "gone" },
      { version: "1.0.0", reason: "x" },
      app,
    );
    let lists = await homeLists(asUser, app);
    expect(lists.recent.map((e) => e.name)).toEqual(["three", "two", "one"]);
    expect(lists.mostUsed).toEqual([]);

    for (const [id, count] of [
      [two.itemId, 5],
      [three.itemId, 9],
    ] as const)
      await t.db.updateTable("items").set({ download_count: count }).where("id", "=", id).execute();
    lists = await homeLists(asUser, app);
    expect(lists.mostUsed.map((e) => [e.name, e.downloadCount])).toEqual([
      ["three", 9],
      ["two", 5],
    ]);
  });
});

describe("the item page's data", () => {
  it("shows latest by default, another version on request, and the owner", async () => {
    await release("tool", {
      versions: ["1.0.0", "1.1.0", "2.0.0-beta.1"],
      flags: [{ kind: "network", message: "It mentions `example.com`." }],
      keywords: ["cli"],
    });
    const ref = { scope: "team", name: "tool" };
    const page = await itemPage(asUser, ref, undefined, app);
    expect(page).toMatchObject({
      listed: "1.1.0",
      latest: "1.1.0",
      installable: true,
      ownerName: "Root",
    });
    expect(page.shown).toMatchObject({
      version: "1.1.0",
      tags: ["latest"],
      manifest: { keywords: ["cli"] },
      riskFlags: [{ kind: "network" }],
      files: [],
    });
    expect((await itemPage(asUser, ref, "2.0.0-beta.1", app)).shown).toMatchObject({
      version: "2.0.0-beta.1",
      tags: ["next"],
    });
    await expect(itemPage(asUser, ref, "9.9.9", app)).rejects.toThrow(VersionNotFoundError);
  });

  it("is not found for an unknown item or one without versions, and for signed-out users", async () => {
    await expect(itemPage(asUser, { scope: "team", name: "nope" }, undefined, app)).rejects.toThrow(
      ItemNotFoundError,
    );
    await kyselyItemRepository(t.db, t.dialect).insertItem({
      scopeId: scopeIds.team ?? "",
      name: "empty",
      type: "rule",
      description: "",
      ownerId: null,
      createdAt: tick(),
    });
    await expect(
      itemPage(asUser, { scope: "team", name: "empty" }, undefined, app),
    ).rejects.toThrow(ItemNotFoundError);
    await release("tool");
    await expect(
      itemPage(new Headers(), { scope: "team", name: "tool" }, undefined, app),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("dependency facts (044)", () => {
  it("gives each listed dependency's facts, leaves out missing ones and bad names, and needs a sign-in", async () => {
    await release("github", { type: "mcp-server", versions: ["1.0.0", "1.1.0"] });
    const facts = await dependencyFacts(
      asUser,
      ["@team/github", "@team/missing", "not a name"],
      app,
    );
    expect(facts).toEqual({
      "@team/github": {
        type: "mcp-server",
        version: "1.1.0",
        description: "The github item.",
        tools: expect.any(Array),
      },
    });
    expect(await dependencyFacts(asUser, [], app)).toEqual({});
    await expect(dependencyFacts(new Headers(), ["@team/github"], app)).rejects.toThrow(
      ForbiddenError,
    );
  });
});
