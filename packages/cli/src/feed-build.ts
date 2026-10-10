import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  GLOBAL_WORKSPACE,
  nameProblem,
  normalizeWorkspaceName,
  type PackageFile,
  parseItemName,
} from "@ronneai/core";
import {
  itemNameOfPlugin,
  MARKETPLACE_PATHS,
  marketplaceFor,
  PLUGIN_TOOLS,
  PluginArchiveError,
  type PluginTool,
  readPluginArchive,
} from "@ronneai/core/plugins";
import { pathProblem } from "@ronneai/core/render";
import type { ApiClient } from "./api.js";
import { mustStayInside } from "./apply.js";
import { RmkError, usage } from "./errors.js";
import { feedWorkflow } from "./feed-workflow.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { writeFileAtomic } from "./project.js";

/**
 * `rmk feed build --out <dir> [--tools claude-code,codex,cursor] [--workspace <name>]... [--force]`
 * (feature 078, contract `docs/spec/plugin-feeds.md`, The git mirror): writes the registry's plugin
 * feeds as a repository tree that Codex, Cursor and Claude Code add as a marketplace. It holds the
 * public workspaces' items, and a private workspace's only when `--workspace` names it (093). For each tool it reads the
 * instance's marketplace, downloads the zips it doesn't have yet, checks each sha256, unpacks them
 * to `plugins/<tool>/<plugin>/`, and writes the tool's marketplace file with folder sources.
 *
 * Everything is fetched, checked and unpacked before anything is written, so a failure leaves the
 * tree as it was. rmk writes only the paths `.rmk-feed.json` records, and a path under `plugins/`
 * it didn't write, or one changed since, stops the build unless `--force`. The same feed always
 * gives the same bytes, so a run with nothing new released changes nothing.
 */
type Args = {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
};

export const FEED_STATE = ".rmk-feed.json";

/** What the instance's marketplace route answers (077): Claude Code's shape, for every tool. */
type ServedMarketplace = {
  name: string;
  owner?: { name?: string };
  description?: string;
  plugins: {
    name: string;
    version: string;
    description?: string;
    source: { source: string; url: string; sha256: string };
  }[];
};

type PluginState = { version: string; sha256: string; tree: string };

type ToolState = {
  marketplace: string;
  /** The sha256 of the marketplace file rmk wrote. */
  file: string;
  plugins: Record<string, PluginState>;
};

/** `.rmk-feed.json`: what rmk wrote, so it changes only that. */
export type FeedState = {
  version: 1;
  registry: string;
  tools: Partial<Record<PluginTool, ToolState>>;
};

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A folder's files as one hash: each path and its content's sha256, sorted. */
const treeOf = (files: { path: string; bytes: Uint8Array }[]) =>
  sha256(
    [...files]
      .sort((a, b) => byName(a.path, b.path))
      .map((f) => `${f.path}\0${sha256(f.bytes)}\n`)
      .join(""),
  );

/** The files under `dir`, by `/` path relative to it; null when something isn't a plain file. */
const filesUnder = (dir: string, prefix = ""): { path: string; bytes: Uint8Array }[] | null => {
  const out: { path: string; bytes: Uint8Array }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    byName(a.name, b.name),
  )) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = filesUnder(full, path);
      if (!inner) return null;
      out.push(...inner);
    } else if (entry.isFile()) out.push({ path, bytes: new Uint8Array(readFileSync(full)) });
    else return null;
  }
  return out;
};

const stableJson = (value: unknown): string => {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort(byName)
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
};

/**
 * A plugin's name is one folder under `plugins/<tool>/`: a single segment, no `..`, `/` or `\\`.
 * Names come from the feed state file (anyone's to edit in a committed folder) and from the
 * server, and rmk deletes and writes the folder they name (security audit ITEM-1, 2026-10-05).
 */
const pluginNameProblem = (name: unknown): string | null =>
  typeof name !== "string" ? "isn't a name" : name.includes("/") ? "has a /" : pathProblem(name);

const mustBePluginName = (name: unknown, where: string) => {
  const problem = pluginNameProblem(name);
  if (problem)
    throw new RmkError(
      `Nothing was written: ${where} names the plugin ${JSON.stringify(name)}, which ${problem}. rmk only writes plugins inside their folder.`,
      1,
      "unsafe_path",
      { plugin: name },
    );
};

