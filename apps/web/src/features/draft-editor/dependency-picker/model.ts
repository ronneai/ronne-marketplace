import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import { startingRange } from "../composer-canvas/model";

/**
 * Picking a dependency (056): the range a pick writes, and the versions a row offers. Plain
 * functions, shared by the form's picker and `@` in markdown.
 */

/** The range for a pick: the chosen version, else `latest`'s, else an unreleased item's 1.0.0. */
export const rangeFor = (option: DependencyOption, version: string | null = null): string =>
  version ? startingRange(version) : option.latest ? startingRange(option.latest) : "^1.0.0";

/** What a row's version list offers: `latest` first, then each released version, newest first. */
export const versionChoices = (option: DependencyOption): { label: string; range: string }[] =>
  option.latest
    ? [
        { label: `latest (${option.latest})`, range: rangeFor(option) },
        ...option.versions
          .filter((v) => startingRange(v) !== rangeFor(option))
          .map((v) => ({ label: v, range: startingRange(v) })),
      ]
    : [{ label: "1.0.0, its first release", range: "^1.0.0" }];

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
