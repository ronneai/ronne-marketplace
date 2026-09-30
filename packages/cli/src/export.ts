import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  checkPackage,
  DEFAULT_LIMITS,
  formatBytes,
  isValidName,
  type ManifestIssue,
  normalizeScopeName,
  type PackageFile,
  type PackageLimits,
  parseItemName,
  parseManifest,
  secretLike,
} from "@ronneai/core";
import {
  agentName,
  CURSOR_COMMAND_EXTENSIONS,
  codexAgentName,
  commandName,
  cursorAgentName,
  cursorCommandName,
  mcpServerName,
  ReadError,
  type ReadResult,
  readAgent,
  readCodexAgent,
  readCodexMcpServer,
  readCommand,
  readCursorAgent,
  readCursorCommand,
  readCursorMcpServer,
  readCursorRule,
  readMcpServer,
  readRule,
  readSkill,
  ruleName,
  skillName,
  toItemName,
  withDependencies,
} from "@ronneai/core/read";
import { parse as parseToml } from "smol-toml";
import { type ApiClient, ApiError } from "./api.js";
import { diskHash, readState } from "./apply.js";
import { RmkError, usage } from "./errors.js";
import { type Finding, findDependencies } from "./export-dependencies.js";
import { MCP_SETUP_ITEM, places, type Scope, scopeOf } from "./install.js";
import type { Io } from "./io.js";
import { SERVER_NAME } from "./mcp-setup.js";
import { itemPath } from "./registry-commands.js";

/**
 * `rmk export` (feature 038): what a person wrote in their AI tool, sent to the registry as a
 * draft. This file finds the items and reads their folders; the reader in `@ronneai/core/read`
 * turns the files into an item. Nothing here writes to the project.
 */

/** Where skills live, relative to the project or the home folder (native-readers.md §4). */
export const SKILL_FOLDERS = [".claude/skills", ".agents/skills"] as const;

/** The types `rmk export` reads from Claude Code's files (038, 040). */
export type ExportType = "skill" | "agent" | "command" | "rule" | "mcp-server";
export const EXPORT_TYPES: readonly ExportType[] = [
  "skill",
  "agent",
  "command",
  "rule",
  "mcp-server",
];

/** The AI tool an item was written for; `shared` is `.agents/skills/`, which Codex and Cursor read. */
export type SourceTool = "claude-code" | "codex" | "cursor" | "shared";
/** The tools `--from` names (043). */
export type ExportTool = Exclude<SourceTool, "shared">;
export const EXPORT_TOOLS: readonly ExportTool[] = ["claude-code", "codex", "cursor"];

/** Whether an item is one `--from <tool>` means: the shared skills folder counts for Codex and Cursor. */
export const fromTool = (item: { tool: SourceTool }, from: ExportTool | undefined) =>
  !from || item.tool === from || (item.tool === "shared" && from !== "claude-code");

/** An item found on disk. */
export type LocalItem = {
  type: ExportType;
  tool: SourceTool;
  /** The item's short name, which `rmk export <name>` matches. */
  name: string;
  /**
   * Where it is, as found (it may be a link): a skill's folder, an agent's, command's or rule's
   * file, or the JSON file an MCP server is a key of.
   */
  path: string;
  /** An MCP server's key under `mcpServers` (or Codex's `mcp_servers`). */
  key?: string;
  /** As shown: relative to the scope's root, with `/`, and the key for an MCP server. */
  display: string;
  scope: Scope;
};

const toSlashes = (path: string) => path.split("\\").join("/");

/** A folder, following a link to one; null for anything else, or a link that leads nowhere. */
const realFolder = (path: string): string | null => {
  try {
    return statSync(path).isDirectory() ? realpathSync(path) : null;
  } catch {
    return null;
  }
};

/**
 * The skills in a scope: every folder with a `SKILL.md` under `.claude/skills/` and
 * `.agents/skills/`, by name, then by where. Folders that are the same after following links (one
 * linked from the other, or the home folder used as the project) are listed once.
 */
export const findSkills = (io: Io, scope: Scope): LocalItem[] => {
  const { root } = places(io, scope);
  const seen = new Set<string>();
  const found: LocalItem[] = [];
  for (const folder of SKILL_FOLDERS) {
    const parent = join(root, folder);
    if (!realFolder(parent)) continue;
    for (const name of readdirSync(parent).sort()) {
      const dir = join(parent, name);
      const real = realFolder(dir);
      if (!real || seen.has(real) || !existsSync(join(real, "SKILL.md"))) continue;
      seen.add(real);
      found.push({
        type: "skill",
        tool: folder === ".claude/skills" ? "claude-code" : "shared",
        name,
        path: dir,
        display: toSlashes(relative(root, dir)),
        scope,
      });
    }
  }
  return found.sort((a, b) =>
    a.name === b.name ? (a.display < b.display ? -1 : 1) : a.name < b.name ? -1 : 1,
  );
};

/** A file, following a link to one; null for anything else. */
const realFile = (path: string): string | null => {
  try {
    return statSync(path).isFile() ? realpathSync(path) : null;
  } catch {
    return null;
  }
};

/** A single-file item's source: where a tool keeps that type, and the extensions it reads. */
type FileSource = {
  tool: Exclude<SourceTool, "shared">;
  type: "agent" | "command" | "rule";
  folder: string;
  extensions: readonly string[];
  /** Cursor keeps user rules in its settings, not in files. */
  projectOnly?: boolean;
};

/** Where each tool keeps agents, commands and rules, read recursively (native-readers.md §5–10). */
export const FILE_SOURCES: readonly FileSource[] = [
  { tool: "claude-code", type: "agent", folder: ".claude/agents", extensions: [".md"] },
  { tool: "claude-code", type: "command", folder: ".claude/commands", extensions: [".md"] },
  { tool: "claude-code", type: "rule", folder: ".claude/rules", extensions: [".md"] },
  { tool: "codex", type: "agent", folder: ".codex/agents", extensions: [".toml"] },
  { tool: "cursor", type: "agent", folder: ".cursor/agents", extensions: [".md"] },
  {
    tool: "cursor",
    type: "rule",
    folder: ".cursor/rules",
    extensions: [".mdc"],
    projectOnly: true,
  },
  {
    tool: "cursor",
    type: "command",
    folder: ".cursor/commands",
    extensions: CURSOR_COMMAND_EXTENSIONS,
  },
];

