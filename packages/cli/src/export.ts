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
  commandName,
  mcpServerName,
  ReadError,
  type ReadResult,
  readSkill,
  ruleName,
  skillName,
} from "@ronneai/core/read";
import { type ApiClient, ApiError } from "./api.js";
import { diskHash, readState } from "./apply.js";
import { RmkError, usage } from "./errors.js";
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

/** An item found on disk. */
export type LocalItem = {
  type: ExportType;
  /** The item's short name, which `rmk export <name>` matches. */
  name: string;
  /**
   * Where it is, as found (it may be a link): a skill's folder, an agent's, command's or rule's
   * file, or the JSON file an MCP server is a key of.
   */
  path: string;
  /** An MCP server's key under `mcpServers`. */
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

/** Where Claude Code keeps agents, commands and rules, read recursively (native-readers.md §5–7). */
const MARKDOWN_FOLDERS = {
  agent: ".claude/agents",
  command: ".claude/commands",
  rule: ".claude/rules",
} as const;

const markdownFiles = (dir: string, under = ""): string[] => {
  if (!realFolder(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      const path = under ? `${under}/${entry}` : entry;
      if (realFolder(full)) return markdownFiles(full, path);
      return entry.endsWith(".md") && realFile(full) ? [path] : [];
    });
};

/** The agents, commands or rules in a scope, named as the readers name them. */
const findMarkdown = (io: Io, scope: Scope, type: keyof typeof MARKDOWN_FOLDERS): LocalItem[] => {
  const { root } = places(io, scope);
  const folder = join(root, MARKDOWN_FOLDERS[type]);
  return markdownFiles(folder).map((under) => {
    const path = join(folder, under);
    const name =
      type === "agent"
        ? agentName({ path: under, bytes: new Uint8Array(readFileSync(path)) }, basename(under))
        : type === "command"
          ? commandName(under)
          : ruleName(under);
    return { type, name, path, display: toSlashes(relative(root, path)), scope };
  });
};

/** Where MCP servers are: the project's `.mcp.json`, or `~/.claude.json`'s top level for user scope. */
const mcpConfigPath = (io: Io, scope: Scope) =>
  scope === "project" ? join(io.cwd, ".mcp.json") : join(io.home, ".claude.json");

/** The `mcpServers` of a scope's config, or the reason it can't be read. */
export const readMcpServers = (
  io: Io,
  scope: Scope,
): { path: string; servers: Record<string, unknown>; problem: string | null } => {
  const path = mcpConfigPath(io, scope);
  if (!realFile(path)) return { path, servers: {}, problem: null };
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: unknown };
    const servers = json?.mcpServers;
    return {
      path,
      servers:
        servers && typeof servers === "object" && !Array.isArray(servers)
          ? (servers as Record<string, unknown>)
          : {},
      problem: null,
    };
  } catch (error) {
    return {
      path,
      servers: {},
      problem: `${basename(path)} isn't valid JSON (${(error as Error).message}), so its MCP servers can't be read.`,
    };
  }
};

/** The MCP servers in a scope, less the one `rmk mcp-setup` registered, which is never an item. */
const findMcpServers = (io: Io, scope: Scope): LocalItem[] => {
  const { root, state } = places(io, scope);
  const { path, servers } = readMcpServers(io, scope);
  const file = toSlashes(relative(root, path));
  const setup = new Set(
    readState(state)
      .entries.filter((e) => e.item === MCP_SETUP_ITEM && e.kind === "json-key")
      .map((e) => (Array.isArray(e.key) ? e.key.at(-1) : undefined)),
  );
  return Object.keys(servers)
    .filter((key) => key !== SERVER_NAME && !setup.has(key))
    .sort()
    .map((key) => ({
      type: "mcp-server" as const,
      name: mcpServerName(key),
      path,
      key,
      display: `${file} (mcpServers.${key})`,
      scope,
    }));
};

/** Every item `rmk export` can find in a scope, by name then type then place (038, 040). */
export const discoverLocalItems = (io: Io, scope: Scope): LocalItem[] =>
  [
    ...findSkills(io, scope),
    ...findMarkdown(io, scope, "agent"),
    ...findMarkdown(io, scope, "command"),
    ...findMarkdown(io, scope, "rule"),
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
          : e.kind === "json-key" &&
            e.path === toSlashes(path) &&
            Array.isArray(e.key) &&
            e.key.join("\0") === ["mcpServers", place.key].join("\0"),
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
  const markdown =
    textOf(files, "SKILL.md") ??
    (files.length === 1 && files[0]?.path.endsWith(".md") ? textOf(files, files[0].path) : null);
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
  /** Folders with a `SKILL.md`, or the names of skills in the scope's folders. */
  items: readonly string[];
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
  /** The folder, as shown. */
  local: string;
  dir: string;
  /** `@scope/name`. */
  name: string;
  type: "skill";
  /** What will be uploaded, `ronne.yaml` included, by path. */
  files: PackageFile[];
  manifestText: string;
  skipped: Skipped[];
  warnings: ExportWarning[];
  /** What 011's checks find in the files: the draft is created with them anyway. */
  issues: ManifestIssue[];
  /** The name is already published: Submit will refuse the draft. */
  published: boolean;
};

