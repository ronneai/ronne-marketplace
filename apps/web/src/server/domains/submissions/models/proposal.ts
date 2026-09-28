import { supersededBy } from "@ronneai/core";

/**
 * Whether a change proposal (feature 017) is stale: the newest published, non-yanked version that
 * supersedes its base (core's `supersededBy`), which is also where a rebase takes it. Computed from
 * the published versions every time, never stored, so it's always current.
 */
export const staleAgainst = (
  baseVersion: string,
  versions: readonly { version: string; yanked: boolean }[],
): string | null =>
  supersededBy(
    baseVersion,
    versions.filter((v) => !v.yanked).map((v) => v.version),
  );
