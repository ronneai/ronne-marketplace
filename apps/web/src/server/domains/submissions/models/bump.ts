import type { Bump } from "@ronneai/core";
import { stringify } from "yaml";

/**
 * The bump a release of a change proposal suggests (feature 017), from what changed against the
 * version it started from. The publisher can pick another; this only sets the default.
 * - major: the type block loses a field, a dependency is removed, or a file the manifest names is
 *   removed;
 * - minor: a file, a dependency, a keyword or a type-block field is added;
 * - patch: anything else.
 */
export type SuggestedBump = { bump: Bump; reasons: string[] };

type Manifest = Record<string, unknown>;
type Side = { manifest: Manifest; paths: readonly string[] };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Every string anywhere in the manifest: the files it names are among them. */
const allStrings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(allStrings)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(allStrings)
        : [];

const added = (before: readonly string[], after: readonly string[]) =>
  after.filter((x) => !before.includes(x));
const removed = (before: readonly string[], after: readonly string[]) =>
  before.filter((x) => !after.includes(x));
const list = (items: string[]) => items.map((item) => `\`${item}\``).join(", ");

export const suggestBump = (base: Side, current: Side): SuggestedBump => {
  const type = typeof base.manifest.type === "string" ? base.manifest.type : "";
  const blockBefore = Object.keys(record(base.manifest[type]));
  const blockAfter = Object.keys(record(current.manifest[type]));
  const depsBefore = Object.keys(record(base.manifest.dependencies));
  const depsAfter = Object.keys(record(current.manifest.dependencies));
  const named = new Set(allStrings(base.manifest));
  const namedFiles = base.paths.filter((path) => named.has(path));

  const major = [
    ...(removed(blockBefore, blockAfter).length
      ? [`the ${type} block no longer has ${list(removed(blockBefore, blockAfter))}`]
      : []),
    ...(removed(depsBefore, depsAfter).length
      ? [`it no longer depends on ${list(removed(depsBefore, depsAfter))}`]
      : []),
    ...(removed(namedFiles, current.paths).length
      ? [`${list(removed(namedFiles, current.paths))}, which the manifest names, is removed`]
      : []),
  ];
  if (major.length) return { bump: "major", reasons: major };

  const minor = [
    ...(added(base.paths, current.paths).length
      ? [`${list(added(base.paths, current.paths))} is new`]
      : []),
    ...(added(depsBefore, depsAfter).length
      ? [`it now depends on ${list(added(depsBefore, depsAfter))}`]
      : []),
    ...(added(strings(base.manifest.keywords), strings(current.manifest.keywords)).length
      ? [
          `keyword ${list(added(strings(base.manifest.keywords), strings(current.manifest.keywords)))} is new`,
        ]
      : []),
    ...(added(blockBefore, blockAfter).length
      ? [`the ${type} block gains ${list(added(blockBefore, blockAfter))}`]
      : []),
  ];
  if (minor.length) return { bump: "minor", reasons: minor };
  return { bump: "patch", reasons: ["nothing is added or removed"] };
};

/** A top-level manifest field that differs between two versions, as YAML, for side-by-side reading. */
export type ManifestFieldChange = { field: string; before: string | null; after: string | null };

const yamlOf = (value: unknown) => (value === undefined ? null : stringify(value).trimEnd());

export const manifestChanges = (before: Manifest, after: Manifest): ManifestFieldChange[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: yamlOf(before[field]), after: yamlOf(after[field]) }));