export type RefusedItem = { local: string; code: string; message: string };

export type ExportPlan = {
  registry: string;
  to: string | null;
  items: PlannedItem[];
  refused: RefusedItem[];
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

/** The folders to export: paths as given, or names looked up in the scope's skill folders. */
const resolveItems = (io: Io, request: ExportRequest) => {
  const scope = scopeOf(request.scope);
  const found = findSkills(io, scope);
  return request.items.map((arg) => {
    const path = resolve(io.cwd, arg);
    if (realFolder(path)) return { local: arg, dir: path };
    const matches = found.filter((item) => item.name === arg);
    if (matches.length === 0)
      throw usage(
        `No skill folder or skill called ${arg}. rmk export, with nothing after it, lists the skills here.`,
      );
    if (matches.length > 1)
      throw new RmkError(
        `${arg} is in more than one place: ${matches.map((m) => m.display).join(", ")}. Give the folder instead.`,
        2,
        "ambiguous",
        { paths: matches.map((m) => m.display) },
      );
    const [match] = matches as [LocalItem];
    return { local: match.display, dir: match.path };
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
export const planExport = async (
  io: Io,
  api: ApiClient,
  request: ExportRequest,
): Promise<ExportPlan> => {
  if (request.items.length === 0)
    throw usage("Say which skills to export: rmk export <folder|name>");
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

  const items: PlannedItem[] = [];
  const refused: RefusedItem[] = [];
  const hash = createHash("sha256");
  for (const { local, dir } of resolveItems(io, request)) {
    const refuse = (code: string, message: string) => refused.push({ local, code, message });
    const walked = walkItemFolder(dir);
    hash.update(`\0${realFolder(dir) ?? dir}`);
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
      await ownershipOf(io, dir, walked.files),
      request.force ?? false,
    );
    if (refusal) {
      refuse(refusal.code, refusal.message);
      continue;
    }

    const scope = to ?? manifestScope(walked.files);
    if (scope === null)
      throw new RmkError(
        `Say which scope ${local} goes in, with --to @scope.`,
        2,
        "scope_required",
        { scopes },
      );
    if (!known.has(scope)) {
      refuse(
        "scope_not_found",
        `Its ronne.yaml names @${scope}, which ${api.registry} doesn't have. Use --to.`,
      );
      continue;
    }
    const short = request.name ?? skillName(walked.files, folderName(dir));
    if (!isValidName(short, "item")) {
      refuse("invalid_name", `${short || "Its name"} can't be an item name. Give one with --name.`);
      continue;
    }

    let read: ReadResult;
    try {
      read = readSkill(walked.files, { itemName: `@${scope}/${short}` });
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
    if (secret && !request.force) {
      refuse(
        "secret",
        `${secret}. Remove it (use an environment variable instead), or add --force.`,
      );
      continue;
    }

    const parsed = parseManifest(read.manifestText);
    const issues = [
      ...parsed.issues.map((issue) => ({ ...issue, file: "ronne.yaml" })),
      ...(parsed.manifest ? checkPackage(parsed.manifest, read.files) : []),
    ];
    const name = `@${scope}/${short}`;
    hash.update(`\0=${name}`);
    items.push({
      local,
      dir,
      name,
      type: "skill",
      files: read.files,
      manifestText: read.manifestText,
      skipped: walked.skipped,
      warnings,
      issues,
      published: await isPublished(api, name),
    });
  }
  return { registry: api.registry, to, items, refused, fingerprint: hash.digest("hex") };
};

/** A draft the registry created (037). */
export type ExportedItem = {
  local: string;
  name: string;
  type: "skill";
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
  for (const item of plan.items) {
    let draft: DraftResponse;
    try {
      draft = await api.post<DraftResponse>("/drafts", {
        name: item.name,
        type: item.type,
        files: item.files.map(uploadFile),
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const made = exported.map((e) => `${e.name} (${e.url})`).join(", ");
      throw new RmkError(
        `${uploadMessage(item, error)}${made ? ` Drafts already created: ${made}.` : ""}`,
        1,
        error.code,
        { ...error.details, item: item.name, exported },
      );
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
  return exported;
};
