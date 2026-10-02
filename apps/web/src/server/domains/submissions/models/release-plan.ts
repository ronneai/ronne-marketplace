import { type Bump, defaultTag, nextVersion, type ReleaseChoice, tagProblem } from "@ronneai/core";

/**
 * Releasing many at once (feature 055): one set of settings, applied to each submission. Plain
 * functions, so the dialog's preview and the server work out exactly the same versions and tags.
 */

/** What the person chooses once, for every submission in the batch. */
export type ReleaseSettings = {
  kind: "stable" | "prerelease";
  /** The pre-release id, such as `beta`; only for a pre-release. */
  id?: string;
  /** Each proposal's own suggested bump (017), or one bump for all. */
  bump: "suggested" | Bump;
  /** One tag for all; empty or missing means each version's default (`latest` or `next`). */
  tag?: string | null;
};

/** What the plan needs to know of one submission. */
export type ReleaseTarget = {
  id: string;
  name: string;
  /** The item's versions so far, yanked ones included (they're never reused); empty for new. */
  published: readonly string[];
  /** 017's suggested bump for a change proposal; null for a new item. */
  suggested: Bump | null;
};

export type PlannedRelease =
  | {
      id: string;
      name: string;
      ok: true;
      version: string;
      tag: string;
      choice: ReleaseChoice;
      /** The bump used: null for a first release, which is always 1.0.0. */
      bump: Bump | null;
      /** Whether the bump is the proposal's suggestion. */
      suggested: boolean;
    }
  | { id: string; name: string; ok: false; problem: string };

/** The bump when "suggested" is chosen but there's no suggestion: the publish dialog's default. */
const FALLBACK_BUMP: Bump = "minor";

/** Each submission's version and tag under `settings`, or why it can't be released with them. */
export const planReleases = (
  targets: readonly ReleaseTarget[],
  settings: ReleaseSettings,
): PlannedRelease[] =>
  targets.map((target) => {
    const first = target.published.length === 0;
    const bump: Bump =
      settings.bump === "suggested" ? (target.suggested ?? FALLBACK_BUMP) : settings.bump;
    const choice: ReleaseChoice =
      settings.kind === "stable"
        ? { kind: "stable", bump }
        : { kind: "prerelease", id: (settings.id ?? "").trim(), bump };
    const version = nextVersion(target.published, choice);
    if (!version)
      return {
        id: target.id,
        name: target.name,
        ok: false,
        problem:
          "That doesn't give a new version: a pre-release id is lowercase letters and digits, starting with a letter.",
      };
    const tag = settings.tag?.trim() || defaultTag(version);
    const problem = tagProblem(tag, version);
    if (problem) return { id: target.id, name: target.name, ok: false, problem };
    return {
      id: target.id,
      name: target.name,
      ok: true,
      version,
      tag,
      choice,
      bump: first ? null : bump,
      suggested: !first && settings.bump === "suggested" && target.suggested !== null,
    };
  });
