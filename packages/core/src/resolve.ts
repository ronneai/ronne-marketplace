import { lt, rsort, satisfies, valid, validRange } from "semver";
import type { ItemType } from "./item-types.js";

/**
 * The resolver (feature 020, MVP §4.3): which version of every item an install gets. One version
 * per item, the highest non-yanked one that fits every range asking for it; a version a lockfile
 * pins is kept while it still fits, even if yanked. When the newest versions conflict, it falls
 * back to older ones in range (#141): it sets aside a version whose dependencies asked for a range
 * that lost, and tries again, so an install fails only when no choice within the ranges works.
 * Deterministic, and with no network or database code of its own: `rmk` and the registry give it
 * a `RegistryReader`.
 */

export type ResolveRequest = {
  /** What was asked for directly: a semver range, an exact version, or a dist-tag. */
  dependencies: Record<string, string>;
  /** Versions a lockfile already pins: kept when they still satisfy every range. */
  locked?: Record<string, string>;
};

export type RegistryVersion = {
  version: string;
  sha256: string;
  yanked: boolean;
  /** The deprecation message, or null. */
  deprecated: string | null;
  /** `@scope/name` → a range or a dist-tag. */
  dependencies: Record<string, string>;
};

export type RegistryItem = {
  type: ItemType;
  tags: Record<string, string>;
  versions: RegistryVersion[];
};

export interface RegistryReader {
  /** An item's versions, yanked ones included, and its dist-tags; null if it doesn't exist. */
  item(name: string): Promise<RegistryItem | null>;
}

export type ResolvedItem = {
  version: string;
  type: ItemType;
  sha256: string;
  /** Each dependency, pinned to the version chosen for it, as `rmk.lock` stores it. */
  dependencies: Record<string, string>;
};

export type ResolveWarning = { item: string; version: string; code: "deprecated"; message: string };

export type Resolution = {
  /** One entry per item, in name order. */
  items: Record<string, ResolvedItem>;
  warnings: ResolveWarning[];
};

export type ResolveErrorCode =
  | "item_not_found"
  | "tag_not_found"
  | "no_matching_version"
  | "resolve_conflict";

/** A resolution that can't succeed, with a stable code and the facts behind it. */
export class ResolveError extends Error {
  constructor(
    readonly code: ResolveErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ResolveError";
  }
}

/** Who asked for a range: the request itself, or `@scope/name@version`. */
export const REQUESTED = "the request";

type Constraint = { range: string; from: string };

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Semver's own rule: a range only matches a pre-release if it names one on the same version. */
const fits = (version: string, range: string) => satisfies(version, range);

/**
 * More steps than this, across every attempt, means the choices keep changing each other: on the
 * first attempt it's reported as a conflict; after that, the first attempt's error stands.
 */
const MAX_STEPS = 10_000;

/**
 * More range checks than this (a version against one range) while setting versions aside (#141),
 * and the first error stands. MAX_STEPS already bounds the attempts, since each takes a step; this
 * stops the costly ones, such as an item with thousands of versions, or one many items ask for.
 */
const MAX_CHECKS = 200_000;

/** Stops the search for older versions: a limit was reached. Never leaves `resolve`. */
const LIMIT = Symbol("limit");

