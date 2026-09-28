import { basename, dirname } from "node:path";
import type { Resolution } from "@ronneai/core";
import type { ApiClient } from "./api.js";
import { usage } from "./errors.js";
import { chooseTargets, installResolved, places, report, scopeOf } from "./install.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { readLockfile, readProjectConfig, splitItemRef, writeProjectConfig } from "./project.js";
import { itemPath } from "./registry-commands.js";

/** Keeping a project's items current (feature 022): `update`, `outdated`, `remove`. */
type Args = { positionals: string[]; values: Record<string, string | boolean | undefined> };

const str = (value: string | boolean | undefined) =>
  typeof value === "string" ? value : undefined;

/** What the project asks for and has, in the given scope. */
const state = (io: Io, args: Args) => {
  const scope = scopeOf(str(args.values.scope));
  const { lock } = places(io, scope);
  const config = scope === "project" ? readProjectConfig(io.cwd) : null;
  const lockfile = readLockfile(dirname(lock), basename(lock));
  const dependencies =
    scope === "project" ? (config?.dependencies ?? {}) : (lockfile?.dependencies ?? {});
  const locked = Object.fromEntries(
    Object.entries(lockfile?.items ?? {}).map(([name, item]) => [name, item.version]),
  );
  return { scope, config, lockfile, dependencies, locked };
};

/** `rmk update [<item>...]`: re-resolves within the ranges, without locks for the named items (or all). */
export const updateCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const { scope, config, dependencies, locked } = state(io, args);
  if (Object.keys(dependencies).length === 0)
    throw usage("Nothing to update: this project asks for nothing yet.");
  const names = args.positionals.map((ref) => splitItemRef(ref).name);
  for (const name of names)
    if (!(name in dependencies)) throw usage(`${name} isn't in this project's dependencies.`);
  const kept = names.length
    ? Object.fromEntries(Object.entries(locked).filter(([name]) => !names.includes(name)))
    : {};
  const targets = await chooseTargets(io, str(args.values.target), config?.targets, out);
  const result = await installResolved(io, api, {
    dependencies,
    locked: kept,
    targets,
    scope,
    force: args.values.force === true,
  });
  const moved = Object.entries(result.resolution.items)
    .filter(([name, item]) => locked[name] !== item.version)
    .map(([name, item]) => ({ item: name, from: locked[name] ?? null, to: item.version }));
  out.set("updated", moved);
  if (moved.length === 0) out.say("Everything is already at the newest version its range allows.");
  for (const m of moved) out.say(`${m.item}: ${m.from ?? "(new)"} → ${m.to}`);
  report(out, result, io);
};

type Outdated = {
  item: string;
  range: string;
  locked: string | null;
  wanted: string | null;
  latest: string | null;
};

/** `rmk outdated`: for each direct dependency, what's locked, what its range would take now, and the newest overall. */
export const outdatedCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const { dependencies, locked } = state(io, args);
  const names = Object.keys(dependencies).sort();
  if (names.length === 0) throw usage("This project asks for nothing yet.");
  const fresh = await api.post<Resolution>("/resolve", { dependencies, locked: {} });
  const rows: Outdated[] = [];
  for (const name of names) {
    const info = await api.get<{
      tags: Record<string, string>;
      versions: { version: string; yanked: boolean }[];
    }>(itemPath(name));
    const latest = info.tags.latest ?? info.versions.find((v) => !v.yanked)?.version ?? null;
    rows.push({
      item: name,
      range: dependencies[name] ?? "",
      locked: locked[name] ?? null,
      wanted: fresh.items[name]?.version ?? null,
      latest,
    });
  }
  out.set("items", rows);
  const behind = rows.filter((r) => r.locked !== r.wanted || r.wanted !== r.latest);
  if (behind.length === 0) out.say("Everything is up to date.");
  else {
    out.say("item  range  locked  wanted  latest");
    for (const r of rows)
      out.say(`${r.item}  ${r.range}  ${r.locked ?? "-"}  ${r.wanted ?? "-"}  ${r.latest ?? "-"}`);
    out.say(
      "wanted: the newest version the range allows (rmk update); latest: the newest published.",
    );
  }
};

/** `rmk remove <item>...`: drops the items, and whatever nothing else needs any more. */
export const removeCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const { scope, config, dependencies, locked } = state(io, args);
  if (args.positionals.length === 0) throw usage("Say what to remove: rmk remove @scope/name");
  const remaining = { ...dependencies };
  for (const ref of args.positionals) {
    const { name } = splitItemRef(ref);
    if (!(name in remaining))
      throw usage(`${name} isn't in this project's dependencies; rmk list shows them.`);
    delete remaining[name];
  }
  const targets = await chooseTargets(io, str(args.values.target), config?.targets, out);
  const result = await installResolved(io, api, {
    dependencies: remaining,
    locked,
    targets,
    scope,
    force: args.values.force === true,
  });
  if (scope === "project" && result.plan.conflicts.length === 0 && config) {
    config.dependencies = remaining;
    writeProjectConfig(io.cwd, config);
  }
  const gone = Object.keys(locked)
    .filter((name) => !(name in result.resolution.items))
    .sort();
  out.set("removedItems", gone);
  out.say(gone.length ? `Removed ${gone.join(", ")}.` : "Nothing else needed removing.");
  report(out, result, io);
};
