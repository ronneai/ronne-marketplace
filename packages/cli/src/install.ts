import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type ItemType,
  isItemType,
  isVersionRange,
  parseManifest,
  type Resolution,
} from "@ronneai/core";
import { sha256Hex, unpackItem } from "@ronneai/core/pack";
import {
  type Change,
  type PlatformRenderer,
  RENDERERS,
  type RenderWarning,
  rendererById,
} from "@ronneai/core/render";
import type { ApiClient } from "./api.js";
import {
  applyPlan,
  type Plan,
  planChanges,
  readState,
  type State,
  type StateEntry,
  type Wanted,
  writeState,
} from "./apply.js";
import { configDir } from "./config.js";
import { RmkError, usage } from "./errors.js";
import type { Io } from "./io.js";
import { applyOperation, planOperation } from "./operations.js";
import type { Output } from "./output.js";
import {
  LOCK_FILE,
  type Lockfile,
  readLockfile,
  readProjectConfig,
  splitItemRef,
  writeLockfile,
  writeProjectConfig,
} from "./project.js";
import { itemPath } from "./registry-commands.js";

/**
 * Installing (feature 022, MVP §4.3): resolve, download and check, render for each target, plan
 * against the state file, then write files, `rmk.lock` and `.rmk/state.json`. Nothing is written
 * until the whole plan is known to succeed.
 */
export type Scope = "project" | "user";

/** Where a scope keeps its files: the project root, or the home folder with rmk's own files under ~/.config/rmk. */
export const places = (io: Io, scope: Scope) =>
  scope === "project"
    ? { root: io.cwd, lock: join(io.cwd, LOCK_FILE), state: join(io.cwd, ".rmk", "state.json") }
    : {
        root: io.home,
        lock: join(configDir(io), "user.lock"),
        state: join(configDir(io), "user-state.json"),
      };

export const scopeOf = (value: string | undefined): Scope => {
  if (value === undefined || value === "project") return "project";
  if (value === "user") return "user";
  throw usage("--scope is project or user.");
};

/** The renderers to write for: `--target`, the config's `targets`, or what the project looks like. */
export const chooseTargets = async (
  io: Io,
  requested: string | undefined,
  configured: string[] | undefined,
  out: Output,
): Promise<PlatformRenderer[]> => {
  const byIds = (ids: string[]) =>
    ids.map((id) => {
      const renderer = rendererById(id.trim());
      if (!renderer) throw usage(`No renderer is called ${id}; rmk platforms lists them.`);
      return renderer;
    });
  if (requested === "all") return [...RENDERERS];
  if (requested) return byIds(requested.split(","));
  if (configured?.length) return byIds(configured);
  const probe = { exists: async (path: string) => existsSync(join(io.cwd, path)) };
  const detected: PlatformRenderer[] = [];
  for (const renderer of RENDERERS) if (await renderer.detect(probe)) detected.push(renderer);
  if (detected.length === 1) return detected;
  if (detected.length > 1 && io.interactive) {
    const answer = await io.prompt(
      `Several tools look used here (${detected.map((r) => r.id).join(", ")}). Which? (ids, comma-separated, or all) `,
    );
    return answer.trim() === "all" ? detected : byIds(answer.split(","));
  }
  if (detected.length === 0 && io.interactive && RENDERERS.length === 1) {
    out.say(`No tool detected here; using ${RENDERERS[0]?.id}.`);
    return [...RENDERERS];
  }
  throw new RmkError(
    detected.length
      ? `Several tools look used here (${detected.map((r) => r.id).join(", ")}): say which with --target.`
      : "No AI tool detected in this project: say which with --target, or set targets in rmk.config.json.",
    2,
    "no_target",
  );
};

const cacheDir = (io: Io) =>
  join(io.env.XDG_CACHE_HOME || join(io.home, ".cache"), "rmk", "artifacts");