export const resolve = async (
  request: ResolveRequest,
  registry: RegistryReader,
): Promise<Resolution> => {
  // Read once, whatever the attempts, missing ones too: nothing changes during a resolution.
  const items = new Map<string, RegistryItem | null>();
  /**
   * The item, or item_not_found. When other items ask for it, the message names them, so a missing
   * dependency (one gone, or one the caller can't see, 093) says whose dependency it is.
   */
  const load = async (name: string, askedBy: readonly string[] = []): Promise<RegistryItem> => {
    const cached = items.get(name);
    if (cached) return cached;
    const item = cached === null ? null : await registry.item(name);
    items.set(name, item);
    const from = askedBy.filter((source) => source !== REQUESTED);
    if (!item)
      throw new ResolveError(
        "item_not_found",
        from.length > 0
          ? `${name} isn't a published item (asked for by ${from.join(", ")}).`
          : `${name} isn't a published item.`,
        from.length > 0 ? { item: name, from } : { item: name },
      );
    return item;
  };

  /** Each item's versions, newest first, sorted once: what `bestOf` walks until one fits. */
  const sorted = new WeakMap<RegistryItem, RegistryVersion[]>();
  const newestFirst = (item: RegistryItem): RegistryVersion[] => {
    const known = sorted.get(item);
    if (known) return known;
    const byVersion = new Map(item.versions.map((v) => [v.version, v]));
    const list = rsort(item.versions.map((v) => v.version).filter((v) => valid(v) !== null))
      .map((version) => byVersion.get(version))
      .filter((v) => v !== undefined);
    sorted.set(item, list);
    return list;
  };

  /** A range stays a range; a dist-tag becomes the exact version it points to. */
  const rangeOf = async (name: string, value: string, from: string): Promise<string> => {
    if (validRange(value) !== null) return value;
    const version = (await load(name, [from])).tags[value];
    if (!version)
      throw new ResolveError(
        "tag_not_found",
        `${name} has no tag ${value} (asked for by ${from}).`,
        {
          item: name,
          tag: value,
          from,
        },
      );
    return version;
  };

  /**
   * The versions a conflict, or a range nothing matches, can be blamed on (#141): the chosen ones
   * whose dependencies asked for a losing range, in name order. Never the request. A missing item
   * or tag has none, so it's reported rather than avoided (decision 4).
   */
  const blamed = new WeakMap<ResolveError, string[]>();
  const blame = (error: ResolveError, ranges: readonly Constraint[]): ResolveError => {
    const sources = new Set(ranges.map((c) => c.from).filter((from) => from !== REQUESTED));
    blamed.set(error, [...sources].sort(byName));
    return error;
  };

  let steps = 0;
  let checks = 0;

  /** One resolution, with the versions in `excluded` (`name@version`) set aside. */
  const attempt = async (excluded: ReadonlySet<string>): Promise<Resolution> => {
    const constraints = new Map<string, Constraint[]>();
    const chosen = new Map<string, RegistryVersion>();
    const queue = new Set<string>();
    const addConstraint = (name: string, constraint: Constraint) => {
      constraints.set(name, [...(constraints.get(name) ?? []), constraint]);
      queue.add(name);
    };
    const dropConstraintsFrom = (from: string) => {
      for (const [name, list] of constraints) {
        const kept = list.filter((c) => c.from !== from);
        if (kept.length !== list.length) {
          constraints.set(name, kept);
          queue.add(name);
        }
      }
    };

    for (const name of Object.keys(request.dependencies).sort(byName)) {
      const value = request.dependencies[name] ?? "";
      addConstraint(name, { range: await rangeOf(name, value, REQUESTED), from: REQUESTED });
    }

    /**
     * The sources whose ranges still count: the request, and each chosen version the requests
     * reach. With `through`, that item's own dependencies aren't followed: what's left is what
     * would still ask for things if it changed version.
     */
    const liveSources = (through?: string): Set<string> => {
      const sources = new Set<string>([REQUESTED]);
      const seen = new Set<string>();
      const pending = Object.keys(request.dependencies);
      for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
        if (seen.has(name)) continue;
        seen.add(name);
        const version = chosen.get(name);
        if (!version || name === through) continue;
        sources.add(`${name}@${version.version}`);
        pending.push(...Object.keys(version.dependencies));
      }
      return sources;
    };

    /**
     * The highest version that fits every range (the locked one first), or undefined. A version
     * set aside is never chosen; when it's the locked one, the newest version below it comes first.
     */
    const bestOf = (item: RegistryItem, name: string, ranges: readonly Constraint[]) => {
      const fitsAll = (v: RegistryVersion) => {
        if (excluded.size > 0) {
          checks += Math.max(1, ranges.length);
          if (checks > MAX_CHECKS) throw LIMIT;
        }
        return ranges.every((c) => fits(v.version, c.range));
      };
      const allowed = (v: RegistryVersion) => !excluded.has(`${name}@${v.version}`);
      const locked = item.versions.find((v) => v.version === request.locked?.[name]);
      if (locked && allowed(locked) && fitsAll(locked)) return locked;
      const usable = (v: RegistryVersion) => !v.yanked && allowed(v) && fitsAll(v);
      const versions = newestFirst(item);
      if (locked && !allowed(locked) && valid(locked.version) !== null) {
        const below = versions.find((v) => lt(v.version, locked.version) && usable(v));
        if (below) return below;
      }
      return versions.find(usable);
    };

    /** How many times each item has changed version: past two, it stays where it fits (112). */
    const switches = new Map<string, number>();

    const settle = async () => {
      while (queue.size > 0) {
        if (++steps > MAX_STEPS) {
          if (excluded.size > 0) throw LIMIT;
          throw new ResolveError(
            "resolve_conflict",
            "The dependencies keep changing each other's versions.",
          );
        }
        const name = [...queue].sort(byName)[0] ?? "";
        queue.delete(name);
        let asking = constraints.get(name) ?? [];
        const previous = chosen.get(name);

        // Nothing asks for it any more: it leaves, with the ranges it put on others.
        if (asking.length === 0) {
          if (previous) {
            chosen.delete(name);
            dropConstraintsFrom(`${name}@${previous.version}`);
          }
          continue;
        }

        const item = await load(
          name,
          asking.map((c) => c.from),
        );
        let best = bestOf(item, name, asking);
        // No version fits. Items that need each other (112) can still be asking after nothing
        // reaches them, or only because of this item's own version: without their ranges, it may
        // fit, and what they asked for then leaves with them.
        if (!best) {
          const live = liveSources();
          asking = asking.filter((c) => live.has(c.from));
          best = bestOf(item, name, asking);
          if (!best) {
            const without = liveSources(name);
            const others = asking.filter((c) => without.has(c.from));
            best = bestOf(item, name, others);
            // Still nothing: the ranges that don't come from this item's own version are to blame.
            if (!best && others.length > 0) asking = others;
          }
        }
        if (!best) {
          const each = asking.map((c) => ({ range: c.range, from: c.from }));
          const locked = item.versions.find((v) => v.version === request.locked?.[name]);
          const anyFits = asking.every((c) =>
            item.versions.some((v) => (!v.yanked || v === locked) && fits(v.version, c.range)),
          );
          if (asking.length > 1 && anyFits)
            throw blame(
              new ResolveError(
                "resolve_conflict",
                `No version of ${name} fits every range asking for it: ${each
                  .map((c) => `${c.range} (${c.from})`)
                  .join(", ")}.`,
                { item: name, ranges: each },
              ),
              asking,
            );
          throw blame(
            new ResolveError(
              "no_matching_version",
              `${name} has no published version that fits ${each.map((c) => `${c.range} (${c.from})`).join(", ")}.`,
              { item: name, ranges: each },
            ),
            asking,
          );
        }
        if (previous?.version === best.version) continue;
        // Back and forth (a cycle that brings in a range on the item that brought it): once it has
        // changed twice, it keeps a version that still fits.
        if (
          previous &&
          (switches.get(name) ?? 0) >= 2 &&
          asking.every((c) => fits(previous.version, c.range))
        )
          continue;

        if (previous) {
          switches.set(name, (switches.get(name) ?? 0) + 1);
          dropConstraintsFrom(`${name}@${previous.version}`);
        }
        chosen.set(name, best);
        const from = `${name}@${best.version}`;
        for (const dependency of Object.keys(best.dependencies).sort(byName))
          addConstraint(dependency, {
            range: await rangeOf(dependency, best.dependencies[dependency] ?? "", from),
            from,
          });
      }
    };

    // Items may need each other (112). A pair that nothing else asks for any more keeps asking for
    // each other, so the settled choice is pruned to what the requests reach, and settled again
    // without the ranges the pruned ones put on others, until nothing more goes.
    for (;;) {
      await settle();
      const live = liveSources();
      const unreached = [...chosen.keys()]
        .filter((name) => !live.has(`${name}@${chosen.get(name)?.version}`))
        .sort(byName);
      if (unreached.length === 0) break;
      for (const name of unreached) {
        const version = chosen.get(name);
        chosen.delete(name);
        if (version) dropConstraintsFrom(`${name}@${version.version}`);
      }
    }

    // Every range still asking has to fit: a version chosen without a range only its own version
    // brought (above) is a conflict if that range is still there.
    const live = liveSources();
    for (const name of [...chosen.keys()].sort(byName)) {
      const version = chosen.get(name)?.version ?? "";
      const asking = (constraints.get(name) ?? []).filter((c) => live.has(c.from));
      if (asking.every((c) => fits(version, c.range))) continue;
      const each = asking.map((c) => ({ range: c.range, from: c.from }));
      throw blame(
        new ResolveError(
          "resolve_conflict",
          `No version of ${name} fits every range asking for it: ${each
            .map((c) => `${c.range} (${c.from})`)
            .join(", ")}.`,
          { item: name, ranges: each },
        ),
        asking,
      );
    }

    const resolved: Record<string, ResolvedItem> = {};
    const warnings: ResolveWarning[] = [];
    for (const name of [...chosen.keys()].sort(byName)) {
      const version = chosen.get(name);
      const item = items.get(name);
      if (!version || !item) continue;
      resolved[name] = {
        version: version.version,
        type: item.type,
        sha256: version.sha256,
        dependencies: Object.fromEntries(
          Object.keys(version.dependencies)
            .sort(byName)
            .map((dependency) => [dependency, chosen.get(dependency)?.version ?? ""]),
        ),
      };
      if (version.deprecated !== null)
        warnings.push({
          item: name,
          version: version.version,
          code: "deprecated",
          message: version.deprecated,
        });
    }
    return { items: resolved, warnings };
  };

  /**
   * Today's resolution first; on a conflict, each blamed version set aside in turn, depth first,
   * keeping what was set aside on the way (#141). A set of exclusions is tried once. When nothing
   * works, the error is this level's: at the top, the first attempt's.
   */
  const tried = new Set<string>();
  /** The first attempt's error: what a limit reports, since it names the newest versions' ranges. */
  let first: unknown;
  const search = async (excluded: ReadonlySet<string>): Promise<Resolution> => {
    try {
      return await attempt(excluded);
    } catch (error) {
      if (excluded.size === 0) first = error;
      const versions = error instanceof ResolveError ? blamed.get(error) : undefined;
      if (!versions) throw error;
      for (const version of versions) {
        const next = new Set(excluded).add(version);
        const key = [...next].sort(byName).join(" ");
        if (tried.has(key)) continue;
        tried.add(key);
        try {
          return await search(next);
        } catch (failed) {
          // A path that fails for a resolution reason gives way to the next; anything else (a
          // registry that can't be read, a limit) stops the search.
          if (!(failed instanceof ResolveError)) throw failed;
        }
      }
      throw error;
    }
  };

  try {
    return await search(new Set());
  } catch (error) {
    // A limit is only reached after the first attempt has failed, so `first` is its error.
    throw error === LIMIT ? first : error;
  }
};
