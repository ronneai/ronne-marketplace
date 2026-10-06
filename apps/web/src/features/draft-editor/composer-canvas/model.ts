import { type ItemType, mayHaveDependencies } from "@ronneai/core";
import { isMap, isScalar, parseDocument } from "yaml";
import { PRINT, readManifest, writeField } from "../manifest-yaml";

/** The types with a canvas: every type that may have dependencies, which is every type (096). */
export const hasCanvas = (type: ItemType): boolean => mayHaveDependencies(type);

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `dependencies` as ronne.yaml has it, in name order, or null while the YAML doesn't parse. A range
 * that isn't text reads as empty, as the form shows it.
 */
export const readDependencies = (text: string): Record<string, string> | null => {
  const manifest = readManifest(text);
  if (!manifest) return null;
  const value = manifest.dependencies;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => byName(a, b))
      .map(([name, range]) => [name, typeof range === "string" ? range : ""]),
  );
};

/**
 * ronne.yaml with one more dependency. It goes in name order among the ones there, and they keep
 * their lines, comments included, so the diff is the one new line. A name already there gets the
 * new range. Returns the text unchanged if it doesn't parse.
 */
export const addDependency = (text: string, name: string, range: string): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;
  const current = doc.get("dependencies", true);
  if (!isMap(current)) {
    doc.set("dependencies", doc.createNode({ [name]: range }));
    return doc.toString(PRINT);
  }
  if (current.has(name)) return writeField(text, ["dependencies", name], range, { required: true });
  // The templates' empty `{}` becomes a block, one dependency a line.
  if (current.items.length === 0) current.flow = false;
  const after = current.items.findIndex(
    (pair) => isScalar(pair.key) && byName(String(pair.key.value), name) > 0,
  );
  current.items.splice(after === -1 ? current.items.length : after, 0, doc.createPair(name, range));
  return doc.toString(PRINT);
};

/** ronne.yaml with a dependency's range changed in place. An emptied range stays, for 011 to refuse. */
export const setDependencyRange = (text: string, name: string, range: string): string =>
  writeField(text, ["dependencies", name], range, { required: true });

/**
 * ronne.yaml without a dependency. The last one takes `dependencies` with it, as in the form,
 * except in a bundle, which must have the key.
 */
export const removeDependency = (text: string, name: string, type: ItemType): string => {
  const without = writeField(text, ["dependencies", name], undefined);
  const left = readDependencies(without);
  return left && Object.keys(left).length === 0
    ? writeField(without, ["dependencies"], {}, { required: type === "bundle" })
    : without;
};

/**
 * The range a dependency starts with: `^<latest>`, npm's default, so the resolver keeps it current
 * within the major. An item with only pre-releases starts on that exact version, since a caret
 * range from a pre-release would take every later one.
 */
export const startingRange = (version: string): string =>
  version.includes("-") ? version : `^${version}`;