const filesUnder = (dir: string, extensions: readonly string[], under = ""): string[] => {
  if (!realFolder(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      const path = under ? `${under}/${entry}` : entry;
      if (realFolder(full)) return filesUnder(full, extensions, path);
      return extensions.some((e) => entry.endsWith(e)) && realFile(full) ? [path] : [];
    });
};

/** A TOML file's parsed value, or null when it doesn't parse. */
const tomlOf = (text: string): unknown => {
  try {
    return parseToml(text);
  } catch {
    return null;
  }
};

/** A path under a tool's folder as a name: a subfolder joins it, the extension goes. */
const nameFromPath = (under: string, extensions: readonly string[]) => {
  const ext = extensions.find((e) => under.endsWith(e));
  return toItemName((ext ? under.slice(0, -ext.length) : under).split("/").join("-"));
};

/** The name a single-file item suggests, as its tool names it (native-readers.md §5–10). */
export const suggestedName = (
  source: Pick<FileSource, "tool" | "type" | "extensions">,
  file: PackageFile,
  under: string,
): string => {
  const base = basename(under);
  if (source.tool === "codex")
    return codexAgentName(tomlOf(new TextDecoder().decode(file.bytes)), base);
  if (source.tool === "cursor")
    return source.type === "agent"
      ? cursorAgentName(file, base)
      : source.type === "command"
        ? cursorCommandName(file, under)
        : nameFromPath(under, source.extensions);
  return source.type === "agent"
    ? agentName(file, base)
    : source.type === "command"
      ? commandName(under)
      : ruleName(under);
};

/** The agents, commands and rules of one source in a scope, named as the readers name them. */
const findFiles = (io: Io, scope: Scope, source: FileSource): LocalItem[] => {
  if (source.projectOnly && scope === "user") return [];
  const { root } = places(io, scope);
  const folder = join(root, source.folder);
  return filesUnder(folder, source.extensions).map((under) => {
    const path = join(folder, under);
    const file = { path: under, bytes: new Uint8Array(readFileSync(path)) };
    return {
      type: source.type,
      tool: source.tool,
      name: suggestedName(source, file, under),
      path,
      display: toSlashes(relative(root, path)),
      scope,
    };
  });
};

/** Where each tool keeps MCP servers, per scope (native-readers.md §8–10). */
const MCP_SOURCES: readonly {
  tool: Exclude<SourceTool, "shared">;
  file: (scope: Scope) => string;
  toml: boolean;
}[] = [
  {
    tool: "claude-code",
    file: (scope) => (scope === "project" ? ".mcp.json" : ".claude.json"),
    toml: false,
  },
  { tool: "codex", file: () => ".codex/config.toml", toml: true },
  { tool: "cursor", file: () => ".cursor/mcp.json", toml: false },
];

/** The table MCP servers are under: Codex's `mcp_servers`, everyone else's `mcpServers`. */
export const serversKey = (path: string) => (path.endsWith(".toml") ? "mcp_servers" : "mcpServers");

/** The servers in one config file, or the reason it can't be read. */
export const serversIn = (
  path: string,
): { servers: Record<string, unknown>; problem: string | null } => {
  if (!realFile(path)) return { servers: {}, problem: null };
  const toml = path.endsWith(".toml");
  try {
    const text = readFileSync(path, "utf8");
    const parsed = (toml ? parseToml(text) : JSON.parse(text)) as Record<string, unknown>;
    const servers = parsed?.[serversKey(path)];
    return {
      servers:
        servers && typeof servers === "object" && !Array.isArray(servers)
          ? (servers as Record<string, unknown>)
          : {},
      problem: null,
    };
  } catch (error) {
    return {
      servers: {},
      problem: `${basename(path)} isn't valid ${toml ? "TOML" : "JSON"} (${(error as Error).message}), so its MCP servers can't be read.`,
    };
  }
};

/** Every tool's MCP config in a scope: where it is, its servers, and why it can't be read. */
export const mcpConfigs = (io: Io, scope: Scope) => {
  const { root } = places(io, scope);
  return MCP_SOURCES.map((source) => {
    const path = join(root, source.file(scope));
    return { tool: source.tool, path, ...serversIn(path) };
  });
};

/** Claude Code's MCP config in a scope (040). */
export const readMcpServers = (io: Io, scope: Scope) => {
  const [claude] = mcpConfigs(io, scope);
  return claude as NonNullable<typeof claude>;
};

/**
 * Every tool's MCP servers in a scope, less the ones `rmk mcp-setup` registered, which are never
 * items.
 */
const findMcpServers = (io: Io, scope: Scope): LocalItem[] => {
  const { root, state } = places(io, scope);
  const entries = readState(state).entries.filter(
    (e) => e.item === MCP_SETUP_ITEM && (e.kind === "json-key" || e.kind === "toml-key"),
  );
  return mcpConfigs(io, scope).flatMap(({ tool, path, servers }) => {
    const file = toSlashes(relative(root, path));
    const setup = new Set(
      entries
        .filter((e) => e.path === file)
        .map((e) => (Array.isArray(e.key) ? e.key.at(-1) : undefined)),
    );
    return Object.keys(servers)
      .filter((key) => key !== SERVER_NAME && !setup.has(key))
      .sort()
      .map((key) => ({
        type: "mcp-server" as const,
        tool,
        name: mcpServerName(key),
        path,
        key,
        display: `${file} (${serversKey(path)}.${key})`,
        scope,
      }));
  });
};