/** The artifact's bytes, from the cache by sha256 or downloaded; a mismatch stops everything. */
export const fetchArtifact = async (
  io: Io,
  api: ApiClient,
  name: string,
  version: string,
  sha256: string,
): Promise<Uint8Array> => {
  const cached = join(cacheDir(io), `${sha256}.tgz`);
  if (existsSync(cached)) {
    const bytes = new Uint8Array(readFileSync(cached));
    if ((await sha256Hex(bytes)) === sha256) return bytes;
  }
  const { bytes, headers } = await api.bytes(
    `${itemPath(name)}/${encodeURIComponent(version)}/tarball`,
  );
  const actual = await sha256Hex(bytes);
  if (
    actual !== sha256 ||
    (headers["x-checksum-sha256"] && headers["x-checksum-sha256"] !== sha256)
  )
    throw new RmkError(
      `${name}@${version}'s checksum doesn't match: got sha256 ${actual}, expected ${sha256}. Nothing was written.`,
      1,
      "checksum_mismatch",
      { item: name, version },
    );
  mkdirSync(cacheDir(io), { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
};

export type Rendered = {
  item: string;
  version: string;
  targets: string[];
  changes: Change[];
  warnings: RenderWarning[];
  envNames: string[];
};

/** Renders one downloaded item for every target, merging identical changes across targets. */
export const renderItem = (
  name: string,
  version: string,
  tgz: Uint8Array,
  targets: PlatformRenderer[],
  scope: Scope,
): Rendered => {
  const files = unpackItem(tgz);
  const manifestFile = files.find((file) => file.path === "ronne.yaml");
  const { manifest } = manifestFile
    ? parseManifest(new TextDecoder().decode(manifestFile.bytes))
    : { manifest: null };
  if (!manifest)
    throw new RmkError(
      `${name}@${version}'s package has no readable ronne.yaml.`,
      1,
      "bad_artifact",
    );
  const type = isItemType(String(manifest.type)) ? (manifest.type as ItemType) : null;
  const rendered: Rendered = {
    item: name,
    version,
    targets: targets.map((t) => t.id),
    changes: [],
    warnings: [],
    envNames: [],
  };
  const block = manifest["mcp-server"];
  if (block && typeof block === "object" && Array.isArray((block as { env?: unknown }).env))
    for (const entry of (block as { env: unknown[] }).env) {
      const envName = (entry as { name?: unknown })?.name;
      if (typeof envName === "string") rendered.envNames.push(envName);
    }
  for (const target of targets) {
    if (!type || target.supports(type) === "none") {
      rendered.warnings.push({
        code: "unsupported_type",
        message: `${target.name} has no place for ${name} (${type ?? "unknown type"}), so it was skipped there.`,
      });
      continue;
    }
    const result = target.render(
      { name, version, manifest, files },
      { scope, targets: targets.map((t) => t.id) },
    );
    rendered.changes.push(...result.changes);
    rendered.warnings.push(
      ...result.warnings.map((w) => ({ ...w, message: `${target.name}: ${w.message}` })),
    );
  }
  return rendered;
};

/** What a rendered item wants written, one `Wanted` per change, each carrying its targets. */
const wantedOf = (
  rendered: Rendered[],
  targetsByChange: (r: Rendered, c: Change) => string[],
): Wanted[] =>
  rendered.flatMap((r) =>
    r.changes.map((change) => ({
      item: r.item,
      version: r.version,
      targets: targetsByChange(r, change),
      change,
    })),
  );

export type InstallResult = {
  resolution: Resolution;
  rendered: Rendered[];
  plan: Plan;
  targets: string[];
  scope: Scope;
};

/** A resolved, rendered and planned install that hasn't written anything yet (027). */
export type Prepared = InstallResult & {
  /** The direct dependencies it was resolved for (user scope keeps them in its lockfile). */
  dependencies: Record<string, string>;
  registry: string;
  /** The state entries this install manages: every item's, but not `rmk mcp-setup`'s. */
  state: State;
  /** `rmk mcp-setup`'s entries, kept as they are (027). */
  kept: StateEntry[];
};

/** The state file's item name for `rmk mcp-setup`'s registration: not an item, so never resolved. */
export const MCP_SETUP_ITEM = "rmk mcp-setup";

/**
 * Resolves `dependencies` (with `locked` kept where it fits), downloads and checks, renders and
 * plans against the state file and the disk. Writes nothing but the download cache: `commit` does.
 */
export const prepareInstall = async (
  io: Io,
  api: ApiClient,
  options: {
    dependencies: Record<string, string>;
    locked: Record<string, string>;
    targets: PlatformRenderer[];
    scope: Scope;
    force: boolean;
  },
): Promise<Prepared> => {
  const resolution = await api.post<Resolution>("/resolve", {
    dependencies: options.dependencies,
    locked: options.locked,
  });
  const rendered: Rendered[] = [];
  for (const [name, item] of Object.entries(resolution.items).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const tgz = await fetchArtifact(io, api, name, item.version, item.sha256);
    rendered.push(renderItem(name, item.version, tgz, options.targets, options.scope));
  }
  const { root, state: statePath } = places(io, options.scope);
  const all = readState(statePath);
  // mcp-setup's registration isn't an item: installs leave it alone (027).
  const state: State = {
    version: 1,
    entries: all.entries.filter((e) => e.item !== MCP_SETUP_ITEM),
  };
  const kept = all.entries.filter((e) => e.item === MCP_SETUP_ITEM);
  // Every change carries every target the item was rendered for: a change two targets share is one entry.
  const wanted = wantedOf(rendered, (r) => r.targets);
  const plan = await planChanges(root, state, wanted, { force: options.force });
  return {
    resolution,
    rendered,
    plan,
    targets: options.targets.map((t) => t.id),
    scope: options.scope,
    dependencies: options.dependencies,
    registry: api.registry,
    state,
    kept,
  };
};

/** Writes a prepared install with no conflicts: the files, then the state file and the lockfile. */
export const commitInstall = (io: Io, prepared: Prepared) => {
  if (prepared.plan.conflicts.length)
    throw new RmkError("A plan with conflicts can't be written.", 3, "conflicts", {
      conflicts: prepared.plan.conflicts,
    });
  const { root, lock, state: statePath } = places(io, prepared.scope);
  const next = applyPlan(root, prepared.state, prepared.plan);
  next.entries.push(...prepared.kept);
  mkdirSync(join(statePath, ".."), { recursive: true });
  writeState(statePath, next);
  const lockfile: Lockfile & { dependencies?: Record<string, string> } = {
    version: 1,
    registry: prepared.registry,
    items: prepared.resolution.items,
  };
  // User scope has no rmk.config.json: its lockfile carries the direct dependencies.
  if (prepared.scope === "user") lockfile.dependencies = prepared.dependencies;
  mkdirSync(dirname(lock), { recursive: true });
  writeLockfile(dirname(lock), lockfile, basename(lock));
};

/** Prepares and, when nothing conflicts, commits: what `rmk install`, `update` and `remove` do. */
export const installResolved = async (
  io: Io,
  api: ApiClient,
  options: Parameters<typeof prepareInstall>[2],
): Promise<Prepared> => {
  const prepared = await prepareInstall(io, api, options);
  if (prepared.plan.conflicts.length === 0) commitInstall(io, prepared);
  return prepared;
};

/** `rmk install [<item>[@tag|range]...]`. */
export const installCommand = async (
  io: Io,
  args: { positionals: string[]; values: Record<string, string | boolean | undefined> },
  out: Output,
  api: ApiClient,
): Promise<void> => {
  const operation = await planOperation(io, api, {
    kind: "install",
    items: args.positionals,
    target: typeof args.values.target === "string" ? args.values.target : undefined,
    scope: typeof args.values.scope === "string" ? args.values.scope : undefined,
    registryGiven: Boolean(args.values.registry),
    force: args.values.force === true,
  });
  if (operation.plan.conflicts.length === 0) applyOperation(io, operation);
  report(out, operation, io);
};

/**
 * What a tool needs from the person before it uses what was written (024): Codex reads a project's
 * `.codex/` settings only once the project is trusted, runs new hooks only once reviewed, and reads
 * at most 32 KiB of `AGENTS.md`; Cursor documents its permissions only for its CLI (025). `root` is
 * the project, or the home folder in user scope.
 */
export const CODEX_INSTRUCTIONS_LIMIT = 32 * 1024;

export const toolNotes = (paths: string[], scope: Scope, root: string): string[] => {
  const notes: string[] = [];
  const codexSettings = paths.some(
    (path) =>
      path === ".codex/config.toml" ||
      path === ".codex/hooks.json" ||
      path.startsWith(".codex/rules/"),
  );
  if (scope === "project" && codexSettings)
    notes.push(
      "Codex reads .codex/config.toml, hooks and rules only in a project you trust: trust this one when Codex asks.",
    );
  if (paths.includes(".codex/hooks.json"))
    notes.push("Codex runs new or changed hooks only after you review them: open /hooks in Codex.");
  if (paths.includes(".cursor/cli.json") || paths.includes(".cursor/cli-config.json"))
    notes.push(
      "Cursor documents the permissions rmk wrote only for its agent CLI, not for the editor.",
    );
  const agentsMd = scope === "project" ? "AGENTS.md" : ".codex/AGENTS.md";
  const file = join(root, agentsMd);
  if (
    paths.includes(agentsMd) &&
    existsSync(file) &&
    statSync(file).size > CODEX_INSTRUCTIONS_LIMIT
  )
    notes.push(
      `${agentsMd} is over 32 KiB, and Codex stops reading its instructions there: move some rules to skills, or raise project_doc_max_bytes in Codex's config.`,
    );
  return notes;
};

/** Prints an install's outcome, and sets the exit code through the `Output`'s data. */
export const report = (out: Output, result: InstallResult, io: Io) => {
  const { plan, rendered, resolution } = result;
  const written = plan.writes.map((w) => ({
    item: w.wanted.item,
    version: w.wanted.version,
    kind: w.entry.kind,
    path: w.entry.path,
  }));
  const removed = plan.removes.map((e) => ({ item: e.item, kind: e.kind, path: e.path }));
  const warnings = rendered.flatMap((r) => r.warnings.map((w) => ({ item: r.item, ...w })));
  const missingEnv = [...new Set(rendered.flatMap((r) => r.envNames))]
    .filter((name) => !io.env[name])
    .sort();
  out.set("targets", result.targets);
  out.set(
    "items",
    Object.fromEntries(
      Object.entries(resolution.items).map(([name, item]) => [name, item.version]),
    ),
  );
  out.set("written", written);
  out.set("removed", removed);
  out.set("conflicts", plan.conflicts);
  out.set("reformatted", plan.reformatted);
  out.set(
    "warnings",
    warnings.map((w) => ({ item: w.item, code: w.code, message: w.message })),
  );
  out.set("deprecated", resolution.warnings);
  out.set("missingEnv", missingEnv);
  if (plan.conflicts.length) {
    out.say(
      "Nothing was written: these files or settings aren't rmk's, or changed since rmk wrote them.",
    );
    for (const c of plan.conflicts)
      out.say(
        `  ${c.path}${c.key ? ` (${Array.isArray(c.key) ? c.key.join(".") : c.key})` : ""}: ${c.reason === "unmanaged" ? "not written by rmk" : "edited since rmk wrote it"} (${c.item})`,
      );
    out.say("Move them aside, or run again with --force to replace them.");
    throw new RmkError(
      `${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? "" : "s"} left in place.`,
      3,
      "conflicts",
      { conflicts: plan.conflicts },
    );
  }
  const names = Object.keys(resolution.items).sort();
  out.say(
    names.length
      ? `Installed ${names.map((n) => `${n}@${resolution.items[n]?.version}`).join(", ")} for ${result.targets.join(", ")}.`
      : "Nothing to install.",
  );
  if (written.length === 0 && removed.length === 0 && names.length)
    out.say("Everything was already in place.");
  for (const w of written)
    out.say(
      `  wrote ${w.path}${w.kind === "json-key" || w.kind === "toml-key" || w.kind === "json-array-item" ? " (a setting)" : ""}`,
    );
  for (const path of plan.reformatted)
    out.say(
      `Note: rmk rewrote ${path} in its own layout; its comments and formatting weren't kept.`,
    );
  for (const r of removed) out.say(`  removed ${r.path}`);
  for (const d of resolution.warnings) out.say(`Deprecated: ${d.item}@${d.version}: ${d.message}`);
  for (const w of warnings) out.say(`Warning: ${w.message}`);
  for (const note of toolNotes(
    written.map((w) => w.path),
    result.scope,
    places(io, result.scope).root,
  ))
    out.say(`Note: ${note}`);
  if (missingEnv.length)
    out.say(
      `Set these environment variables before using the MCP servers: ${missingEnv.join(", ")}.`,
    );
};
