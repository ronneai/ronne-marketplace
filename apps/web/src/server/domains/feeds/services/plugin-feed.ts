import { createHash } from "node:crypto";
import {
  dependenciesFirst,
  type Manifest,
  type PackageLimits,
  parseManifest,
  ResolveError,
  resolve,
} from "@ronneai/core";
import {
  buildPlugin,
  type MarketplaceEntry,
  marketplaceFor,
  marketplaceName,
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
  type FeedPlugin,
  MARKETPLACE_MAX_BYTES,
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

const itemName = (ref: { scope: string; name: string }) => `@${ref.scope}/${ref.name}`;

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
  const [scope, short] = name.slice(1).split("/");
  const item = scope && short ? await deps.items.findByName(scope, short) : null;
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
  return members;
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
  const members = await membersOf(deps, item, type);
  let plugin: ReturnType<typeof buildPlugin>;
  try {
    plugin = buildPlugin(tool, { item, members });
  } catch (error) {
    if (error instanceof PluginError)
      throw new PluginUnavailableError(item.name, item.version, error.message);
    throw error;
  }
  if (plugin.empty) {
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
    after = { sort: "name", installable: last.installable, scope: last.scope, name: last.name };
  }
};

/**
 * The plugins of a tool's feed: every installable item that installs in the tool, at its listed
 * version, whose plugin has something in it. Plugins not built yet are built here, within the
 * budget; one that can't be built is left out and logged, and doesn't fail the rest.
 */
export const feedPlugins = async (
  deps: FeedDeps,
  actor: VersionActor,
  tool: PluginTool,
): Promise<FeedPlugin[]> => {
  requirePermission(actor.user, "account.manage_own");
  const clock = deps.clock ?? Date.now;
  const log = deps.log ?? ((message: string) => console.warn(message));
  const deadline = clock() + (deps.buildBudgetMs ?? BUILD_BUDGET_MS);
  const plugins: FeedPlugin[] = [];
  let unbuilt = 0;
  for (const entry of await feedEntries(deps, tool)) {
    const ref = { scope: entry.scope, name: entry.name, version: entry.version };
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
        continue;
      }
    }
    if (sha256 === NO_PLUGIN) continue;
    plugins.push({
      ...ref,
      description: pluginDescription(entry.description, entry.deprecatedMessage),
      sha256,
    });
  }
  if (unbuilt)
    log(
      `${TOOL_NAMES[tool]} feed: ${unbuilt} plugins weren't built in time and are left out until the next request.`,
    );
  return plugins;
};

/** The tool's marketplace file for the feed, its URLs on `publicUrl` (contract, Endpoints). */
export const marketplace = async (
  deps: FeedDeps,
  actor: VersionActor,
  tool: ServedTool,
  publicUrl: string,
): Promise<Uint8Array> => {
  const plugins = await feedPlugins(deps, actor, tool);
  const base = baseUrl(publicUrl);
  const host = new URL(base).host;
  const entries: MarketplaceEntry[] = plugins.map((plugin) => ({
    name: pluginName(itemName(plugin)),
    version: plugin.version,
    description: plugin.description,
    source: { kind: "archive", url: pluginUrl(base, tool, plugin), sha256: plugin.sha256 },
  }));
  const file = marketplaceFor(tool, entries, {
    name: marketplaceName(base),
    owner: `Ronne at ${host}`,
    description: `Released items from the Ronne registry at ${base}`,
  });
  if (file.bytes.length > MARKETPLACE_MAX_BYTES) throw new FeedTooLargeError(plugins.length);
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
  const item = await deps.items.findByName(ref.scope, ref.name);
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