/** Every item `rmk export` can find in a scope, by name then type then place (038, 040). */
export const discoverLocalItems = (io: Io, scope: Scope): LocalItem[] =>
  [
    ...findSkills(io, scope),
    ...FILE_SOURCES.flatMap((source) => findFiles(io, scope, source)),
    ...findMcpServers(io, scope),
  ].sort((a, b) =>
    a.name !== b.name
      ? a.name < b.name
        ? -1
        : 1
      : a.type !== b.type
        ? EXPORT_TYPES.indexOf(a.type) - EXPORT_TYPES.indexOf(b.type)
        : a.display < b.display
          ? -1
          : 1,
  );

/** Folders that are never part of an item, wherever they are in it (native-readers.md §3). */
const NEVER_FOLDERS = new Set([".git", ".hg", ".svn", "node_modules", "__pycache__", ".ronne"]);
const NEVER_FILES = new Set([".DS_Store", "Thumbs.db"]);
/** Files that likely hold secrets: skipped even when they're empty samples. */
const SECRET_FILE = /^(?:\.env|\.env\..+|.+\.pem|.+\.key|id_rsa.*|\.npmrc|\.netrc)$/;

export type SkipReason = "not_item" | "secret_file" | "link";

/** A file or folder left out, with why; a folder is shown with a trailing `/`. */
export type Skipped = { path: string; reason: SkipReason };

export type OverLimit =
  | { limit: "file"; path: string; size: number; max: number }
  | { limit: "files"; max: number }
  | { limit: "total"; max: number };

export type WalkedFolder = {
  /** By path, with `/`. Empty when the walk stopped over a limit. */
  files: PackageFile[];
  skipped: Skipped[];
  /** Set when the folder is over the upload limits: the walk stopped there. */
  over: OverLimit | null;
};

const byPath = <T extends { path: string }>(a: T, b: T) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/**
 * Every file in an item's folder, with its executable bit, less what's never uploaded: the
 * folders and files above, likely secrets, and symbolic links (never followed; the folder itself
 * may be one). Sizes are checked before anything is read, and the walk stops as soon as the folder
 * is over the limits, so a huge folder isn't read into memory.
 */
export const walkItemFolder = (
  dir: string,
  limits: PackageLimits = DEFAULT_LIMITS,
): WalkedFolder => {
  const root = realpathSync(dir);
  const files: PackageFile[] = [];
  const skipped: Skipped[] = [];
  let total = 0;

  const walk = (folder: string): OverLimit | null => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = join(folder, entry.name);
      const path = toSlashes(relative(root, full));
      if (lstatSync(full).isSymbolicLink()) {
        skipped.push({ path, reason: "link" });
        continue;
      }
      if (entry.isDirectory()) {
        if (NEVER_FOLDERS.has(entry.name)) {
          skipped.push({ path: `${path}/`, reason: "not_item" });
          continue;
        }
        const over = walk(full);
        if (over) return over;
        continue;
      }
      if (!entry.isFile()) continue;
      if (NEVER_FILES.has(entry.name)) {
        skipped.push({ path, reason: "not_item" });
        continue;
      }
      if (SECRET_FILE.test(entry.name)) {
        skipped.push({ path, reason: "secret_file" });
        continue;
      }
      const stat = statSync(full);
      if (stat.size > limits.maxFileBytes)
        return { limit: "file", path, size: stat.size, max: limits.maxFileBytes };
      if (files.length + 1 > limits.maxFiles) return { limit: "files", max: limits.maxFiles };
      total += stat.size;
      if (total > limits.maxTotalBytes) return { limit: "total", max: limits.maxTotalBytes };
      files.push({
        path,
        bytes: new Uint8Array(readFileSync(full)),
        executable: process.platform !== "win32" && (stat.mode & 0o111) !== 0,
      });
    }
    return null;
  };

  const over = walk(root);
  return over
    ? { files: [], skipped: skipped.sort(byPath), over }
    : { files: files.sort(byPath), skipped: skipped.sort(byPath), over: null };
};

/** The folder's own name, for a path given on the command line. */
export const folderName = (dir: string): string => basename(realpathSync(dir));

/**
 * Whose an item is (native-readers.md §2). Export is for what the person wrote, so anything `rmk`
 * installed or rendered, or copied from a registry, is refused with the reason.
 */
export type Ownership =
  | { owner: "local" }
  /** The state file has an entry for this folder, file or key; `edited` when it changed since. */
  | { owner: "installed"; item: string; version: string; edited: boolean; scope: Scope }
  /** Its `ronne.yaml` has a `version`, which only the packer sets. */
  | { owner: "registry_copy"; item: string | null; version: string }
  /** Its Markdown carries rmk's managed marker: something `rmk` wrote, such as a rule as a skill. */
  | { owner: "rendered"; item: string; version: string };

const MARKER = /managed by rmk: (@[a-z0-9-]+\/[a-z0-9-]+)@([^\s>]+)/;

const textOf = (files: readonly PackageFile[], path: string) => {
  const file = files.find((f) => f.path === path);
  return file ? new TextDecoder().decode(file.bytes) : null;
};

/** What an ownership check looks at: a folder or file, or a key of a JSON file. */
export type Place = { path: string; key?: string };

/**
 * The state entry for exactly this place, in either scope's state file: a `dir` or `file` entry
 * for its path, or a `json-key` entry for `mcpServers.<key>` in its file.
 */
const installedEntry = (io: Io, place: Place) => {
  const real = realFolder(place.path) ?? realFile(place.path) ?? place.path;
  for (const scope of ["project", "user"] as const) {
    const { root, state } = places(io, scope);
    for (const candidate of new Set([place.path, real])) {
      const path = relative(root, candidate);
      if (!path || path.startsWith("..") || isAbsolute(path)) continue;
      const entry = readState(state).entries.find((e) =>
        place.key === undefined
          ? (e.kind === "dir" || e.kind === "file") && e.path === toSlashes(path)
          : (e.kind === "json-key" || e.kind === "toml-key") &&
            e.path === toSlashes(path) &&
            Array.isArray(e.key) &&
            e.key.join("\0") === [serversKey(place.path), place.key].join("\0"),
      );
      if (entry) return { root, scope, entry };
    }
  }
  return null;
};

