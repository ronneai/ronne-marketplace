import { createHash } from "node:crypto";
import {
  dependenciesFirst,
  formatItemName,
  type Manifest,
  type PackageLimits,
  parseItemName,
  parseManifest,
  ResolveError,
  resolve,
} from "@ronneai/core";
import {
  buildPlugin,
  type MarketplaceEntry,
  marketplaceFor,
  marketplaceName,
  PLUGIN_BUILDER_VERSION,
  PluginError,
  type PluginTool,
  pluginArchive,
  pluginName,
} from "@ronneai/core/plugins";
import { installsIn, type RenderInput, supportFor } from "@ronneai/core/render";
import { type StorageAdapter, StorageConflictError } from "../../../storage";
import { requirePermission } from "../../identity/models/permissions";
import type { CatalogueCursor } from "../../items/models/catalogue";
import type { Item, ItemVersion } from "../../items/models/item";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import type { ItemRepository } from "../../items/repositories/item-repository";
import { artifactFiles } from "../../items/services/artifact-files";
import { databaseRegistry } from "../../items/services/resolve";
import type { VersionActor } from "../../items/services/versions";
import {
  FeedTooLargeError,
  PluginNotFoundError,
  PluginUnavailableError,
} from "../exceptions/errors";
import {
  baseUrl,
  FEED_LIMITS,
  type FeedLimits,
  type FeedPlugin,
  feedWarningMessage,
  feedWarnings,
  MOVED_NOTE_DAYS,
  NO_PLUGIN,
  type PluginRef,
  pluginDescription,
  pluginKey,
  pluginUrl,
  readSidecar,
  type ServedTool,
  sidecarBytes,
  sidecarKey,
} from "../models/feed";
import type { FeedRepository } from "../repositories/feed-repository";
import { type MarketplaceCache, marketplaceSlot } from "./marketplace-cache";

/**
 * The plugin feeds (feature 077, contract `docs/spec/plugin-feeds.md`). A version's plugin is
 * built from the released artifacts with core's builder (076), the first time anyone asks for it,
 * and kept in the StorageAdapter with its sha256 in a sidecar: versions are immutable, so it never
 * changes until the builder does, and then its key changes too. Dependencies are resolved once,
 * when the plugin is built, as a lockfile pins them.
 */
export type FeedDeps = {
  catalogue: CatalogueRepository;
  items: ItemRepository;
  storage: StorageAdapter;
  limits?: PackageLimits;
  /** Where a plugin that couldn't be built is reported. */
  log?: (message: string) => void;
  /** Milliseconds, for the build budget. */
  clock?: () => number;
  /** How long one marketplace request may spend building plugins that aren't cached yet. */
  buildBudgetMs?: number;
  /** With `cache`, marketplaces are answered from memory while the catalogue doesn't change (079). */
  feeds?: FeedRepository;
  cache?: MarketplaceCache;
  /**
   * The callers' visibility key (093, `visibilityKey`): the private workspaces the repositories
   * above see, empty for public-only ones. Marketplaces are cached per key.
   */
  visibility?: string;
  /** Runs work after the response is sent: Next.js's `after` in the app; at once by default. */
  background?: (work: () => Promise<void>) => void;
  /** Claude Code's limits by default; tests set smaller ones (079). */
  feedLimits?: FeedLimits;
};

/**
 * Building is bounded per marketplace request: Claude Code gives the file 10 seconds. A plugin not
 * built within the budget is left out of this answer and built by the next request.
 */
export const BUILD_BUDGET_MS = 5_000;

const FEED_PAGE = 200;

const TOOL_NAMES: Record<PluginTool, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

const itemName = (ref: { workspace?: string; scope: string; name: string }) => formatItemName(ref);

/** A released version as a renderer takes it, from its artifact's own ronne.yaml (as `rmk install`). */
const renderInput = async (
  deps: FeedDeps,
  name: string,
  version: Pick<ItemVersion, "version" | "artifactPath" | "sha256">,
): Promise<RenderInput> => {
  const files = await artifactFiles(deps, version);
  if (!files)
    throw new PluginUnavailableError(name, version.version, "its artifact is missing or damaged.");
  const manifestFile = files.find((file) => file.path === "ronne.yaml");
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(manifestFile.bytes)).manifest
    : null;
  if (!manifest)
    throw new PluginUnavailableError(
      name,
      version.version,
      "its package has no readable ronne.yaml.",
    );
  return { name, version: version.version, manifest: manifest as Manifest, files };
};

