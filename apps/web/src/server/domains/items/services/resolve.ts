import {
  bothRanges,
  canonicalItemName,
  parseItemName,
  type RegistryReader,
  type Resolution,
  ResolveError,
  type ResolveRequest,
  resolve,
} from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { ItemRepository } from "../repositories/item-repository";
import type { VersionActor, VersionDeps } from "./versions";

/**
 * Resolving on the server (feature 020): core's `resolve()` over the published items, for
 * `POST /api/v1/resolve`. Everyone signed in may resolve what they may read.
 */
export const databaseRegistry = (items: ItemRepository): RegistryReader => ({
  item: async (name) => {
    const parsed = parseItemName(name);
    const item = parsed ? await items.findByName(parsed) : null;
    if (!item) return null;
    const versions = await items.versions(item.id);
    if (versions.length === 0) return null;
    const versionOf = new Map(versions.map((v) => [v.id, v.version]));
    return {
      type: item.type,
      tags: Object.fromEntries(
        (await items.tags(item.id)).map((t) => [t.tag, versionOf.get(t.versionId) ?? ""]),
      ),
      versions: versions.map((v) => ({
        version: v.version,
        sha256: v.sha256,
        yanked: v.yankedAt !== null,
        deprecated: v.deprecatedMessage,
        dependencies: v.dependencies,
      })),
    };
  },
});

/**
 * A resolution, and the old names of what it resolved (118): old name → name now, so `rmk` moves
 * its lockfile to the new names, and reads an old version's dependencies by them. Empty when no
 * resolved item ever had another name.
 */
export type ServerResolution = Resolution & { renamed: Record<string, string> };

export const resolveRequest = async (
  deps: VersionDeps,
  actor: VersionActor,
  request: ResolveRequest,
): Promise<ServerResolution> => {
  requirePermission(actor.user, "account.manage_own");
  // Old names first become the names the items have now, as the caller sees them (118), so one
  // item asked for by two names is one item, and the resolution speaks only new names.
  const renamed: Record<string, string> = {};
  const current = async (name: string) => {
    const ref = parseItemName(name);
    const item = ref ? await deps.items.findByName(ref) : null;
    const written = canonicalItemName(name) ?? name;
    if (item && item.fullName !== written) renamed[name] = item.fullName;
    return item?.fullName ?? written;
  };
  // One item asked for by two names gets both ranges: semver reads "^1.0.0 ^1.2.0" as both. A
  // tag can't be combined, so a tag and anything else for one item is a conflict.
  const dependencies: Record<string, string> = {};
  const askedAs: Record<string, string> = {};
  for (const [name, range] of Object.entries(request.dependencies)) {
    const key = await current(name);
    const before = dependencies[key];
    const both = before === undefined ? null : bothRanges(before, range);
    if (before === undefined || before === range) dependencies[key] = range;
    else if (both !== null) dependencies[key] = both;
    else
      throw new ResolveError(
        "resolve_conflict",
        `${askedAs[key]} and ${name} are the same item, ${key}, asked for as ${before} and ${range}.`,
        { item: key },
      );
    askedAs[key] ??= name;
  }
  // A lockfile pin is only a preference: two different pins for one item keep neither.
  const locked: Record<string, string> = {};
  const unpinned = new Set<string>();
  for (const [name, version] of Object.entries(request.locked ?? {})) {
    const key = await current(name);
    if (locked[key] !== undefined && locked[key] !== version) unpinned.add(key);
    locked[key] = version;
  }
  for (const key of unpinned) delete locked[key];
  const resolution = await resolve({ dependencies, locked }, databaseRegistry(deps.items));
  // Every old name of what was resolved (118), not only the ones asked for: an old version's own
  // `ronne.yaml` may still name its dependencies by them, and `rmk` matches those to the new names.
  const ids = new Map<string, string>();
  for (const name of Object.keys(resolution.items)) {
    const ref = parseItemName(name);
    const item = ref ? await deps.items.findByName(ref) : null;
    if (item) ids.set(item.id, item.fullName);
  }
  for (const [old, id] of await deps.items.oldNames([...ids.keys()])) {
    const now = ids.get(id);
    if (now) renamed[old] = now;
  }
  return { ...resolution, renamed };
};