/**
 * Whose the item at `place` is. `files` are what decides it besides the state: a skill's
 * `ronne.yaml` and `SKILL.md`, or a single Markdown file; none for an MCP server.
 */
export const ownershipOf = async (
  io: Io,
  place: Place | string,
  files: readonly PackageFile[],
): Promise<Ownership> => {
  const installed = installedEntry(io, typeof place === "string" ? { path: place } : place);
  if (installed) {
    const { root, scope, entry } = installed;
    return {
      owner: "installed",
      item: entry.item,
      version: entry.version,
      edited: (await diskHash(root, entry)) !== entry.sha256,
      scope,
    };
  }
  const manifest = textOf(files, "ronne.yaml");
  if (manifest !== null) {
    // One that doesn't parse has no version here; the reader refuses it, with its own reason.
    const fields = parseManifest(manifest).manifest ?? {};
    if (fields.version !== undefined && fields.version !== null)
      return {
        owner: "registry_copy",
        item: typeof fields.name === "string" ? fields.name : null,
        version: String(fields.version),
      };
  }
  // A skill's SKILL.md, or the one file of an agent, command or rule (a `#` comment in TOML).
  const markdown =
    textOf(files, "SKILL.md") ??
    (files.length === 1 && files[0] ? textOf(files, files[0].path) : null);
  const marker = MARKER.exec(markdown ?? "");
  if (marker) return { owner: "rendered", item: marker[1] ?? "", version: marker[2] ?? "" };
  return { owner: "local" };
};

/** The files whose ownership depends on them, read alone: no walk, no network. */
const OWNERSHIP_FILES = ["ronne.yaml", "SKILL.md"];

/**
 * Every item in a scope with whose it is (native-readers.md §2), for the MCP server's
 * `list_local_items` (039): what `planExport` would export or refuse, without reading whole folders.
 */
export const describeLocalItems = async (
  io: Io,
  scope: Scope,
): Promise<{ item: LocalItem; ownership: Ownership }[]> => {
  const described: { item: LocalItem; ownership: Ownership }[] = [];
  for (const item of discoverLocalItems(io, scope)) {
    const files: PackageFile[] =
      item.type === "skill"
        ? OWNERSHIP_FILES.flatMap((path) => {
            const full = join(item.path, path);
            return existsSync(full) && statSync(full).isFile()
              ? [{ path, bytes: new Uint8Array(readFileSync(full)) }]
              : [];
          })
        : item.type === "mcp-server"
          ? []
          : [{ path: basename(item.path), bytes: new Uint8Array(readFileSync(item.path)) }];
    described.push({ item, ownership: await ownershipOf(io, item, files) });
  }
  return described;
};

/** What `rmk export` was asked to do; `planExport` turns it into a plan, sending nothing. */
export type ExportRequest = {
  /**
   * Folders with a `SKILL.md`, agent, command or rule files, the names of items in the scope's
   * folders, or items `discoverLocalItems` found.
   */
  items: readonly (string | LocalItem)[];
  /** Only items of this type: for names that more than one type has, and for a file's type. */
  type?: ExportType;
  /** Only items written for this tool (043): for names that more than one tool has. */
  from?: ExportTool;
  /** An MCP server's description, which isn't on disk; for a single item. */
  description?: string;
  /**
   * What to do with the person's own items the exported ones use (041): export them too, or
   * leave them out. Required when there are any; `planExport` stops with `dependencies_required`.
   */
  dependencies?: "include" | "omit";
  /** The marketplace scope, `@team` or `team`. Without it, each folder's `ronne.yaml` must say. */
  to?: string;
  /** The item's name, for a single item. */
  name?: string;
  /** project (the default) or user: where names are looked up. */
  scope?: string;
  /** Export a registry copy as a new item, and an item with a certain secret. */
  force?: boolean;
};

/** A reason to look before uploading; `rmk` lists them in the preview. */
export type ExportWarning = { code: string; message: string; file?: string };

export type PlannedItem = {
  /** Where it is, as shown. */
  local: string;
  /** The folder, file, or JSON file (with `key`) it was read from. */
  path: string;
  key?: string;
  /** `@scope/name`. */
  name: string;
  type: ExportType;
  /** What will be uploaded, `ronne.yaml` included, by path. */
  files: PackageFile[];
  manifestText: string;
  skipped: Skipped[];
  warnings: ExportWarning[];
  /** What 011's checks find in the files: the draft is created with them anyway. */
  issues: ManifestIssue[];
  /** The name is already published: Submit will refuse the draft. */
  published: boolean;
  /** What its manifest declares (041): other planned items at `^1.0.0`, installed ones. */
  dependencies: Record<string, string>;
  /** The planned items it depends on, by name: they're uploaded first. */
  dependsOn: string[];
  /** It's here because another item uses it. */
  asDependency: boolean;
};

export type RefusedItem = { local: string; code: string; message: string };

export type ExportPlan = {
  registry: string;
  to: string | null;
  items: PlannedItem[];
  refused: RefusedItem[];
  /** What the items use, and whose each is (041). */
  findings: Finding[];
  /** Every read file's path, hash and executable bit, and the names: 039 checks it didn't change. */
  fingerprint: string;
};

export type Scopes = { name: string; description: string }[];

