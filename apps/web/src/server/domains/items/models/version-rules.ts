import { highestStable, type TagProblem, tagProblem, tagProblemOf } from "@ronneai/core";

/** Up to this many dist-tags per item (feature 016). */
export const MAX_TAGS = 20;
export const MESSAGE_MAX_LENGTH = 300;

type Version = { id: string; version: string; yanked: boolean };

/**
 * Where `latest` goes after `yanked` is yanked (feature 016, owner's recommendation): the highest
 * stable version left that isn't yanked, or nowhere. Never a pre-release: `latest` is only ever
 * stable (MVP §3.4).
 */
export const latestAfterYank = (versions: readonly Version[], yankedId: string): Version | null => {
  const left = versions.filter((v) => v.id !== yankedId && !v.yanked);
  const best = highestStable(left.map((v) => v.version));
  return left.find((v) => v.version === best) ?? null;
};

/**
 * Why `tag` can't point to `target`, or null: 015's naming rules (`tagProblem`), no yanked target,
 * and at most MAX_TAGS tags on an item (`isNew` when the tag doesn't exist yet).
 */
export const moveTagProblem = (
  tag: string,
  target: Version,
  existingTags: number,
  isNew: boolean,
): string | null => moveTagRule(tag, target, existingTags, isNew)?.message ?? null;

/**
 * A tag rule refused, in English (as the API says it) and as a code with its values, which the web
 * app words (131).
 */
export type TagRule = {
  message: string;
  code: TagProblem | "yanked" | "too_many" | "latest_kept";
  tag: string;
  version: string;
  max: number;
};

/** The same as `moveTagProblem`, as a `TagRule`. */
export const moveTagRule = (
  tag: string,
  target: Version,
  existingTags: number,
  isNew: boolean,
): TagRule | null => {
  const rule = (code: TagRule["code"], message: string): TagRule => ({
    message,
    code,
    tag,
    version: target.version,
    max: MAX_TAGS,
  });
  const problem = tagProblem(tag, target.version);
  const code = tagProblemOf(tag, target.version);
  if (problem && code) return rule(code, problem);
  if (target.yanked)
    return rule("yanked", `${target.version} is yanked, so no tag can point to it.`);
  if (isNew && existingTags >= MAX_TAGS)
    return rule("too_many", `An item can have at most ${MAX_TAGS} tags.`);
  return null;
};

/** `latest` can't be removed: an item with a stable version always has it (MVP §3.4). */
export const removeTagProblem = (tag: string): string | null => removeTagRule(tag)?.message ?? null;

/** The same as `removeTagProblem`, as a `TagRule`. */
export const removeTagRule = (tag: string): TagRule | null =>
  tag === "latest"
    ? {
        message: "latest can't be removed; point it at another version instead.",
        code: "latest_kept",
        tag,
        version: "",
        max: MAX_TAGS,
      }
    : null;

/** A deprecation message or yank reason: 1 to 300 characters, trimmed; null when it's invalid. */
export const messageFrom = (value: string): string | null => {
  const message = value.trim();
  return message.length > 0 && [...message].length <= MESSAGE_MAX_LENGTH ? message : null;
};