/** A published version by item name and version, for a dependency the resolver chose. */
const publishedVersion = async (deps: FeedDeps, name: string, version: string) => {
  const ref = parseItemName(name);
  const item = ref ? await deps.items.findByName(ref) : null;
  const found = item
    ? (await deps.items.versions(item.id)).find((v) => v.version === version)
    : null;
  if (!found) throw new PluginUnavailableError(name, version, "it isn't published.");
  return found;
};

/** The item and its resolved dependencies (a bundle: its members), dependencies first. */
const membersOf = async (deps: FeedDeps, item: RenderInput, type: string) => {
  let resolution: Awaited<ReturnType<typeof resolve>>;
  try {
    resolution = await resolve(
      { dependencies: { [item.name]: item.version } },
      databaseRegistry(deps.items),
    );
  } catch (error) {
    if (error instanceof ResolveError)
      throw new PluginUnavailableError(item.name, item.version, error.message);
    throw error;
  }
  const { order } = dependenciesFirst(
    Object.entries(resolution.items).map(([name, resolved]) => ({
      name,
      dependsOn: Object.keys(resolved.dependencies).sort(),
    })),
  );
  const members: RenderInput[] = [];
  for (const name of order) {
    if (name === item.name) {
      if (type !== "bundle") members.push(item);
      continue;
    }
    const version = resolution.items[name]?.version ?? "";
    members.push(await renderInput(deps, name, await publishedVersion(deps, name, version)));
  }
  // The members' old names (118), for an old version that names a dependency by one.
  const ids = new Map<string, string>();
  for (const name of Object.keys(resolution.items)) {
    const ref = parseItemName(name);
    const found = ref ? await deps.items.findByName(ref) : null;
    if (found) ids.set(found.id, found.fullName);
  }
  const oldNames = new Map<string, string>();
  for (const [old, id] of await deps.items.oldNames([...ids.keys()]))
    oldNames.set(old, ids.get(id) ?? old);
  return { members, oldNames };
};

const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Stores a built plugin. Two requests may build the same version at once; if a dependency was
 * released in between, their zips differ, and the first one stored wins.
 */
const store = async (deps: FeedDeps, tool: PluginTool, ref: PluginRef, bytes: Uint8Array) => {
  const key = pluginKey(tool, ref);
  let stored = bytes;
  try {
    await deps.storage.put(key, bytes);
  } catch (error) {
    if (!(error instanceof StorageConflictError)) throw error;
    stored = (await deps.storage.get(key)) ?? bytes;
  }
  const sha256 = sha256Of(stored);
  await deps.storage.put(sidecarKey(tool, ref), sidecarBytes(sha256));
  return { bytes: stored, sha256 };
};

/** Builds a version's plugin and keeps it; null when it has nothing for the tool. */
const build = async (
  deps: FeedDeps,
  tool: PluginTool,
  ref: PluginRef,
  version: ItemVersion,
  type: string,
): Promise<{ bytes: Uint8Array; sha256: string } | null> => {
  const item = await renderInput(deps, itemName(ref), version);
  const { members, oldNames } = await membersOf(deps, item, type);
  let plugin: ReturnType<typeof buildPlugin>;
  try {
    plugin = buildPlugin(tool, { item, members, oldNames });
  } catch (error) {
    if (error instanceof PluginError)
      throw new PluginUnavailableError(item.name, item.version, error.message);
    throw error;
  }
  if (plugin.empty) {
    // A name the tool refuses (longer than Codex allows, say: 118's names are longer) is said
    // once, when it's found; the sidecar keeps it out after that.
    for (const warning of plugin.warnings)
      if (warning.code === "name_refused")
        (deps.log ?? ((message: string) => console.warn(message)))(
          `${TOOL_NAMES[tool]} feed: ${warning.message}`,
        );
    await deps.storage.put(sidecarKey(tool, ref), sidecarBytes(NO_PLUGIN));
    return null;
  }
  const archive = await pluginArchive(plugin.files);
  return store(deps, tool, ref, archive.bytes);
};

/** What the sidecar says about a version's plugin, or undefined when it isn't built yet. */
const cached = async (deps: FeedDeps, tool: PluginTool, ref: PluginRef) => {
  const bytes = await deps.storage.get(sidecarKey(tool, ref));
  return bytes ? (readSidecar(bytes) ?? undefined) : undefined;
};

/** The version's plugin sha256, building it when needed; null when it has nothing for the tool. */
const ensure = async (
  deps: FeedDeps,
  tool: PluginTool,
  ref: PluginRef,
  version: ItemVersion,
  type: string,
): Promise<string | null> => {
  const known = await cached(deps, tool, ref);
  if (known !== undefined) return known === NO_PLUGIN ? null : known;
  return (await build(deps, tool, ref, version, type))?.sha256 ?? null;
};