const readState = (out: string): FeedState | null => {
  const path = join(out, FEED_STATE);
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as FeedState;
    if (state.version !== 1 || typeof state.tools !== "object" || !state.tools) throw new Error();
    for (const tool of Object.values(state.tools))
      for (const name of Object.keys(tool?.plugins ?? {}))
        if (pluginNameProblem(name)) throw new Error();
    return state;
  } catch {
    throw new RmkError(
      `${FEED_STATE} in ${out} isn't one rmk wrote. Move it aside, or build into another folder.`,
      1,
      "bad_feed_state",
    );
  }
};

export type FeedConflict = { path: string; reason: "unmanaged" | "edited" };

/** The tools to build: `--tools`, or all three. */
const toolsOf = (value: string | undefined): PluginTool[] => {
  if (value === undefined) return [...PLUGIN_TOOLS];
  const tools = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const unknown = tools.filter((t) => !(PLUGIN_TOOLS as readonly string[]).includes(t));
  if (unknown.length || tools.length === 0)
    throw usage(`--tools takes ${PLUGIN_TOOLS.join(", ")}, separated by commas.`);
  return [...new Set(tools)].sort(byName) as PluginTool[];
};

/**
 * The workspaces `--workspace` names (093), repeated or separated by commas, lower-cased, each
 * checked as a name: they also go into the printed workflow.
 */
export const workspacesOf = (value: string | boolean | string[] | undefined): string[] => {
  const given = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const names = given.flatMap((v) => v.split(",")).map(normalizeWorkspaceName);
  for (const name of names)
    if (nameProblem(name, "item"))
      throw usage(`--workspace takes workspace names, such as acme; "${name}" isn't one.`);
  return [...new Set(names)].sort(byName);
};

/** The marketplace route, for the public workspaces and the private ones named (093). */
const marketplacePath = (tool: PluginTool, workspaces: readonly string[]) =>
  `/feeds/${tool}/marketplace.json?workspaces=${encodeURIComponent(workspaces.join(","))}`;

/** The zip route for a plugin, from its name and version (contract, Endpoints). */
const zipPath = (tool: PluginTool, plugin: string, version: string) => {
  const item = itemNameOfPlugin(plugin);
  if (!item)
    throw new RmkError(`The feed lists ${plugin}, which isn't a Ronne plugin name.`, 1, "bad_feed");
  const ref = parseItemName(item);
  const where = [
    ...(ref && ref.workspace !== GLOBAL_WORKSPACE ? [ref.workspace] : []),
    ref?.scope ?? "",
    ref?.name ?? "",
  ];
  return `/feeds/${tool}/plugins/${where.map(encodeURIComponent).join("/")}/${encodeURIComponent(version)}.zip`;
};

type Planned = {
  tool: PluginTool;
  served: ServedMarketplace;
  marketplace: PackageFile;
  /** Plugins to write, unpacked, by name. */
  write: Map<string, { files: PackageFile[]; state: PluginState }>;
  keep: Map<string, PluginState>;
  remove: string[];
  added: string[];
  updated: string[];
};