/** The registry's scopes (037), every page. */
export const fetchScopes = async (api: ApiClient): Promise<Scopes> => {
  const scopes: Scopes = [];
  let cursor: string | null = null;
  do {
    const page: { scopes: Scopes; nextCursor: string | null } = await api.get(
      `/scopes?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    scopes.push(...page.scopes);
    cursor = page.nextCursor;
  } while (cursor);
  return scopes;
};

/** A thing to export: what it is, where, and how it's shown. */
type Target = {
  local: string;
  type: ExportType;
  tool: SourceTool;
  path: string;
  key?: string;
  name?: string;
};

/**
 * The folder a file is in decides its tool and type (native-readers.md §5–10): `.cursor/rules/`
 * is a Cursor rule, `.claude/agents/` a Claude Code agent. Elsewhere, `type` says what it is, and
 * the extension which tool (`.toml` Codex, `.mdc` Cursor).
 */
const sourceOfFile = (path: string, type?: ExportType): FileSource | null => {
  const slashed = `/${toSlashes(path)}`;
  const inFolder = FILE_SOURCES.find(
    (source) => slashed.includes(`/${source.folder}/`) && (!type || source.type === type),
  );
  if (inFolder) return inFolder;
  if (type !== "agent" && type !== "command" && type !== "rule") return null;
  const tool = path.endsWith(".toml") ? "codex" : path.endsWith(".mdc") ? "cursor" : "claude-code";
  return FILE_SOURCES.find((source) => source.tool === tool && source.type === type) ?? null;
};

/**
 * What to export: items found, folders and files as given, or names looked up among what
 * `discoverLocalItems` finds in the scope, of `type` when it's given. A name more than one item
 * has is ambiguous, and the error lists them.
 */
const resolveItems = (io: Io, request: ExportRequest): Target[] => {
  const scope = scopeOf(request.scope);
  let found: LocalItem[] | null = null;
  const discovered = () => {
    found ??= discoverLocalItems(io, scope);
    return found;
  };
  return request.items.map((arg): Target => {
    if (typeof arg !== "string")
      return {
        local: arg.display,
        type: arg.type,
        tool: arg.tool,
        path: arg.path,
        key: arg.key,
        name: arg.name,
      };
    const path = resolve(io.cwd, arg);
    if (realFolder(path)) {
      if (request.type && request.type !== "skill")
        throw usage(
          `${arg} is a folder, so it's a skill, not ${request.type === "agent" ? "an" : "a"} ${request.type}.`,
        );
      return {
        local: arg,
        type: "skill",
        tool: toSlashes(path).includes("/.claude/") ? "claude-code" : "shared",
        path,
      };
    }
    if (realFile(path)) {
      const source = sourceOfFile(path, request.type);
      if (!source)
        throw usage(
          `Say what ${arg} is with --type agent, command or rule: it isn't in an AI tool's agents, commands or rules folder.`,
        );
      return { local: arg, type: source.type, tool: source.tool, path };
    }
    const matches = discovered().filter(
      (item) =>
        item.name === arg &&
        (!request.type || item.type === request.type) &&
        fromTool(item, request.from),
    );
    if (matches.length === 0)
      throw usage(
        `No ${request.type ?? "item"} called ${arg} here${request.from ? ` for ${request.from}` : ""}. rmk export, with nothing after it, lists what it finds.`,
      );
    if (matches.length > 1)
      throw new RmkError(
        `${arg} is more than one item: ${matches.map((m) => `${m.display} (${m.type}, ${m.tool})`).join(", ")}. Say which with --type or --from, or give the path.`,
        2,
        "ambiguous",
        {
          paths: matches.map((m) => m.display),
          types: matches.map((m) => m.type),
          tools: matches.map((m) => m.tool),
        },
      );
    const [match] = matches as [LocalItem];
    return {
      local: match.display,
      type: match.type,
      tool: match.tool,
      path: match.path,
      key: match.key,
      name: match.name,
    };
  });
};

const pagePath = (registry: string, name: string) => `${registry}${itemPath(name)}`;

/** Why an item isn't the person's to export, or null when it is. */
const ownershipRefusal = (
  registry: string,
  ownership: Ownership,
  force: boolean,
): { code: string; message: string } | null => {
  switch (ownership.owner) {
    case "installed":
      return {
        code: "installed",
        message: `This is ${ownership.item} ${ownership.version}, installed by rmk${
          ownership.edited ? " and edited since" : ""
        }. To change it, use Propose a change on its page: ${pagePath(registry, ownership.item)}`,
      };
    case "rendered":
      return {
        code: "rendered",
        message: `rmk wrote this from ${ownership.item} ${ownership.version}. To change it, use Propose a change on its page: ${pagePath(registry, ownership.item)}`,
      };
    case "registry_copy":
      return force
        ? null
        : {
            code: "registry_copy",
            message: `Its ronne.yaml has version ${ownership.version}, so it's a copy of ${
              ownership.item ?? "an item"
            } from a registry. To change that item, propose a change on its page; to export it as a new item, add --force.`,
          };
    case "local":
      return null;
  }
};

