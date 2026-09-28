import { maxSatisfying, valid } from "semver";

/**
 * The highest of `versions` that `range` accepts, or null: what the resolver (020) installs, and
 * what the registry checks (013) look at. Pre-releases only match ranges that name them, as in npm.
 */
export const highestMatching = (versions: readonly string[], range: string): string | null =>
  maxSatisfying(
    versions.filter((version) => valid(version) !== null),
    range,
  );
