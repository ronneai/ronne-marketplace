import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RmkError } from "./errors.js";

/**
 * The project's files (cli-files.md): `rmk.config.json` (what was asked for) and `rmk.lock` (what
 * was resolved). JSON with sorted keys and a trailing newline, so diffs stay small.
 */
export type ProjectConfig = {
  version: 1;
  registry?: string;
  targets?: string[];
  /** `@scope/name` → a range or a dist-tag. */
  dependencies: Record<string, string>;
};

export type LockedItem = {
  version: string;
  type: string;
  sha256: string;
  dependencies?: Record<string, string>;
};

export type Lockfile = { version: 1; registry: string; items: Record<string, LockedItem> };

export const CONFIG_FILE = "rmk.config.json";
export const LOCK_FILE = "rmk.lock";

const sortKeys = (_key: string, value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      )
    : value;

/** Every rmk file: sorted keys, two spaces, a trailing newline, written whole through a rename. */
/**
 * Writes a whole file through a new temporary file and a rename, which replaces a link at `path`
 * rather than writing where it points. The temporary file has a random name and is created
 * exclusively (`wx`), so a link a repository commits at a guessable name is never written through
 * (security audit ITEM-1, 2026-10-05).
 */
export const writeFileAtomic = (path: string, content: Uint8Array | string, mode = 0o644) => {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, content, { mode, flag: "wx" });
  renameSync(temp, path);
};

export const writeJsonFile = (path: string, value: unknown) =>
  writeFileAtomic(path, `${JSON.stringify(value, sortKeys, 2)}\n`);

const readJson = <T>(path: string, what: string): T | null => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new RmkError(
      `${what} (${path}) isn't valid JSON: ${(error as Error).message}`,
      1,
      "bad_file",
    );
  }
};

export const readProjectConfig = (dir: string): ProjectConfig | null => {
  const raw = readJson<Partial<ProjectConfig>>(join(dir, CONFIG_FILE), "The project config");
  if (!raw) return null;
  return {
    version: 1,
    registry: typeof raw.registry === "string" ? raw.registry : undefined,
    targets: Array.isArray(raw.targets) ? raw.targets.map(String) : undefined,
    dependencies:
      raw.dependencies && typeof raw.dependencies === "object" ? { ...raw.dependencies } : {},
  };
};

export const writeProjectConfig = (dir: string, config: ProjectConfig) => {
  const value: Record<string, unknown> = { version: 1, dependencies: config.dependencies };
  if (config.registry) value.registry = config.registry;
  if (config.targets) value.targets = config.targets;
  writeJsonFile(join(dir, CONFIG_FILE), value);
};

export type LockfileWithDependencies = Lockfile & { dependencies?: Record<string, string> };

/** `rmk.lock`, or user scope's `user.lock`, which also carries the direct dependencies. */
export const readLockfile = (dir: string, file = LOCK_FILE): LockfileWithDependencies | null => {
  const raw = readJson<Partial<LockfileWithDependencies>>(join(dir, file), "The lockfile");
  if (!raw) return null;
  if (typeof raw.registry !== "string" || !raw.items || typeof raw.items !== "object")
    throw new RmkError(
      `The lockfile (${join(dir, file)}) doesn't have the shape rmk writes.`,
      1,
      "bad_file",
    );
  return {
    version: 1,
    registry: raw.registry,
    items: { ...raw.items },
    ...(raw.dependencies ? { dependencies: raw.dependencies } : {}),
  };
};

export const writeLockfile = (dir: string, lock: LockfileWithDependencies, file = LOCK_FILE) =>
  writeJsonFile(join(dir, file), lock);

/** `@scope/name` and an optional `@version` or `@tag` after it. */
export const splitItemRef = (ref: string): { name: string; at?: string } => {
  const at = ref.indexOf("@", 1);
  return at === -1 ? { name: ref } : { name: ref.slice(0, at), at: ref.slice(at + 1) };
};