const decoder = new TextDecoder("utf-8", { fatal: true });
/** A file's text, or null for a binary file. */
const textOrNull = (file: PackageFile): string | null => {
  if (file.bytes.includes(0)) return null;
  try {
    return decoder.decode(file.bytes);
  } catch {
    return null;
  }
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The scope the folder's own `ronne.yaml` names, or null. */
const manifestScope = (files: readonly PackageFile[]): string | null => {
  const file = files.find((f) => f.path === "ronne.yaml");
  const name = file ? parseManifest(new TextDecoder().decode(file.bytes)).manifest?.name : null;
  return typeof name === "string" ? (parseItemName(name)?.scope ?? null) : null;
};

const isPublished = async (api: ApiClient, name: string): Promise<boolean> => {
  try {
    await api.get(itemPath(name));
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
};

const overLimitMessage = (over: OverLimit) =>
  over.limit === "file"
    ? `${over.path} is ${formatBytes(over.size)}; a file can be at most ${formatBytes(over.max)}.`
    : over.limit === "files"
      ? `It has more than ${over.max} files, the most an item can have.`
      : `Its files come to more than ${formatBytes(over.max)}, the most an item can have.`;

/**
 * Everything `rmk export` would upload, and why anything is left out, without sending a draft
 * or writing a file: the folders are read, checked for whose they are, turned into items by the
 * reader, checked (011) and scanned for secrets, and each name is looked up in the registry.
 * The scope is `to`, or the folder's own `ronne.yaml`'s; never a default.
 */
/** What `planExport` may ask the person, in a terminal: an MCP server's description. */
export type ExportHooks = { describe?: (local: string) => Promise<string | undefined> };

export const planExport = async (
  io: Io,
  api: ApiClient,
  request: ExportRequest,
  hooks: ExportHooks = {},
): Promise<ExportPlan> => {
  if (request.items.length === 0) throw usage("Say what to export: rmk export <folder|file|name>");
  if (request.name !== undefined && request.items.length > 1)
    throw usage("--name names one item; export the others separately.");
  const scopes = await fetchScopes(api);
  if (scopes.length === 0)
    throw new RmkError(
      `${api.registry} has no scopes yet. Root creates them in the web app, under Admin → Scopes.`,
      1,
      "no_scopes",
    );
  const to = request.to === undefined ? null : normalizeScopeName(request.to);
  const known = new Set(scopes.map((s) => s.name));
  if (to !== null && !known.has(to))
    throw new RmkError(`${api.registry} has no scope @${to}.`, 2, "scope_not_found", { scopes });

  const named = resolveItems(io, request);
  if (request.description !== undefined && named.length > 1)
    throw usage("--description describes one item; export the others separately.");

  // What the items use (041): the person's own items need a decision before anything is planned.
  const found = await findDependencies(io, scopeOf(request.scope), named);
  if (to !== null) await checkPublished(api, to, found);
  const findings = reachable(found, named);
  const theirs = findings.filter((f) => f.status === "yours");
  if (theirs.length > 0 && request.dependencies === undefined)
    throw new RmkError(
      `${theirs.length === 1 ? "An item" : `${theirs.length} items`} of yours ${theirs.length === 1 ? "is" : "are"} used by what you're exporting: ${theirs.map((f) => f.item?.display).join(", ")}. Export them too (recommended) with --with-deps, or without them with --no-deps.`,
      2,
      "dependencies_required",
      { findings },
    );
  const targets: (Target & { asDependency?: boolean })[] = [
    ...named,
    ...(request.dependencies === "include"
      ? theirs.flatMap((f) =>
          f.item
            ? [
                {
                  local: f.item.display,
                  type: f.item.type,
                  tool: f.item.tool,
                  path: f.item.path,
                  key: f.item.key,
                  name: f.item.name,
                  asDependency: true,
                },
              ]
            : [],
        )
      : []),
  ];

  const items: PlannedItem[] = [];
  const refused: RefusedItem[] = [];
  const hash = createHash("sha256");
  for (const target of targets) {
    const { local, type } = target;
    const refuse = (code: string, message: string) => refused.push({ local, code, message });
    const scopeFor = (files: readonly PackageFile[]) => {
      const scope = to ?? (type === "skill" ? manifestScope(files) : null);
      if (scope === null)
        throw new RmkError(
          `Say which scope ${local} goes in, with --to @scope.`,
          2,
          "scope_required",
          { scopes },
        );
      return scope;
    };
    const named = (suggested: string) => {
      const short = request.name ?? suggested;
      return isValidName(short, "item") ? short : null;
    };

    let read: ReadResult;
    let scope: string;
    let skipped: Skipped[] = [];
    try {
      if (type === "skill") {
        const walked = walkItemFolder(target.path);
        hash.update(`\0${realFolder(target.path) ?? target.path}`);
        if (walked.over) {
          refuse(
            "too_large",
            `${overLimitMessage(walked.over)} Remove files, or add it in the web app.`,
          );
          continue;
        }
        for (const file of walked.files)
          hash.update(`\0${file.path}\0${sha256(file.bytes)}\0${file.executable ? 1 : 0}`);
        if (walked.files.length === 0) {
          refuse("empty", "There's nothing to upload in it.");
          continue;
        }
        if (!walked.files.some((file) => file.path === "SKILL.md")) {
          refuse("not_a_skill", "It has no SKILL.md, so it isn't a skill.");
          continue;
        }
        const refusal = ownershipRefusal(
          api.registry,
          await ownershipOf(io, target.path, walked.files),
          request.force ?? false,
        );
        if (refusal) {
          refuse(refusal.code, refusal.message);
          continue;
        }
        scope = scopeFor(walked.files);
        const short = named(skillName(walked.files, folderName(target.path)));
        if (!short) {
          refuse("invalid_name", "Its name can't be an item name. Give one with --name.");
          continue;
        }
        skipped = walked.skipped;
        if (!known.has(scope)) {
          refuse(
            "scope_not_found",
            `Its ronne.yaml names @${scope}, which ${api.registry} doesn't have. Use --to.`,
          );
          continue;
        }
        read = readSkill(walked.files, { itemName: `@${scope}/${short}` });
      } else if (type === "mcp-server") {
        const key = target.key ?? "";
        const value = serversIn(target.path).servers[key];
        hash.update(
          `\0${target.path}\0${key}\0${sha256(new TextEncoder().encode(JSON.stringify(value ?? null)))}`,
        );
        const refusal = ownershipRefusal(api.registry, await ownershipOf(io, target, []), false);
        if (refusal) {
          refuse(refusal.code, refusal.message);
          continue;
        }
        scope = scopeFor([]);
        const short = named(target.name ?? mcpServerName(key));
        if (!short) {
          refuse("invalid_name", "Its name can't be an item name. Give one with --name.");
          continue;
        }
        const description = request.description ?? (await hooks.describe?.(local));
        const reader =
          target.tool === "codex"
            ? readCodexMcpServer
            : target.tool === "cursor"
              ? readCursorMcpServer
              : readMcpServer;
        read = reader(key, value, {
          itemName: `@${scope}/${short}`,
          ...(description ? { description } : {}),
        });
      } else {
        const size = statSync(target.path).size;
        if (size > DEFAULT_LIMITS.maxFileBytes) {
          refuse(
            "too_large",
            `It's ${formatBytes(size)}; a file can be at most ${formatBytes(DEFAULT_LIMITS.maxFileBytes)}.`,
          );
          continue;
        }
        const file: PackageFile = {
          path: basename(target.path),
          bytes: new Uint8Array(readFileSync(target.path)),
        };
        hash.update(`\0${realFile(target.path) ?? target.path}\0${sha256(file.bytes)}`);
        const text = textOrNull(file);
        if (text === null) {
          refuse("not_text", "It isn't UTF-8 text, so it can't be read.");
          continue;
        }
        const toml = target.tool === "codex" ? tomlOf(text) : undefined;
        if (toml === null) {
          refuse("not_toml", "It isn't valid TOML, so Codex can't read it either.");
          continue;
        }
        const refusal = ownershipRefusal(
          api.registry,
          await ownershipOf(io, target.path, [file]),
          false,
        );
        if (refusal) {
          refuse(refusal.code, refusal.message);
          continue;
        }
        scope = scopeFor([file]);
        const source = sourceOfFile(target.path, type) ?? FILE_SOURCES[0];
        const suggested = target.name ?? (source ? suggestedName(source, file, file.path) : "");
        const short = named(suggested);
        if (!short) {
          refuse("invalid_name", "Its name can't be an item name. Give one with --name.");
          continue;
        }
        const itemName = `@${scope}/${short}`;
        if (target.tool === "codex") read = readCodexAgent(toml, { itemName, fileName: file.path });
        else if (target.tool === "cursor")
          read = (
            type === "agent"
              ? readCursorAgent
              : type === "command"
                ? readCursorCommand
                : readCursorRule
          )(file, { itemName });
        else
          read = (type === "agent" ? readAgent : type === "command" ? readCommand : readRule)(
            file,
            {
              itemName,
            },
          );
      }
    } catch (error) {
      if (error instanceof ReadError) {
        refuse(error.code, error.message);
        continue;
      }
      throw error;
    }

    const warnings: ExportWarning[] = [...read.warnings];
    let secret: string | null = null;
    for (const file of read.files) {
      const text = textOrNull(file);
      if (text === null) continue;
      const found = secretLike(text);
      if (found?.certain) secret ??= `${file.path} contains ${found.kind}`;
      else if (found)
        warnings.push({
          code: "possible_secret",
          message: `${file.path} contains what may be ${found.kind}. Check it before uploading.`,
          file: file.path,
        });
      if (process.platform === "win32" && text.startsWith("#!"))
        warnings.push({
          code: "not_executable",
          message: `${file.path} starts with #! but Windows has no executable bit, so it arrives not executable. Set it in the web editor.`,
          file: file.path,
        });
    }
    // An MCP server's credentials are always taken out by its reader: no force puts one back.
    if (secret && (!request.force || type === "mcp-server")) {
      refuse(
        "secret",
        `${secret}. Remove it (use an environment variable instead), or add --force.`,
      );
      continue;
    }

    const name = String(read.manifest.name);
    hash.update(`\0=${name}`);
    items.push({
      local,
      path: target.path,
      ...(target.key !== undefined ? { key: target.key } : {}),
      name,
      type,
      files: read.files,
      manifestText: read.manifestText,
      skipped,
      warnings,
      issues: [],
      published: false,
      dependencies: {},
      dependsOn: [],
      asDependency: target.asDependency === true,
    });
  }

  declareDependencies(items, refused, findings, request.dependencies ?? "omit");
  for (const item of items) {
    const parsed = parseManifest(item.manifestText);
    item.issues = [
      ...parsed.issues.map((issue) => ({ ...issue, file: "ronne.yaml" })),
      ...(parsed.manifest ? checkPackage(parsed.manifest, item.files) : []),
    ];
    item.published = await isPublished(api, item.name);
  }
  return {
    registry: api.registry,
    to,
    items: inUploadOrder(items),
    refused,
    findings,
    fingerprint: hash.digest("hex"),
  };
};

/**
 * The findings still reached from the named items, through items of the person's own that will
 * be exported: once a dependency turns out to be published, what it uses isn't the plan's concern.
 */
const reachable = (findings: readonly Finding[], named: readonly Target[]): Finding[] => {
  const using = new Set(named.map((t) => t.local));
  const kept: Finding[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const finding of findings) {
      if (kept.includes(finding) || !finding.usedBy.some((u) => using.has(u))) continue;
      kept.push(finding);
      grew = true;
      if (finding.status === "yours" && finding.item) using.add(finding.item.display);
    }
  }
  return findings.filter((f) => kept.includes(f));
};

type PublishedItem = {
  type: string;
  tags: Record<string, string>;
  versions: { version: string }[];
};

/**
 * A dependency of the person's own whose name is already published in the scope (041): with the
 * same type it's the registry's item, so the item depends on its latest version and nothing is
 * uploaded (a draft of it would be refused at Submit); with another type, one has to be renamed.
 */
const checkPublished = async (api: ApiClient, scope: string, findings: Finding[]) => {
  for (const finding of findings) {
    if (finding.status !== "yours" || !finding.item) continue;
    const name = `@${scope}/${finding.item.name}`;
    let published: PublishedItem;
    try {
      published = await api.get<PublishedItem>(itemPath(name));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) continue;
      throw error;
    }
    const version = published.tags.latest ?? published.versions[0]?.version;
    if (published.type === finding.item.type && version) {
      finding.status = "published";
      finding.registry = { name, version };
    } else {
      finding.status = "name_taken";
      finding.note = `${name} is already published as ${published.type === "agent" ? "an" : "a"} ${published.type}, so this ${finding.item.type} can't have that name. Rename one of them.`;
    }
  }
};