export const feedBuild = async (
  api: ApiClient,
  options: { out: string; tools: PluginTool[]; force: boolean; workspaces?: readonly string[] },
) => {
  const out = options.out;
  const previous = readState(out);
  const known = (tool: PluginTool) => previous?.tools[tool];

  // 1. The feeds, all of them, before looking at the disk.
  const served = new Map<PluginTool, ServedMarketplace>();
  for (const tool of options.tools)
    served.set(
      tool,
      await api.get<ServedMarketplace>(marketplacePath(tool, options.workspaces ?? [])),
    );

  // 2. What's on disk that rmk didn't write, or that changed since.
  const conflicts: FeedConflict[] = [];
  const pluginsDir = join(out, "plugins");
  if (existsSync(pluginsDir))
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true }))
      if (!entry.isDirectory() || !(PLUGIN_TOOLS as readonly string[]).includes(entry.name))
        conflicts.push({ path: `plugins/${entry.name}`, reason: "unmanaged" });
  for (const tool of options.tools) {
    const state = known(tool);
    const toolDir = join(pluginsDir, tool);
    if (existsSync(toolDir))
      for (const entry of readdirSync(toolDir, { withFileTypes: true })) {
        const path = `plugins/${tool}/${entry.name}`;
        const recorded = state?.plugins[entry.name];
        if (!recorded || !entry.isDirectory()) {
          conflicts.push({ path, reason: "unmanaged" });
          continue;
        }
        const files = filesUnder(join(toolDir, entry.name));
        if (!files || treeOf(files) !== recorded.tree) conflicts.push({ path, reason: "edited" });
      }
    const file = join(out, MARKETPLACE_PATHS[tool]);
    if (existsSync(file)) {
      const bytes = readFileSync(file);
      if (!state) conflicts.push({ path: MARKETPLACE_PATHS[tool], reason: "unmanaged" });
      else if (sha256(bytes) !== state.file)
        conflicts.push({ path: MARKETPLACE_PATHS[tool], reason: "edited" });
    }
  }
  if (conflicts.length && !options.force)
    throw new RmkError(
      `Nothing was written: ${conflicts.length} path${conflicts.length === 1 ? "" : "s"} in ${out} ${conflicts.length === 1 ? "isn't" : "aren't"} rmk's, or changed since rmk wrote ${conflicts.length === 1 ? "it" : "them"}. Move ${conflicts.length === 1 ? "it" : "them"} aside, or run again with --force.`,
      3,
      "conflicts",
      { conflicts },
    );
  const edited = new Set(conflicts.map((c) => c.path));

  // 3. Download, check and unpack what's new or changed.
  const plans: Planned[] = [];
  for (const tool of options.tools) {
    const feed = served.get(tool) as ServedMarketplace;
    const state = known(tool);
    const plan: Planned = {
      tool,
      served: feed,
      marketplace: marketplaceFor(
        tool,
        feed.plugins.map((p) => ({
          name: p.name,
          version: p.version,
          description: p.description ?? "",
          source: { kind: "path", path: `plugins/${tool}/${p.name}` },
        })),
        {
          name: feed.name,
          owner: feed.owner?.name ?? feed.name,
          description: feed.description ?? "",
        },
      ),
      write: new Map(),
      keep: new Map(),
      remove: [],
      added: [],
      updated: [],
    };
    for (const plugin of feed.plugins) mustBePluginName(plugin.name, `The ${tool} feed`);
    for (const plugin of [...feed.plugins].sort((a, b) => byName(a.name, b.name))) {
      const recorded = state?.plugins[plugin.name];
      const path = `plugins/${tool}/${plugin.name}`;
      if (
        recorded &&
        recorded.sha256 === plugin.source.sha256 &&
        !edited.has(path) &&
        existsSync(join(out, path))
      ) {
        plan.keep.set(plugin.name, recorded);
        continue;
      }
      const { bytes } = await api.bytes(zipPath(tool, plugin.name, plugin.version));
      if (sha256(bytes) !== plugin.source.sha256.toLowerCase())
        throw new RmkError(
          `Nothing was written: ${tool}/${plugin.name}@${plugin.version}'s download doesn't match the sha256 its marketplace lists.`,
          1,
          "checksum_mismatch",
          { tool, plugin: plugin.name, version: plugin.version },
        );
      let files: PackageFile[];
      try {
        files = readPluginArchive(bytes);
      } catch (error) {
        if (!(error instanceof PluginArchiveError)) throw error;
        throw new RmkError(
          `Nothing was written: ${tool}/${plugin.name}@${plugin.version}: ${error.message}`,
          1,
          "bad_plugin",
        );
      }
      plan.write.set(plugin.name, {
        files,
        state: { version: plugin.version, sha256: plugin.source.sha256, tree: treeOf(files) },
      });
      (recorded ? plan.updated : plan.added).push(plugin.name);
    }
    const listed = new Set(feed.plugins.map((p) => p.name));
    plan.remove = Object.keys(state?.plugins ?? {})
      .filter((name) => !listed.has(name))
      .sort(byName);
    plans.push(plan);
  }

  // 4. Write: whole plugin folders, the marketplace files, then the state. First, every place it
  // deletes or writes must stay in the folder, through any link a repository commits there
  // (security audit ITEM-1, 2026-10-05).
  const here = { folder: `the --out folder (${out})`, stateFile: FEED_STATE };
  for (const plan of plans) {
    for (const name of plan.remove)
      mustStayInside(out, `plugins/${plan.tool}/${name}`, "It would remove", here);
    for (const name of plan.write.keys())
      mustStayInside(out, `plugins/${plan.tool}/${name}`, "It would write", here);
    mustStayInside(out, plan.marketplace.path, "It would write", here);
  }
  mustStayInside(out, FEED_STATE, "It would write", here);
  // Through a new file and a rename, which replaces a link rather than writing where it points.
  const writeIfChanged = (path: string, bytes: Uint8Array | string) => {
    const full = join(out, path);
    const next = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
    if (existsSync(full) && sha256(readFileSync(full)) === sha256(next)) return;
    writeFileAtomic(full, next);
  };
  const next: FeedState = {
    version: 1,
    registry: api.registry,
    tools: { ...(previous?.tools ?? {}) },
  };
  for (const plan of plans) {
    for (const name of plan.remove)
      rmSync(join(out, "plugins", plan.tool, name), { recursive: true, force: true });
    for (const [name, { files }] of plan.write) {
      const dir = join(out, "plugins", plan.tool, name);
      rmSync(dir, { recursive: true, force: true });
      for (const file of files) {
        const full = join(dir, file.path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, file.bytes);
        if (file.executable) chmodSync(full, 0o755);
      }
    }
    writeIfChanged(plan.marketplace.path, plan.marketplace.bytes);
    next.tools[plan.tool] = {
      marketplace: plan.served.name,
      file: sha256(plan.marketplace.bytes),
      plugins: Object.fromEntries(
        [...plan.keep, ...[...plan.write].map(([n, w]) => [n, w.state] as const)].sort((a, b) =>
          byName(a[0], b[0]),
        ),
      ),
    };
  }
  writeIfChanged(FEED_STATE, stableJson(next));
  return plans.map((plan) => ({
    tool: plan.tool,
    marketplace: plan.served.name,
    plugins: plan.served.plugins.length,
    added: plan.added,
    updated: plan.updated,
    removed: plan.remove,
  }));
};

