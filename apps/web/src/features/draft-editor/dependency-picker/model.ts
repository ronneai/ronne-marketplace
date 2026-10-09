import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import { startingRange } from "../composer-canvas/model";

/**
 * Picking a dependency (056): the range a pick writes, and the versions a row offers. Plain
 * functions, shared by the form's picker and `@` in markdown.
 */

/** The range for a pick: the chosen version, else `latest`'s, else an unreleased item's 1.0.0. */
export const rangeFor = (option: DependencyOption, version: string | null = null): string =>
  version ? startingRange(version) : option.latest ? startingRange(option.latest) : "^1.0.0";

/**
 * A semver version, as `semver` reads one: no leading zeros, and each dot-separated pre-release
 * part either a number without a leading zero or letters, digits and hyphens with a non-digit.
 */
const PART = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const VERSION = new RegExp(
  `^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-${PART}(?:\\.${PART})*)?$`,
);

/**
 * What a range accepts, in words (#143): `^1.2.3` "1.2.3 or later 1.x", `^0.2.3` "0.2.3 or later
 * 0.2.x", `^0.0.3` "only 0.0.3", `1.2.3` "exactly 1.2.3". Null for anything else, such as a tilde
 * or a caret on a pre-release, which the picker never writes.
 */
export const acceptsText = (range: string): string | null => {
  const caret = range.startsWith("^");
  const match = VERSION.exec(caret ? range.slice(1) : range);
  if (!match) return null;
  const version = caret ? range.slice(1) : range;
  if (!caret) return `exactly ${version}`;
  const [, major, minor, , pre] = match;
  if (pre) return null;
  if (major !== "0") return `${version} or later ${major}.x`;
  if (minor !== "0") return `${version} or later 0.${minor}.x`;
  return `only ${version}`;
};

export type VersionChoice = {
  /** The range, then what it accepts: the text the list shows. */
  label: string;
  /** What choosing it writes to ronne.yaml. */
  range: string;
  /** What the range accepts, in words. */
  accepts: string;
};
export type VersionGroup = { label: "Compatible" | "Exactly"; choices: VersionChoice[] };

/** A row: the exact range it writes, then what that accepts. */
const choice = (range: string, accepts: string): VersionChoice => ({
  label: `${range} · ${accepts}`,
  range,
  accepts,
});

/**
 * What a row's version list offers (#143), in two groups. **Compatible**: the caret range of each
 * released version that isn't a pre-release, newest first, `latest`'s first and marked so.
 * **Exactly**: each released version, newest first. Every label starts with what it writes. A
 * group with nothing to offer, such as Compatible when only pre-releases are out, is left out.
 */
export const versionChoices = (option: DependencyOption): VersionGroup[] => {
  if (!option.latest)
    return [
      { label: "Compatible", choices: [choice("^1.0.0", "its first release, or a later 1.x")] },
      { label: "Exactly", choices: [choice("1.0.0", "exactly its first release")] },
    ];
  const latest = rangeFor(option);
  const carets = [latest, ...option.versions.map((version) => `^${version}`)].filter(
    (range, i, all) => range.startsWith("^") && acceptsText(range) && all.indexOf(range) === i,
  );
  const groups: VersionGroup[] = [
    {
      label: "Compatible",
      choices: carets.map((range) =>
        choice(range, `${acceptsText(range)}${range === latest ? ", latest" : ""}`),
      ),
    },
    {
      label: "Exactly",
      choices: option.versions.map((version) => choice(version, `exactly ${version}`)),
    },
  ];
  return groups.filter((group) => group.choices.length > 0);
};

/** How an option's status reads in the list. */
export const statusText = (option: DependencyOption): string => {
  const status =
    option.status === "published"
      ? `published ${option.latest ?? ""}`.trim()
      : option.status === "submitted"
        ? "in review"
        : option.status === "changes_requested"
          ? "back with its author"
          : option.status === "approved"
            ? "pending release"
            : option.status;
  return option.mine ? `${status}, yours` : status;
};

/** The dependencies map from a manifest value: only string ranges, in order. */
export const dependencyRows = (value: unknown): [string, string][] =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).map(([name, range]) => [
        name,
        typeof range === "string" ? range : "",
      ])
    : [];