/** Every installable item that installs in the tool, at its listed version, by name. */
const feedEntries = async (deps: FeedDeps, tool: PluginTool) => {
  const out: Awaited<ReturnType<CatalogueRepository["list"]>> = [];
  let after: CatalogueCursor | undefined;
  for (;;) {
    const page = await deps.catalogue.list({
      sort: "name",
      tool,
      installable: true,
      listedNotYanked: true,
      limit: FEED_PAGE,
      ...(after ? { after } : {}),
    });
    out.push(...page);
    const last = page.at(-1);
    if (page.length < FEED_PAGE || !last) return out;
    after = {
      sort: "name",
      installable: last.installable,
      scope: last.scope,
      name: last.name,
      id: last.id,
    };
  }
};

/** A tool's feed as one pass found it: what's listed, and what's missing and why. */
type CollectedFeed = {
  plugins: FeedPlugin[];
  /** Left out because the build budget ran out: built by a later request or in the background. */
  unbuilt: number;
  /** Left out because their build failed (logged); tried again by the next request. */
  failed: number;
};

/**
 * Every installable item that installs in the tool, at its listed version, whose plugin has
 * something in it. Plugins not built yet are built here, within the budget; one that can't be
 * built is left out and logged, and doesn't fail the rest.
 */
const collectFeed = async (deps: FeedDeps, tool: PluginTool): Promise<CollectedFeed> => {
  const clock = deps.clock ?? Date.now;
  const log = deps.log ?? ((message: string) => console.warn(message));
  const started = clock();
  const deadline = started + (deps.buildBudgetMs ?? BUILD_BUDGET_MS);
  const plugins: FeedPlugin[] = [];
  let unbuilt = 0;
  let failed = 0;
  const entries = await feedEntries(deps, tool);
  const movedFrom = await deps.items.renamedSince(
    entries.map((entry) => entry.id),
    new Date(started - MOVED_NOTE_DAYS * 24 * 60 * 60 * 1000),
  );
  for (const entry of entries) {
    const ref = {
      workspace: entry.workspace,
      scope: entry.scope,
      name: entry.name,
      version: entry.version,
    };
    let sha256 = await cached(deps, tool, ref);
    if (sha256 === undefined) {
      if (clock() > deadline) {
        unbuilt++;
        continue;
      }
      try {
        const version = await publishedVersion(deps, itemName(ref), ref.version);
        sha256 = (await build(deps, tool, ref, version, entry.type))?.sha256 ?? NO_PLUGIN;
      } catch (error) {
        if (!(error instanceof PluginUnavailableError)) throw error;
        log(`${TOOL_NAMES[tool]} feed: ${error.message}`);
        failed++;
        continue;
      }
    }
    if (sha256 === NO_PLUGIN) continue;
    plugins.push({
      ...ref,
      description: pluginDescription(
        entry.description,
        entry.deprecatedMessage,
        movedFrom.get(entry.id) ?? null,
      ),
      sha256,
    });
  }
  if (unbuilt)
    log(
      `${TOOL_NAMES[tool]} feed: ${unbuilt} plugins weren't built in time; they're being built in the background.`,
    );
  return { plugins, unbuilt, failed };
};

/** The plugins of a tool's feed (see `collectFeed`). */
export const feedPlugins = async (
  deps: FeedDeps,
  actor: VersionActor,
  tool: PluginTool,
): Promise<FeedPlugin[]> => {
  requirePermission(actor.user, "account.manage_own");
  return (await collectFeed(deps, tool)).plugins;
};

/**
 * Finishes a feed a request ran out of time for: builds every missing plugin, with no budget, after
 * the response is sent, at most one build per tool and visibility key at a time (079, 093). The next request then lists
 * everything, and its marketplace can be cached.
 */
const buildRest = (deps: FeedDeps, tool: PluginTool) => {
  const cache = deps.cache;
  if (!cache) return;
  const log = deps.log ?? ((message: string) => console.warn(message));
  const run = deps.background ?? ((work: () => Promise<void>) => void work());
  run(() =>
    cache.warm(marketplaceSlot(tool, deps.visibility ?? ""), async () => {
      try {
        const feed = await collectFeed(
          { ...deps, buildBudgetMs: Number.POSITIVE_INFINITY, log },
          tool,
        );
        log(`${TOOL_NAMES[tool]} feed: built in the background, ${feed.plugins.length} plugins.`);
      } catch (error) {
        log(`${TOOL_NAMES[tool]} feed: the background build failed: ${(error as Error).message}`);
      }
    }),
  );
};

