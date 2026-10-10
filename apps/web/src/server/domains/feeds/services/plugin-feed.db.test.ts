import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest } from "@ronneai/core";
import { packItem } from "@ronneai/core/pack";
import { PLUGIN_BUILDER_VERSION } from "@ronneai/core/plugins";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { localStorage } from "../../../storage/local-storage";
import type { StorageAdapter } from "../../../storage/storage-adapter";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { FeedTooLargeError, PluginNotFoundError } from "../exceptions/errors";
import { pluginKey, sidecarKey } from "../models/feed";
import { kyselyFeedRepository } from "../repositories/kysely-feed-repository";
import { createMarketplaceCache, type MarketplaceCache } from "./marketplace-cache";
import { downloadPlugin, type FeedDeps, feedPlugins, findPlugin, marketplace } from "./plugin-feed";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let storageRoot: string;
let storage: StorageAdapter;
let puts: string[];
let logged: string[];
let publisher: string;
const user: CurrentUser = {
  id: "u1",
  email: "a@example.com",
  name: "A",
  role: "user",
  workspaces: {},
};
const actor = { user, ip: null };
const now = new Date("2026-10-03T12:00:00.000Z");
const text = (value: string) => new TextEncoder().encode(value);

const deps = (overrides: Partial<FeedDeps> = {}): FeedDeps => ({
  catalogue: kyselyCatalogueRepository(t.db, t.dialect, UNFILTERED),
  items: kyselyItemRepository(t.db, t.dialect, UNFILTERED),
  storage,
  log: (message) => logged.push(message),
  ...overrides,
});

const itemIds = new Map<string, string>();

/** Releases `@team/<name>@<version>` as a release leaves it: packed, stored, tagged `latest`. */
const release = async (
  name: string,
  version: string,
  manifest: string,
  files: Record<string, string> = {},
  { latest = true } = {},
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const parsed = parseManifest(manifest).manifest as Record<string, unknown>;
  let itemId = itemIds.get(name);
  if (!itemId) {
    itemId = await items.insertItem({
      scopeId: "s1",
      name,
      type: parsed.type as never,
      description: String(parsed.description),
      ownerId: publisher,
      createdAt: now,
    });
    itemIds.set(name, itemId);
  }
  const packageFiles = [
    { path: "ronne.yaml", bytes: text(manifest) },
    ...Object.entries(files).map(([path, content]) => ({ path, bytes: text(content) })),
  ];
  const packed = await packItem(packageFiles, { version });
  const artifactPath = `team/${name}/${version}.tgz`;
  await storage.put(artifactPath, packed.tgz);
  const dependencies = Object.entries((parsed.dependencies ?? {}) as Record<string, string>).map(
    ([dependency, range]) => ({
      itemId: itemIds.get(dependency.slice("@team/".length)) ?? "",
      range,
    }),
  );
  const versionId = await items.insertVersion({
    itemId,
    version,
    manifest: { ...parsed, version },
    readme: null,
    files: packageFiles.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
    notes: null,
    artifactPath,
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: publisher,
    publishedAt: now,
    submissionId: null,
    dependencies,
    riskFlags: [],
  });
  if (latest) await items.setTag(itemId, "latest", versionId);
  return versionId;
};

const skill = (name: string, description: string, extra = "") =>
  [
    `name: "@team/${name}"`,
    "type: skill",
    `description: ${description}`,
    "skill:",
    "  entry: SKILL.md",
    extra,
  ].join("\n");

const SKILL_MD = (name: string) => `---\nname: ${name}\ndescription: A skill.\n---\nDo it.\n`;

