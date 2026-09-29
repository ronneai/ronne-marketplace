import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isVersionRange } from "@ronneai/core";
import type { ApiClient } from "./api.js";
import { diskHash } from "./apply.js";
import { RmkError, usage } from "./errors.js";
import {
  chooseTargets,
  commitInstall,
  type Prepared,
  places,
  prepareInstall,
  scopeOf,
} from "./install.js";
import type { Io } from "./io.js";
import { output } from "./output.js";
import {
  CONFIG_FILE,
  type LockfileWithDependencies,
  type ProjectConfig,
  readLockfile,
  readProjectConfig,
  splitItemRef,
  writeProjectConfig,
} from "./project.js";

/**
 * `rmk install`, `update` and `remove` as two steps (feature 027): `planOperation` works out
 * everything and writes nothing; `applyOperation` writes exactly that. The commands run both; the
 * MCP server shows the plan first and applies it once the person approves.
 */
export type OperationKind = "install" | "update" | "remove";

export type OperationRequest = {
  kind: OperationKind;
  /** Item refs: `@scope/name[@tag|range]` to install, names to update or remove. */
  items: string[];
  /** `claude-code,codex`, `all`, or none for the config's targets or what the project looks like. */
  target?: string;
  scope?: string;
  /** Asked for on the command line, so the lockfile may be for another registry. */
  registryGiven?: boolean;
  force?: boolean;
};

export type Operation = Prepared & {
  kind: OperationKind;
  /** The project config to write after the install, or null (user scope, or nothing to change). */
  config: ProjectConfig | null;
  /** What each item was locked at before, for `update`'s report and `remove`'s. */
  lockedBefore: Record<string, string>;
};

/** What the project asks for and has, in a scope. */
export const projectState = (io: Io, scopeValue?: string) => {
  const scope = scopeOf(scopeValue);
  const { lock } = places(io, scope);
  const config = scope === "project" ? readProjectConfig(io.cwd) : null;
  const lockfile = readLockfile(dirname(lock), basename(lock)) as LockfileWithDependencies | null;
  const dependencies =
    scope === "project" ? (config?.dependencies ?? {}) : (lockfile?.dependencies ?? {});
  const locked = Object.fromEntries(
    Object.entries(lockfile?.items ?? {}).map(([name, item]) => [name, item.version]),
  );
  return { scope, lock, config, lockfile, dependencies, locked };
};

export const planOperation = async (
  io: Io,
  api: ApiClient,
  request: OperationRequest,
): Promise<Operation> => {
  const { scope, lock, config, lockfile, dependencies, locked } = projectState(io, request.scope);
  const targets = await chooseTargets(io, request.target, config?.targets, output(false));
  const force = request.force === true;
  const prepare = (deps: Record<string, string>, keep: Record<string, string>) =>
    prepareInstall(io, api, { dependencies: deps, locked: keep, targets, scope, force });
  const nextConfig = (deps: Record<string, string>, setTargets: boolean): ProjectConfig | null => {
    if (scope !== "project") return null;
    const next: ProjectConfig = config
      ? { ...config, dependencies: deps }
      : { version: 1, dependencies: deps };
    if (setTargets && !next.targets) next.targets = targets.map((t) => t.id);
    return next;
  };

  if (request.kind === "install") {
    if (lockfile && lockfile.registry !== api.registry && !request.registryGiven)
      throw new RmkError(
        `${lock} is for ${lockfile.registry}, not ${api.registry}. Use --registry ${lockfile.registry}, or remove the lockfile.`,
        1,
        "lock_registry",
      );
    const next = { ...dependencies };
    for (const ref of request.items) {
      const { name, at } = splitItemRef(ref);
      if (!/^@[^/]+\/[^/@]+$/.test(name))
        throw usage(`${ref} isn't an item: use @scope/name, with @tag or @range after it.`);
      if (at && !isVersionRange(at) && !/^[a-z][a-z0-9-]{0,31}$/.test(at))
        throw usage(`${at} is neither a version range nor a tag.`);
      next[name] = at ?? "latest";
    }
    // With nothing asked for, a lockfile installs exactly what it holds.
    const prepared = await prepare(next, locked);
    const setTargets = Boolean(request.target && request.target !== "all");
    return {
      ...prepared,
      kind: "install",
      config: nextConfig(next, setTargets),
      lockedBefore: locked,
    };
  }

  if (request.kind === "update") {
    if (Object.keys(dependencies).length === 0)
      throw usage("Nothing to update: this project asks for nothing yet.");
    const names = request.items.map((ref) => splitItemRef(ref).name);
    for (const name of names)
      if (!(name in dependencies)) throw usage(`${name} isn't in this project's dependencies.`);
    const kept = names.length
      ? Object.fromEntries(Object.entries(locked).filter(([name]) => !names.includes(name)))
      : {};
    const prepared = await prepare(dependencies, kept);
    return { ...prepared, kind: "update", config: null, lockedBefore: locked };
  }

  if (request.items.length === 0) throw usage("Say what to remove: rmk remove @scope/name");
  const remaining = { ...dependencies };
  for (const ref of request.items) {
    const { name } = splitItemRef(ref);
    if (!(name in remaining))
      throw usage(`${name} isn't in this project's dependencies; rmk list shows them.`);
    delete remaining[name];
  }
  const prepared = await prepare(remaining, locked);
  return {
    ...prepared,
    kind: "remove",
    config: config ? nextConfig(remaining, false) : null,
    lockedBefore: locked,
  };
};

/** Writes a planned operation with no conflicts: its files, state, lockfile and project config. */
export const applyOperation = (io: Io, operation: Operation) => {
  commitInstall(io, operation);
  if (operation.config) writeProjectConfig(io.cwd, operation.config);
};

/** The items an update moved: from the version locked before to the one resolved now. */
export const movedItems = (operation: Operation) =>
  Object.entries(operation.resolution.items)
    .filter(([name, item]) => operation.lockedBefore[name] !== item.version)
    .map(([name, item]) => ({
      item: name,
      from: operation.lockedBefore[name] ?? null,
      to: item.version,
    }));

/** The items a removal took away, including what nothing else needs any more. */
export const removedItems = (operation: Operation) =>
  Object.keys(operation.lockedBefore)
    .filter((name) => !(name in operation.resolution.items))
    .sort();

const fileText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

/**
 * What an operation's plan depends on, as one hash: the lockfile, the state file, the project
 * config, and every file and folder it writes, removes or keeps. If any changes before the plan is
 * applied, the plan is stale (027): another client, or the person, got there first.
 */
export const operationFingerprint = async (io: Io, operation: Operation): Promise<string> => {
  const { root, lock, state } = places(io, operation.scope);
  const hash = createHash("sha256");
  hash.update(fileText(lock)).update("\0").update(fileText(state)).update("\0");
  if (operation.scope === "project") hash.update(fileText(join(io.cwd, CONFIG_FILE)));
  const entries = [
    ...operation.plan.writes.map((w) => w.entry),
    ...operation.plan.removes,
    ...operation.plan.unchanged,
  ];
  const paths = new Map<string, { kind: "file" | "dir"; path: string }>();
  for (const entry of entries)
    paths.set(entry.path, { kind: entry.kind === "dir" ? "dir" : "file", path: entry.path });
  for (const [path, place] of [...paths].sort(([a], [b]) => (a < b ? -1 : 1)))
    hash.update(`\0${path}\0${(await diskHash(root, place)) ?? "-"}`);
  return hash.digest("hex");
};