/**
 * The tool's marketplace file for the feed, its URLs on `publicUrl` (contract, Endpoints). Every
 * tool's has Claude Code's shape, with `archive` entries: Claude Code reads its own, and `rmk feed
 * build` reads Codex's and Cursor's and writes their real marketplace files into the mirror (078).
 *
 * With a cache, a complete marketplace is kept per visibility key (093) under the catalogue
 * revision read before it was built, the builder version and `publicUrl`, and answered from memory
 * until one of them changes (079). A request that runs out of build budget answers what it has, and the rest is built in the
 * background.
 */
export const marketplace = async (
  deps: FeedDeps,
  actor: VersionActor,
  tool: ServedTool,
  publicUrl: string,
): Promise<Uint8Array> => {
  requirePermission(actor.user, "account.manage_own");
  const base = baseUrl(publicUrl);
  const limits = deps.feedLimits ?? FEED_LIMITS;
  const clock = deps.clock ?? Date.now;
  const revision = deps.feeds ? await deps.feeds.revision() : null;
  const key =
    revision === null || !deps.cache
      ? null
      : `${revision.instance}\0${revision.revision}\0${PLUGIN_BUILDER_VERSION}\0${base}`;
  const slot = marketplaceSlot(tool, deps.visibility ?? "");
  const hit = key ? deps.cache?.get(slot, key) : null;
  if (hit) return hit;
  const started = clock();
  const feed = await collectFeed(deps, tool);
  const host = new URL(base).host;
  const entries: MarketplaceEntry[] = feed.plugins.map((plugin) => ({
    name: pluginName(itemName(plugin)),
    version: plugin.version,
    description: plugin.description,
    source: { kind: "archive", url: pluginUrl(base, tool, plugin), sha256: plugin.sha256 },
  }));
  const file = marketplaceFor("claude-code", entries, {
    name: marketplaceName(base),
    owner: `Ronne at ${host}`,
    description: `Released items from the Ronne registry at ${base}`,
  });
  if (feed.unbuilt) buildRest(deps, tool);
  const complete = !feed.unbuilt && !feed.failed;
  // A complete build is what the tool will see: record it (the revision's largest is kept), and
  // warn once per revision, whichever visibility key comes near a limit first (079, 093).
  if (complete && revision && deps.feeds) {
    const stats = {
      tool,
      sizeBytes: file.bytes.length,
      plugins: feed.plugins.length,
      buildMs: clock() - started,
      revision: revision.revision,
      builtAt: new Date(),
    };
    await deps.feeds.recordBuild(stats);
    const warnings = feedWarnings(stats, limits);
    if (warnings.length && (await deps.feeds.markWarned(tool, revision.revision)))
      (deps.log ?? ((message: string) => console.warn(message)))(
        feedWarningMessage(stats, warnings, limits),
      );
  }
  // Only Claude Code reads its marketplace from an address, with a size limit; rmk reads the others.
  if (tool === "claude-code" && file.bytes.length > limits.maxBytes)
    throw new FeedTooLargeError(feed.plugins.length);
  if (key && complete) deps.cache?.set(slot, key, file.bytes);
  return file.bytes;
};

/**
 * The item and version a zip is for, with its plugin's sha256, building it when needed. Throws
 * `PluginNotFoundError` when the version doesn't exist, is yanked, or has nothing for the tool.
 */
export const findPlugin = async (
  deps: FeedDeps,
  actor: VersionActor,
  tool: PluginTool,
  ref: PluginRef,
): Promise<{ item: Item; sha256: string }> => {
  requirePermission(actor.user, "account.manage_own");
  const notFound = () => new PluginNotFoundError(itemName(ref), ref.version, TOOL_NAMES[tool]);
  const item = await deps.items.findByName(ref);
  if (!item) throw notFound();
  const version = (await deps.items.versions(item.id)).find((v) => v.version === ref.version);
  if (!version || version.yankedAt) throw notFound();
  if (!installsIn(supportFor(item.type, version.disabledTargets)[tool])) throw notFound();
  const sha256 = await ensure(deps, tool, ref, version, item.type);
  if (!sha256) throw notFound();
  return { item, sha256 };
};

/** A version's plugin zip, counted as a download of the item (019). */
export const downloadPlugin = async (
  deps: FeedDeps,
  actor: VersionActor,
  tool: PluginTool,
  ref: PluginRef,
): Promise<{ bytes: Uint8Array; sha256: string }> => {
  const { item, sha256 } = await findPlugin(deps, actor, tool, ref);
  const bytes = await deps.storage.get(pluginKey(tool, ref));
  if (!bytes || sha256Of(bytes) !== sha256)
    throw new PluginUnavailableError(itemName(ref), ref.version, "its stored zip is missing.");
  await deps.items.countDownload(item.id);
  return { bytes, sha256 };
};