export const feedCommand = async (io: Io, args: Args, out: Output, api: () => ApiClient) => {
  const [action, ...rest] = args.positionals;
  if (action !== "build" || rest.length)
    throw usage(
      "Usage: rmk feed build --out <dir> [--tools claude-code,codex,cursor] [--workspace <name>]... [--force]\n       rmk feed build --print-workflow github|gitlab [--workspace <name>]...",
    );
  const workspaces = workspacesOf(args.values.workspace);
  const host = args.values["print-workflow"];
  if (typeof host === "string") {
    // Only prints: no registry, no token, nothing written.
    const workflow = feedWorkflow(host, undefined, workspaces);
    out.set("workflow", workflow);
    out.say(workflow.slice(0, -1));
    return;
  }
  const dir = typeof args.values.out === "string" ? args.values.out : undefined;
  if (!dir) throw usage("Say where to write the mirror: rmk feed build --out <dir>.");
  const tools = toolsOf(typeof args.values.tools === "string" ? args.values.tools : undefined);
  const target = resolve(io.cwd, dir);
  if (existsSync(target) && !lstatSync(target).isDirectory()) throw usage(`${dir} isn't a folder.`);
  const client = api();
  let results: Awaited<ReturnType<typeof feedBuild>>;
  try {
    mkdirSync(target, { recursive: true });
    results = await feedBuild(client, {
      out: target,
      tools,
      force: args.values.force === true,
      workspaces,
    });
  } catch (error) {
    if (error instanceof RmkError && error.code === "conflicts")
      for (const c of (error.details?.conflicts ?? []) as FeedConflict[])
        out.say(
          `  ${c.path}: ${c.reason === "unmanaged" ? "not written by rmk" : "changed since rmk wrote it"}`,
        );
    throw error;
  }
  const changed = results.some((r) => r.added.length || r.updated.length || r.removed.length);
  out.set("registry", client.registry);
  out.set("out", dir);
  out.set("changed", changed);
  out.set("tools", results);
  out.set("workspaces", workspaces);
  out.say(`Built ${client.registry}'s plugin feed into ${dir}:`);
  for (const r of results) {
    out.say(
      `  ${r.tool}: ${r.plugins} plugin${r.plugins === 1 ? "" : "s"} (${r.added.length} added, ${r.updated.length} updated, ${r.removed.length} removed)`,
    );
    for (const name of r.added) out.say(`    + ${name}`);
    for (const name of r.updated) out.say(`    ~ ${name}`);
    for (const name of r.removed) out.say(`    - ${name}`);
  }
  if (!changed) out.say("Nothing changed.");
  if (workspaces.length)
    out.say(
      `It includes the workspace${workspaces.length === 1 ? "" : "s"} named with --workspace (${workspaces.join(", ")}): keep the repository you push it to private, since anyone who can read it can install what's in it.`,
    );
};
