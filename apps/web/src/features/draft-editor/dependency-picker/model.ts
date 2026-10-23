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
 * What a range accepts (#143), as data the screens word: `^1.2.3` "1.2.3 or later 1.x" (`major`),
 * `^0.2.3` "0.2.3 or later 0.2.x" (`minor`), `^0.0.3` "only 0.0.3" (`only`), `1.2.3` "exactly
 * 1.2.3" (`exactly`). Null for anything else, such as a tilde or a caret on a pre-release, which
 * the picker never writes. Words: `usePickerWords` (131).
 */
export type Accepts =
  | { kind: "exactly"; version: string }
  | { kind: "major"; version: string; major: string }
  | { kind: "minor"; version: string; minor: string }
  | { kind: "only"; version: string }
  /** An unreleased item's `^1.0.0` and `1.0.0`: its first release, or a later 1.x / exactly. */
  | { kind: "first" }
  | { kind: "firstExactly" };

export const acceptsOf = (range: string): Accepts | null => {
  const caret = range.startsWith("^");
  const match = VERSION.exec(caret ? range.slice(1) : range);
  if (!match) return null;
  const version = caret ? range.slice(1) : range;
  if (!caret) return { kind: "exactly", version };
  const [, major = "", minor = "", , pre] = match;
  if (pre) return null;
  if (major !== "0") return { kind: "major", version, major };
  if (minor !== "0") return { kind: "minor", version, minor };
  return { kind: "only", version };
};

/** One row of a version list: the range it writes, what that accepts, and whether it's `latest`'s. */
export type VersionChoice = { range: string; accepts: Accepts; latest: boolean };
export type VersionGroup = { id: "compatible" | "exactly"; choices: VersionChoice[] };

/**
 * What a row's version list offers (#143), in two groups. **Compatible**: the caret range of each
 * released version that isn't a pre-release, newest first, `latest`'s first and marked so.
 * **Exactly**: each released version, newest first. Every label starts with what it writes. A
 * group with nothing to offer, such as Compatible when only pre-releases are out, is left out.
 */
export const versionChoices = (option: DependencyOption): VersionGroup[] => {
  if (!option.latest)
    return [
      {
        id: "compatible",
        choices: [{ range: "^1.0.0", accepts: { kind: "first" }, latest: false }],
      },
      {
        id: "exactly",
        choices: [{ range: "1.0.0", accepts: { kind: "firstExactly" }, latest: false }],
      },
    ];
  const latest = rangeFor(option);
  const carets = [latest, ...option.versions.map((version) => `^${version}`)].filter(
    (range, i, all) => range.startsWith("^") && acceptsOf(range) && all.indexOf(range) === i,
  );
  const groups: VersionGroup[] = [
    {
      id: "compatible",
      choices: carets.flatMap((range) => {
        const accepts = acceptsOf(range);
        return accepts ? [{ range, accepts, latest: range === latest }] : [];
      }),
    },
    {
      id: "exactly",
      choices: option.versions.map((version) => ({
        range: version,
        accepts: { kind: "exactly", version },
        latest: false,
      })),
    },
  ];
  return groups.filter((group) => group.choices.length > 0);
};

/** The dependencies map from a manifest value: only string ranges, in order. */
export const dependencyRows = (value: unknown): [string, string][] =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).map(([name, range]) => [
        name,
        typeof range === "string" ? range : "",
      ])
    : [];
