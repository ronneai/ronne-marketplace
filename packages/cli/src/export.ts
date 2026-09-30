import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { DEFAULT_LIMITS, type PackageFile, type PackageLimits } from "@ronneai/core";
import { places, type Scope } from "./install.js";
import type { Io } from "./io.js";

/**
 * `rmk export` (feature 038): what a person wrote in their AI tool, sent to the registry as a
 * draft. This file finds the items and reads their folders; the reader in `@ronneai/core/read`
 * turns the files into an item. Nothing here writes to the project.
 */

/** Where skills live, relative to the project or the home folder (native-readers.md §4). */
export const SKILL_FOLDERS = [".claude/skills", ".agents/skills"] as const;

/** An item found on disk. */
export type LocalItem = {
  type: "skill";
  /** The folder's name, which `rmk export <name>` matches. */
  name: string;
  /** The folder, as found (it may be a link). */
  dir: string;
  /** The folder, as shown: relative to the scope's root, with `/`. */
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
      found.push({ type: "skill", name, dir, display: toSlashes(relative(root, dir)), scope });
    }
  }
  return found.sort((a, b) =>
    a.name === b.name ? (a.display < b.display ? -1 : 1) : a.name < b.name ? -1 : 1,
  );
};

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