/**
 * Writes each planned item's `dependencies` from the findings (041): another planned item at
 * `^1.0.0` (a first release is always 1.0.0), an installed one at `^<its version>`. What can't be
 * declared is a warning on the item that uses it.
 */
const declareDependencies = (
  items: PlannedItem[],
  refused: readonly RefusedItem[],
  findings: readonly Finding[],
  choice: "include" | "omit",
) => {
  const planned = (f: Finding) =>
    f.item ? items.find((i) => i.path === f.item?.path && i.key === f.item?.key) : undefined;
  for (const item of items) {
    const warn = (code: string, message: string) => item.warnings.push({ code, message });
    for (const finding of findings.filter((f) => f.usedBy.includes(item.local))) {
      const what = `${finding.reference.kind === "mcp-server" ? "the MCP server" : "the skill"} ${finding.reference.name}`;
      const dependency = planned(finding);
      if (dependency) {
        item.dependencies[dependency.name] = "^1.0.0";
        item.dependsOn.push(dependency.name);
      } else if (finding.status === "installed" && finding.registry)
        item.dependencies[finding.registry.name] = `^${finding.registry.version}`;
      else if (finding.status === "published" && finding.registry) {
        item.dependencies[finding.registry.name] = `^${finding.registry.version}`;
        warn(
          "dependency_published",
          `It uses ${what}; ${finding.registry.name} is already published, so it depends on that at ^${finding.registry.version} and your copy isn't uploaded.`,
        );
      } else if (finding.status === "yours" || finding.status === "selected") {
        const stopped = refused.find((r) => r.local === finding.item?.display);
        warn(
          "dependency_omitted",
          stopped
            ? `It uses ${what}, which can't be exported (${stopped.message}), so it isn't declared.`
            : choice === "omit"
              ? `It uses ${what}, which isn't exported with it, so it may not work where that's missing.`
              : `It uses ${what}, which isn't declared.`,
        );
      } else
        warn("dependency_missing", `It uses ${what}, which can't be declared: ${finding.note}`);
    }
    if (Object.keys(item.dependencies).length > 0) {
      item.manifestText = withDependencies(item.manifestText, item.dependencies);
      const bytes = new TextEncoder().encode(item.manifestText);
      item.files = item.files.map((f) => (f.path === "ronne.yaml" ? { ...f, bytes } : f));
    }
  }
};