beforeEach(async () => {
  t = await createTestDb();
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-feeds-"));
  puts = [];
  logged = [];
  itemIds.clear();
  const disk = localStorage(storageRoot);
  storage = {
    ...disk,
    put: async (key, bytes) => {
      puts.push(key);
      return disk.put(key, bytes);
    },
  };
  ({ id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  }));
  await t.db
    .insertInto("scopes")
    .values({
      id: "s1",
      name: "team",
      description: "",
      created_by: publisher,
      created_at: toDbDate(now, t.dialect),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();

  // A skill, at 1.0.0 and 1.1.0 (latest).
  await release("style", "1.0.0", skill("style", "House style."), {
    "SKILL.md": SKILL_MD("style"),
  });
  await release("style", "1.1.0", skill("style", "House style."), {
    "SKILL.md": SKILL_MD("style"),
  });
  // An agent that depends on the skill: its plugin carries both.
  await release(
    "reviewer",
    "2.0.0",
    [
      'name: "@team/reviewer"',
      "type: agent",
      "description: Reviews diffs.",
      "agent:",
      "  prompt: prompt.md",
      "dependencies:",
      '  "@team/style": "^1.0.0"',
    ].join("\n"),
    { "prompt.md": "You review diffs.\n" },
  );
  // A glob rule: Claude Code installs it, but a plugin has no place for it.
  await release(
    "globs",
    "1.0.0",
    [
      'name: "@team/globs"',
      "type: rule",
      "description: TypeScript rules.",
      "rule:",
      "  body: rule.md",
      "  activation: glob",
      '  globs: ["**/*.ts"]',
    ].join("\n"),
    { "rule.md": "Use strict mode.\n" },
  );
});

afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const zipPuts = () => puts.filter((key) => key.endsWith(".zip"));

describe("the Claude Code feed (077)", () => {
  it("lists every installable item with Claude Code content, at its listed version, by name", async () => {
    const plugins = await feedPlugins(deps(), actor, "claude-code");
    expect(plugins.map((p) => `${p.scope}/${p.name}@${p.version}`)).toEqual([
      "team/reviewer@2.0.0",
      "team/style@1.1.0",
    ]);
    expect(plugins[1]?.description).toBe("House style.");
    expect(plugins.every((p) => /^[0-9a-f]{64}$/.test(p.sha256))).toBe(true);
    expect(logged).toEqual([]);
  });

  it("leaves out an item with nothing to put in a plugin, and remembers that", async () => {
    await feedPlugins(deps(), actor, "claude-code");
    const ref = { scope: "team", name: "globs", version: "1.0.0" };
    expect(
      new TextDecoder().decode(
        (await storage.get(sidecarKey("claude-code", ref))) ?? new Uint8Array(),
      ),
    ).toBe("none");
    expect(await storage.exists(pluginKey("claude-code", ref))).toBe(false);
    await expect(findPlugin(deps(), actor, "claude-code", ref)).rejects.toThrow(
      PluginNotFoundError,
    );
  });

  it("leaves out a yanked version, and answers 404 for its zip", async () => {
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const yanked = await release("beta", "1.0.0", skill("beta", "Beta."), {
      "SKILL.md": SKILL_MD("beta"),
    });
    await items.setYanked(yanked, { at: now, reason: "Broken." });
    // Another item whose listed version is yanked while an older one still installs.
    await release("gamma", "1.0.0", skill("gamma", "Gamma."), { "SKILL.md": SKILL_MD("gamma") });
    const gamma = await release("gamma", "2.0.0", skill("gamma", "Gamma."), {
      "SKILL.md": SKILL_MD("gamma"),
    });
    await items.setYanked(gamma, { at: now, reason: "Broken." });
    const names = (await feedPlugins(deps(), actor, "claude-code")).map((p) => p.name);
    expect(names).not.toContain("beta");
    expect(names).not.toContain("gamma");
    await expect(
      findPlugin(deps(), actor, "claude-code", { scope: "team", name: "beta", version: "1.0.0" }),
    ).rejects.toThrow(PluginNotFoundError);
    // The older version that still installs is served, if asked for.
    await expect(
      findPlugin(deps(), actor, "claude-code", { scope: "team", name: "gamma", version: "1.0.0" }),
    ).resolves.toMatchObject({ sha256: expect.any(String) });
  });

  it("says a deprecated version is deprecated, first in its description", async () => {
    const id = await release("old", "1.0.0", skill("old", "Old tricks."), {
      "SKILL.md": SKILL_MD("old"),
    });
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).setDeprecated(id, "Use @team/style.");
    const old = (await feedPlugins(deps(), actor, "claude-code")).find((p) => p.name === "old");
    expect(old?.description).toBe("Deprecated: Use @team/style. Old tricks.");
  });

  it("builds a plugin with the item and its resolved dependencies", async () => {
    const ref = { scope: "team", name: "reviewer", version: "2.0.0" };
    const { bytes, sha256 } = await downloadPlugin(deps(), actor, "claude-code", ref);
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual([
      ".claude-plugin/plugin.json",
      "agents/reviewer.md",
      "skills/style/SKILL.md",
      "skills/style/ronne.yaml",
    ]);
    const listed = (await feedPlugins(deps(), actor, "claude-code")).find(
      (p) => p.name === "reviewer",
    );
    expect(listed?.sha256).toBe(sha256);
  });

  it("builds a plugin with items that need each other, every one of them (112)", async () => {
    // The skill names the agent back: what releasing them together records (112).
    const style = await kyselyItemRepository(t.db, t.dialect, UNFILTERED).findByName({
      scope: "team",
      name: "style",
    });
    const latest = await t.db
      .selectFrom("item_versions")
      .select("id")
      .where("item_id", "=", style?.id ?? "")
      .where("version", "=", "1.1.0")
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto("version_dependencies")
      .values({
        version_id: latest.id,
        depends_on_item_id: itemIds.get("reviewer") ?? "",
        range: "^2.0.0",
      })
      .execute();
    const ref = { scope: "team", name: "reviewer", version: "2.0.0" };
    const { bytes } = await downloadPlugin(deps(), actor, "claude-code", ref);
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual([
      ".claude-plugin/plugin.json",
      "agents/reviewer.md",
      "skills/style/SKILL.md",
      "skills/style/ronne.yaml",
    ]);
  });

  it("builds each version's plugin once, and again only for a new builder version", async () => {
    await feedPlugins(deps(), actor, "claude-code");
    await feedPlugins(deps(), actor, "claude-code");
    await downloadPlugin(deps(), actor, "claude-code", {
      scope: "team",
      name: "style",
      version: "1.1.0",
    });
    expect(zipPuts()).toEqual([
      `feeds/claude-code/team/reviewer/2.0.0-b${PLUGIN_BUILDER_VERSION}.zip`,
      `feeds/claude-code/team/style/1.1.0-b${PLUGIN_BUILDER_VERSION}.zip`,
    ]);
  });

  it("counts a zip download, and not a lookup", async () => {
    const ref = { scope: "team", name: "style", version: "1.1.0" };
    const count = async () =>
      (
        await kyselyItemRepository(t.db, t.dialect, UNFILTERED).findByName({
          scope: "team",
          name: "style",
        })
      )?.downloadCount;
    await findPlugin(deps(), actor, "claude-code", ref);
    expect(await count()).toBe(0);
    await downloadPlugin(deps(), actor, "claude-code", ref);
    expect(await count()).toBe(1);
  });

  it("answers 404 for a version that doesn't exist", async () => {
    await expect(
      findPlugin(deps(), actor, "claude-code", { scope: "team", name: "style", version: "9.9.9" }),
    ).rejects.toThrow(PluginNotFoundError);
    await expect(
      findPlugin(deps(), actor, "claude-code", { scope: "team", name: "nope", version: "1.0.0" }),
    ).rejects.toThrow(PluginNotFoundError);
  });

  it("leaves out a plugin it can't build, logs it, and lists the rest", async () => {
    await rm(join(storageRoot, "team/style/1.1.0.tgz"));
    const plugins = await feedPlugins(deps(), actor, "claude-code");
    // The reviewer depends on the style skill, whose artifact is gone.
    expect(plugins).toEqual([]);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatch(/@team\/style@1\.1\.0 .*artifact is missing/);
    // Nothing was cached, so it's tried again once the artifact is back.
    expect(zipPuts()).toEqual([]);
  });

  it("builds only within its budget, and the next request builds the rest", async () => {
    let ms = 0;
    const clock = () => (ms += 10);
    const first = await feedPlugins(deps({ clock, buildBudgetMs: 25 }), actor, "claude-code");
    expect(first.map((p) => p.name)).toEqual(["reviewer"]);
    expect(logged.at(-1)).toMatch(/weren't built in time/);
    const second = await feedPlugins(deps(), actor, "claude-code");
    expect(second.map((p) => p.name)).toEqual(["reviewer", "style"]);
  });

  it("is the marketplace file, with archive URLs on PUBLIC_URL", async () => {
    const bytes = await marketplace(deps(), actor, "claude-code", "https://registry.example.com/");
    const file = JSON.parse(new TextDecoder().decode(bytes));
    expect(file).toMatchObject({
      name: "ronne-registry-example-com",
      owner: { name: "Ronne at registry.example.com" },
      description: "Released items from the Ronne registry at https://registry.example.com",
    });
    expect(file.plugins[1]).toEqual({
      name: "team.style",
      version: "1.1.0",
      description: "House style.",
      source: {
        source: "archive",
        url: "https://registry.example.com/api/v1/feeds/claude-code/plugins/team/style/1.1.0.zip",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it("refuses a marketplace past Claude Code's size limit", async () => {
    const many = Array.from({ length: 30_000 }, (_, i) => ({
      scope: "team",
      name: `item-${i}`,
      version: "1.0.0",
      description: "x".repeat(150),
      sha256: "0".repeat(64),
    }));
    const huge = deps({
      catalogue: {
        ...kyselyCatalogueRepository(t.db, t.dialect, UNFILTERED),
        list: async ({ after }) =>
          after
            ? []
            : many.map((m) => ({
                id: m.name,
                workspace: "global",
                privateWorkspace: false,
                scope: m.scope,
                name: m.name,
                type: "skill" as const,
                version: m.version,
                description: m.description,
                keywords: [],
                publishedAt: now,
                lastPublishedAt: now,
                risky: false,
                deprecatedMessage: null,
                installable: true,
                downloadCount: 0,
                support: {},
              })),
      },
      storage: {
        ...storage,
        get: async () => text("0".repeat(64)),
      },
    });
    await expect(
      marketplace(huge, actor, "claude-code", "https://registry.example.com"),
    ).rejects.toThrow(FeedTooLargeError);
  });

  it("needs a signed-in user", async () => {
    await expect(feedPlugins(deps(), { user: null, ip: null }, "claude-code")).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("the marketplace cache (079)", () => {
  /** Deps with the cache, counting what a request reads from the catalogue and the storage. */
  const cachedDeps = (cache: MarketplaceCache, overrides: Partial<FeedDeps> = {}) => {
    const reads = { catalogue: 0, storage: 0 };
    const catalogue = kyselyCatalogueRepository(t.db, t.dialect, UNFILTERED);
    const base = deps(overrides);
    return {
      reads,
      deps: {
        ...base,
        feeds: kyselyFeedRepository(t.db, t.dialect),
        cache,
        catalogue: {
          ...catalogue,
          list: (query: Parameters<typeof catalogue.list>[0]) => {
            reads.catalogue++;
            return catalogue.list(query);
          },
        },
        storage: {
          ...base.storage,
          get: (key: string) => {
            reads.storage++;
            return base.storage.get(key);
          },
        },
      } satisfies FeedDeps,
    };
  };
  const names = (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)).plugins.map((p: { name: string }) => p.name);

  it("answers from memory while nothing changes, reading neither the catalogue nor the storage", async () => {
    const cache = createMarketplaceCache();
    const first = cachedDeps(cache);
    const one = await marketplace(first.deps, actor, "claude-code", "https://registry.example.com");
    expect(first.reads.catalogue).toBeGreaterThan(0);
    const second = cachedDeps(cache);
    const two = await marketplace(
      second.deps,
      actor,
      "claude-code",
      "https://registry.example.com",
    );
    expect(two).toEqual(one);
    expect(second.reads).toEqual({ catalogue: 0, storage: 0 });
  });

  it("builds again after a release, and for another PUBLIC_URL", async () => {
    const cache = createMarketplaceCache();
    await marketplace(cachedDeps(cache).deps, actor, "claude-code", "https://registry.example.com");
    await release("fresh", "1.0.0", skill("fresh", "Fresh."), { "SKILL.md": SKILL_MD("fresh") });
    const after = cachedDeps(cache);
    const bytes = await marketplace(
      after.deps,
      actor,
      "claude-code",
      "https://registry.example.com",
    );
    expect(after.reads.catalogue).toBeGreaterThan(0);
    expect(names(bytes)).toContain("team.fresh");
    const moved = cachedDeps(cache);
    const other = await marketplace(moved.deps, actor, "claude-code", "https://other.example.com");
    expect(moved.reads.catalogue).toBeGreaterThan(0);
    expect(new TextDecoder().decode(other)).toContain("https://other.example.com/api/v1/feeds/");
  });

  it("doesn't cache a marketplace with a plugin left out, and builds the rest in the background", async () => {
    const cache = createMarketplaceCache();
    let ms = 0;
    const clock = () => (ms += 10);
    const short = cachedDeps(cache, { clock, buildBudgetMs: 25 });
    const partial = await marketplace(
      short.deps,
      actor,
      "claude-code",
      "https://registry.example.com",
    );
    expect(names(partial)).toEqual(["team.reviewer"]);
    // The background build runs at once here (no `after` outside Next.js); wait for it.
    await cache.warming("claude-code");
    expect(logged.some((line) => /built in the background, 2 plugins/.test(line))).toBe(true);
    const next = cachedDeps(cache);
    const full = await marketplace(next.deps, actor, "claude-code", "https://registry.example.com");
    expect(names(full)).toEqual(["team.reviewer", "team.style"]);
    // Every zip was built by then: this request read the catalogue but built nothing.
    expect(zipPuts().length).toBe(2);
    expect(next.reads.catalogue).toBeGreaterThan(0);
    // And now it's cached.
    const cachedRead = cachedDeps(cache);
    await marketplace(cachedRead.deps, actor, "claude-code", "https://registry.example.com");
    expect(cachedRead.reads.catalogue).toBe(0);
  });

  it("runs one background build per tool at a time", async () => {
    const cache = createMarketplaceCache();
    let runs = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const one = cache.warm("codex", async () => {
      runs++;
      await gate;
    });
    const two = cache.warm("codex", async () => {
      runs++;
    });
    expect(two).toBe(one);
    release();
    await one;
    expect(runs).toBe(1);
    expect(cache.warming("codex")).toBeNull();
  });

  it("doesn't cache a marketplace with a plugin that failed to build", async () => {
    const cache = createMarketplaceCache();
    await rm(join(storageRoot, "team/style/1.1.0.tgz"));
    await marketplace(cachedDeps(cache).deps, actor, "claude-code", "https://registry.example.com");
    const again = cachedDeps(cache);
    await marketplace(again.deps, actor, "claude-code", "https://registry.example.com");
    expect(again.reads.catalogue).toBeGreaterThan(0);
  });
});

describe("feed stats, warnings and the cap (079)", () => {
  const withFeeds = (overrides: Partial<FeedDeps> = {}) =>
    deps({ feeds: kyselyFeedRepository(t.db, t.dialect), ...overrides });
  const stats = () => kyselyFeedRepository(t.db, t.dialect).stats();
  const BIG = { maxBytes: 10_000_000, sizeWarningBytes: 100, timeWarningMs: 60_000 };

  it("records each complete build, and not a cache hit or an incomplete one", async () => {
    const cache = createMarketplaceCache();
    await marketplace(withFeeds({ cache }), actor, "codex", "https://registry.example.com");
    const [first] = await stats();
    expect(first).toMatchObject({ tool: "codex", plugins: 1, revision: expect.any(Number) });
    expect(first?.sizeBytes).toBeGreaterThan(100);
    // A cache hit records nothing new.
    await marketplace(withFeeds({ cache }), actor, "codex", "https://registry.example.com");
    expect(await stats()).toEqual([first]);
    // Nor does a build that left a plugin out.
    let ms = 0;
    await marketplace(
      withFeeds({ clock: () => (ms += 10), buildBudgetMs: 5 }),
      actor,
      "claude-code",
      "https://registry.example.com",
    );
    expect((await stats()).map((s) => s.tool)).toEqual(["codex"]);
  });

  it("keeps each tool's largest build of the revision, across visibility keys (093)", async () => {
    const feeds = kyselyFeedRepository(t.db, t.dialect);
    const build = (revision: number, sizeBytes: number) =>
      feeds.recordBuild({
        tool: "claude-code",
        sizeBytes,
        plugins: 1,
        buildMs: 5,
        revision,
        builtAt: new Date(),
      });
    const size = async () => (await stats())[0]?.sizeBytes;
    await build(3, 500);
    await build(3, 200);
    expect(await size()).toBe(500);
    await build(3, 800);
    expect(await size()).toBe(800);
    // An older revision's build never replaces a newer one; a newer one always does.
    await build(2, 9_000);
    expect(await size()).toBe(800);
    await build(4, 100);
    expect(await size()).toBe(100);
    expect((await stats())[0]?.revision).toBe(4);
  });

  it("keeps the largest of a tool's first builds made at once, and warns forward only", async () => {
    const feeds = kyselyFeedRepository(t.db, t.dialect);
    await Promise.all(
      [100, 900, 500, 300].map((sizeBytes) =>
        feeds.recordBuild({
          tool: "codex",
          sizeBytes,
          plugins: 1,
          buildMs: 5,
          revision: 7,
          builtAt: new Date(),
        }),
      ),
    );
    expect((await stats())[0]?.sizeBytes).toBe(900);
    // A request still on revision 8 that finishes after 9 warned doesn't make 9 warn again.
    expect(await feeds.markWarned("codex", 9)).toBe(true);
    expect(await feeds.markWarned("codex", 8)).toBe(false);
    expect(await feeds.markWarned("codex", 9)).toBe(false);
  });

  it("warns past the size threshold for Claude Code, once per revision", async () => {
    const warnings = () =>
      logged.filter((line) => line.includes("Claude Code reads from an address"));
    await marketplace(
      withFeeds({ feedLimits: BIG }),
      actor,
      "claude-code",
      "https://r.example.com",
    );
    await marketplace(
      withFeeds({ feedLimits: BIG }),
      actor,
      "claude-code",
      "https://r.example.com",
    );
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/^claude-code feed: its marketplace is 0\.0 MiB \(2 plugins\)/);
    expect(warnings()[0]).toContain("the git mirror (rmk feed build) has no such limit");
    // Codex's size isn't Claude Code's business.
    await marketplace(withFeeds({ feedLimits: BIG }), actor, "codex", "https://r.example.com");
    expect(warnings()).toHaveLength(1);
    // A new revision warns again.
    await release("more", "1.0.0", skill("more", "More."), { "SKILL.md": SKILL_MD("more") });
    await marketplace(
      withFeeds({ feedLimits: BIG }),
      actor,
      "claude-code",
      "https://r.example.com",
    );
    expect(warnings()).toHaveLength(2);
  });

  it("warns when a build takes past the time threshold, for any tool", async () => {
    let ms = 0;
    await marketplace(
      withFeeds({
        clock: () => (ms += 1_000),
        buildBudgetMs: Number.POSITIVE_INFINITY,
        feedLimits: { maxBytes: 10_000_000, sizeWarningBytes: 10_000_000, timeWarningMs: 3_000 },
      }),
      actor,
      "cursor",
      "https://r.example.com",
    );
    expect(
      logged.filter((line) => /^cursor feed: building its marketplace took/.test(line)),
    ).toHaveLength(1);
  });

  it("caps only Claude Code's marketplace, and the 507 names the git mirror", async () => {
    const tiny = { maxBytes: 100, sizeWarningBytes: 50, timeWarningMs: 60_000 };
    for (const tool of ["codex", "cursor"] as const)
      await expect(
        marketplace(withFeeds({ feedLimits: tiny }), actor, tool, "https://r.example.com"),
      ).resolves.toBeInstanceOf(Uint8Array);
    const refused = marketplace(
      withFeeds({ feedLimits: tiny }),
      actor,
      "claude-code",
      "https://r.example.com",
    );
    await expect(refused).rejects.toThrow(FeedTooLargeError);
    await expect(refused).rejects.toThrow(/git mirror in Claude Code instead \(rmk feed build\)/);
    // The build was still recorded, so root sees it.
    expect((await stats()).find((s) => s.tool === "claude-code")?.sizeBytes).toBeGreaterThan(100);
  });

  it("marks a warning once across processes sharing the database", async () => {
    await marketplace(withFeeds(), actor, "codex", "https://r.example.com");
    const [row] = await stats();
    const one = kyselyFeedRepository(t.db, t.dialect);
    const two = kyselyFeedRepository(t.db, t.dialect);
    expect(await one.markWarned("codex", row?.revision ?? 0)).toBe(true);
    expect(await two.markWarned("codex", row?.revision ?? 0)).toBe(false);
    expect(await two.markWarned("codex", (row?.revision ?? 0) + 1)).toBe(true);
  });
});
