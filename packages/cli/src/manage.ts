import type { Resolution } from "@ronneai/core";
import type { ApiClient } from "./api.js";
import { usage } from "./errors.js";
import { report } from "./install.js";
import type { Io } from "./io.js";
import {
  applyOperation,
  movedItems,
  planOperation,
  projectState,
  removedItems,
} from "./operations.js";
import type { Output } from "./output.js";
import { itemPath } from "./registry-commands.js";
import { addUsageHooks } from "./usage-hooks.js";

/** Keeping a project's items current (feature 022): `update`, `outdated`, `remove`. */
type Args = {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
};

const str = (value: string | boolean | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

const request = (args: Args) => ({
  items: args.positionals,
  target: str(args.values.target),
  scope: str(args.values.scope),
  force: args.values.force === true,
});

/** `rmk update [<item>...]`: re-resolves within the ranges, without locks for the named items (or all). */
export const updateCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const operation = await planOperation(io, api, { kind: "update", ...request(args) });
  if (operation.plan.conflicts.length === 0) applyOperation(io, operation);
  const moved = movedItems(operation);
  out.set("updated", moved);
  if (moved.length === 0) out.say("Everything is already at the newest version its range allows.");
  for (const m of moved) out.say(`${m.item}: ${m.from ?? "(new)"} → ${m.to}`);
  report(out, operation, io);
  for (const line of await addUsageHooks(io, operation)) out.say(`Note: ${line}`);
};

export type Outdated = {
  item: string;
  /** The item's name now, when the project still uses an old one (118); `rmk update` moves it. */
  now?: string;
  range: string;
  locked: string | null;
  wanted: string | null;
  latest: string | null;
};

/** For each direct dependency: what's locked, what its range would take now, and the newest overall. */
export const outdatedItems = async (
  io: Io,
  api: ApiClient,
  scope?: string,
): Promise<Outdated[]> => {
  const { dependencies, locked } = projectState(io, scope);
  const names = Object.keys(dependencies).sort();
  if (names.length === 0) throw usage("This project asks for nothing yet.");
  const fresh = await api.post<Resolution & { renamed?: Record<string, string> }>("/resolve", {
    dependencies,
    locked: {},
  });
  const rows: Outdated[] = [];
  for (const name of names) {
    // Under its name now (118), if the project still uses an old one.
    const now = fresh.renamed?.[name] ?? name;
    const info = await api.get<{
      tags: Record<string, string>;
      versions: { version: string; yanked: boolean }[];
    }>(itemPath(now));
    const latest = info.tags.latest ?? info.versions.find((v) => !v.yanked)?.version ?? null;
    rows.push({
      item: name,
      ...(now !== name ? { now } : {}),
      range: dependencies[name] ?? "",
      locked: locked[name] ?? null,
      wanted: fresh.items[now]?.version ?? null,
      latest,
    });
  }
  return rows;
};

/** Whether a row is behind: locked below what its range takes, or its range below the newest. */
export const isBehind = (r: Outdated) => r.locked !== r.wanted || r.wanted !== r.latest;

/** `rmk outdated`. */
export const outdatedCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const rows = await outdatedItems(io, api, str(args.values.scope));
  out.set("items", rows);
  if (!rows.some(isBehind)) out.say("Everything is up to date.");
  else {
    out.say("item  range  locked  wanted  latest");
    for (const r of rows)
      out.say(`${r.item}  ${r.range}  ${r.locked ?? "-"}  ${r.wanted ?? "-"}  ${r.latest ?? "-"}`);
    out.say(
      "wanted: the newest version the range allows (rmk update); latest: the newest published.",
    );
  }
  for (const r of rows)
    if (r.now)
      out.say(`Note: ${r.item} is now ${r.now}; rmk update moves this project to the new name.`);
};

/** `rmk remove <item>...`: drops the items, and whatever nothing else needs any more. */
export const removeCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const operation = await planOperation(io, api, { kind: "remove", ...request(args) });
  if (operation.plan.conflicts.length === 0) applyOperation(io, operation);
  const gone = removedItems(operation);
  out.set("removedItems", gone);
  out.say(gone.length ? `Removed ${gone.join(", ")}.` : "Nothing else needed removing.");
  report(out, operation, io);
};