/** Dependencies before the items that use them; otherwise in the order they were planned. */
const inUploadOrder = (items: PlannedItem[]): PlannedItem[] => {
  const ordered: PlannedItem[] = [];
  const pending = [...items];
  while (pending.length > 0) {
    const ready = pending.findIndex((item) =>
      item.dependsOn.every((name) => ordered.some((o) => o.name === name)),
    );
    // No cycles can come from export (041), but never loop for ever.
    const [next] = pending.splice(ready === -1 ? 0 : ready, 1);
    if (next) ordered.push(next);
  }
  return ordered;
};

/** A draft the registry created (037). */
export type ExportedItem = {
  local: string;
  name: string;
  type: ExportType;
  id: string;
  /** The draft's page. */
  url: string;
  /** 011's checks on the draft, and what Submit would refuse now, as the registry saw them. */
  issues: ManifestIssue[];
  submitIssues: ManifestIssue[];
  warnings: ExportWarning[];
  skipped: Skipped[];
};

type DraftResponse = {
  id: string;
  path: string;
  url: string | null;
  issues: ManifestIssue[];
  submitIssues: ManifestIssue[];
};

/** A file as 037 takes it: text as `utf8`, anything else as `base64`. */
const uploadFile = (file: PackageFile) => {
  const text = textOrNull(file);
  return {
    path: file.path,
    encoding: text === null ? ("base64" as const) : ("utf8" as const),
    content: text ?? Buffer.from(file.bytes).toString("base64"),
    executable: file.executable ?? false,
  };
};

/** Why an upload was refused, in words that say what to do. */
const uploadMessage = (item: PlannedItem, error: ApiError) =>
  error.status === 413 && !error.code.startsWith("http_")
    ? `${item.local}: ${error.message}`
    : error.status === 413
      ? `${item.local}: the server in front of the registry refused a request this size. Its request body limit needs to be at least 28 MB (see Installing Ronne → With Docker in the registry's Documentation).`
      : `${item.local}: ${error.message}`;

/**
 * Sends a plan: one `POST /drafts` (037) per item, in order. Each draft is private to the person
 * and nothing is submitted. If one fails, the drafts already created are in the error's
 * `details.exported`, so the person knows which exist.
 */
export const uploadExport = async (api: ApiClient, plan: ExportPlan): Promise<ExportedItem[]> => {
  const exported: ExportedItem[] = [];
  const failed: { item: PlannedItem; error: ApiError }[] = [];
  const skipped: PlannedItem[] = [];
  for (const item of plan.items) {
    // An item whose dependency didn't upload would declare a draft that doesn't exist.
    if (
      item.dependsOn.some((name) =>
        [...failed.map((f) => f.item), ...skipped].some((i) => i.name === name),
      )
    ) {
      skipped.push(item);
      continue;
    }
    let draft: DraftResponse;
    try {
      draft = await api.post<DraftResponse>("/drafts", {
        name: item.name,
        type: item.type,
        files: item.files.map(uploadFile),
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      failed.push({ item, error });
      continue;
    }
    exported.push({
      local: item.local,
      name: item.name,
      type: item.type,
      id: draft.id,
      url: draft.url ?? `${api.registry}${draft.path}`,
      issues: draft.issues,
      submitIssues: draft.submitIssues,
      warnings: item.warnings,
      skipped: item.skipped,
    });
  }
  const [first] = failed;
  if (first) {
    const made = exported.map((e) => `${e.name} (${e.url})`).join(", ");
    const notSent = skipped.map((i) => i.name).join(", ");
    throw new RmkError(
      `${failed.map((f) => uploadMessage(f.item, f.error)).join(" ")}${notSent ? ` Not uploaded, since they depend on it: ${notSent}.` : ""}${made ? ` Drafts already created: ${made}.` : ""}`,
      1,
      first.error.code,
      {
        ...first.error.details,
        item: first.item.name,
        exported,
        failed: failed.map((f) => f.item.name),
        notUploaded: skipped.map((i) => i.name),
      },
    );
  }
  return exported;
};
