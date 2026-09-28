import { gt, inc, maxSatisfying, prerelease, rsort, valid, validRange } from "semver";

/**
 * The highest of `versions` that `range` accepts, or null: what the resolver (020) installs, and
 * what the registry checks (013) look at. Pre-releases only match ranges that name them, as in npm.
 */
export const highestMatching = (versions: readonly string[], range: string): string | null =>
  maxSatisfying(
    versions.filter((version) => valid(version) !== null),
    range,
  );

export type Bump = "major" | "minor" | "patch";

/** What the publisher chooses (feature 015): never a version number, which the server computes. */
export type ReleaseChoice =
  | { kind: "stable"; bump: Bump }
  | { kind: "prerelease"; id: string; bump: Bump };

/** A pre-release id: lowercase letters and digits, starting with a letter, such as `beta`. */
export const PRERELEASE_ID = /^[a-z][a-z0-9]{0,15}$/;

/**
 * The version a release gets (MVP §3.4, §4.2), from the versions already published, yanked ones
 * included, since versions are never reused:
 * - the first stable release is `1.0.0`; the first pre-release is `1.0.0-<id>.1`;
 * - later, `bump` raises the highest version; from a pre-release, releasing the stable version drops
 *   its suffix (`1.1.0-beta.2` → `1.1.0`);
 * - a pre-release continues the line it's on (`1.1.0-beta.2` → `1.1.0-beta.3`), or starts one on the
 *   bumped version (`1.0.0` → `1.1.0-beta.1` for a minor bump).
 * Returns null when the result wouldn't be higher than every published version (a pre-release id
 * that sorts before the current one, such as `alpha` after `beta`), or the id is invalid.
 */
export const nextVersion = (published: readonly string[], choice: ReleaseChoice): string | null => {
  if (choice.kind === "prerelease" && !PRERELEASE_ID.test(choice.id)) return null;
  const versions = rsort(published.filter((version) => valid(version) !== null));
  const highest = versions[0];
  if (!highest) return choice.kind === "stable" ? "1.0.0" : `1.0.0-${choice.id}.1`;
  const next =
    choice.kind === "stable"
      ? inc(highest, choice.bump)
      : prerelease(highest)
        ? inc(highest, "prerelease", choice.id, "1")
        : inc(highest, `pre${choice.bump}`, choice.id, "1");
  return next && gt(next, highest) ? next : null;
};

/** `latest` for a stable version; `next` for a pre-release, which is never `latest` (MVP §3.4). */
export const defaultTag = (version: string): string => (prerelease(version) ? "next" : "latest");

/**
 * Why a dist-tag can't point to `version`, or null. Tags are lowercase letters, digits and hyphens,
 * up to 32 characters, and can't read as a version range (`1`, `x` and `v1` do), so installing
 * `@a/b@<tag>` is never ambiguous. `latest` can only point to a stable version.
 */
export const tagProblem = (tag: string, version: string): string | null => {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(tag))
    return "A tag is 1 to 32 lowercase letters, digits and hyphens, starting with a letter.";
  if (validRange(tag) !== null) return `${tag} reads as a version range, so it can't be a tag.`;
  if (tag === "latest" && prerelease(version))
    return "latest can only point to a stable version, not a pre-release.";
  return null;
};

/** The highest stable (non-pre-release) version, or null: where `latest` can point (MVP §3.4). */
export const highestStable = (versions: readonly string[]): string | null =>
  rsort(versions.filter((version) => valid(version) !== null && !prerelease(version)))[0] ?? null;
