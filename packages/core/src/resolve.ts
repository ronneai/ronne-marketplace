import { rsort, satisfies, valid, validRange } from "semver";
import type { ItemType } from "./item-types.js";

/**
 * The resolver (feature 020, MVP §4.3): which version of every item an install gets. One version
 * per item, the highest non-yanked one that fits every range asking for it; a version a lockfile
 * pins is kept while it still fits, even if yanked. Deterministic, and with no network or database
 * code of its own: `rmk` and the registry give it a `RegistryReader`.
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
  | "resolve_conflict"
  | "dependency_cycle";

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

/** More steps than this means the choices keep changing each other: reported as a conflict. */
const MAX_STEPS = 10_000;

export const resolve = async (
  request: ResolveRequest,
  registry: RegistryReader,
): Promise<Resolution> => {
  const items = new Map<string, RegistryItem>();
  const load = async (name: string): Promise<RegistryItem> => {
    const cached = items.get(name);
    if (cached) return cached;
    const item = await registry.item(name);
    if (!item)
      throw new ResolveError("item_not_found", `${name} isn't a published item.`, { item: name });
    items.set(name, item);
    return item;
  };

  /** A range stays a range; a dist-tag becomes the exact version it points to. */
  const rangeOf = async (name: string, value: string, from: string): Promise<string> => {
    if (validRange(value) !== null) return value;
    const version = (await load(name)).tags[value];
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

  let steps = 0;
  while (queue.size > 0) {
    if (++steps > MAX_STEPS)
      throw new ResolveError(
        "resolve_conflict",
        "The dependencies keep changing each other's versions.",
      );
    const name = [...queue].sort(byName)[0] ?? "";
    queue.delete(name);
    const asking = constraints.get(name) ?? [];
    const previous = chosen.get(name);

    // Nothing asks for it any more: it leaves, with the ranges it put on others.
    if (asking.length === 0) {
      if (previous) {
        chosen.delete(name);
        dropConstraintsFrom(`${name}@${previous.version}`);
      }
      continue;
    }

    const item = await load(name);
    const fitsAll = (v: RegistryVersion) => asking.every((c) => fits(v.version, c.range));
    const locked = item.versions.find((v) => v.version === request.locked?.[name]);
    const best =
      locked && fitsAll(locked)
        ? locked
        : rsort(
            item.versions
              .filter((v) => !v.yanked && valid(v.version) !== null && fitsAll(v))
              .map((v) => v.version),
          )
            .map((version) => item.versions.find((v) => v.version === version))
            .find((v) => v !== undefined);
    if (!best) {
      const each = asking.map((c) => ({ range: c.range, from: c.from }));
      const anyFits = asking.every((c) =>
        item.versions.some((v) => (!v.yanked || v === locked) && fits(v.version, c.range)),
      );
      if (asking.length > 1 && anyFits)
        throw new ResolveError(
          "resolve_conflict",
          `No version of ${name} fits every range asking for it: ${each
            .map((c) => `${c.range} (${c.from})`)
            .join(", ")}.`,
          { item: name, ranges: each },
        );
      throw new ResolveError(
        "no_matching_version",
        `${name} has no published version that fits ${each.map((c) => `${c.range} (${c.from})`).join(", ")}.`,
        { item: name, ranges: each },
      );
    }
    if (previous?.version === best.version) continue;

    if (previous) dropConstraintsFrom(`${name}@${previous.version}`);
    chosen.set(name, best);
    const from = `${name}@${best.version}`;
    for (const dependency of Object.keys(best.dependencies).sort(byName))
      addConstraint(dependency, {
        range: await rangeOf(dependency, best.dependencies[dependency] ?? "", from),
        from,
      });
  }

  // Submission refuses cycles (013); a registry edited by hand could still have one.
  const visiting: string[] = [];
  const done = new Set<string>();
  const walk = (name: string) => {
    if (done.has(name)) return;
    const at = visiting.indexOf(name);
    if (at !== -1) {
      const cycle = [...visiting.slice(at), name];
      throw new ResolveError(
        "dependency_cycle",
        `The dependencies go round in a circle: ${cycle.join(" → ")}.`,
        {
          cycle,
        },
      );
    }
    visiting.push(name);
    for (const dependency of Object.keys(chosen.get(name)?.dependencies ?? {}).sort(byName))
      walk(dependency);
    visiting.pop();
    done.add(name);
  };
  for (const name of [...chosen.keys()].sort(byName)) walk(name);

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
