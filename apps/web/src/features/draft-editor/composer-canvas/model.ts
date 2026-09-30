import type { ItemType, ManifestIssue } from "@ronneai/core";
import { isMap, isScalar, parseDocument } from "yaml";
import { PRINT, readManifest, writeField } from "../manifest-yaml";
import { placeNodes } from "./layout";
import type { ComposerEdge, ComposerNode, DependencyReport, Layout } from "./types";

/** The draft's own node. Dependencies' ids carry a prefix, so no name can collide with it. */
export const ITEM_NODE_ID = "item";
export const dependencyNodeId = (name: string) => `dependency:${name}`;

/** The types with a canvas: the ones whose dependencies are several kinds of item (MVP §3.1). */
export const hasCanvas = (type: ItemType): boolean => type === "agent" || type === "bundle";

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

/** 011's problems with one dependency's line: a range that isn't a semver range. */
const rangeProblems = (name: string, issues: readonly ManifestIssue[]): string[] => {
  const pointer = `/dependencies/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
  return issues.filter((issue) => issue.path === pointer).map((issue) => issue.message);
};

/**
 * The canvas for a manifest and a layout: the draft in the centre and one node per dependency, each
 * joined to it, in name order. The canvas holds nothing else, so the same inputs always draw the
 * same canvas. `reports` is what the registry said about each dependency (013's checks), and
 * `issues` the draft's own problems (011's), which give a node its range problem.
 */
export const toGraph = ({
  itemName,
  type,
  dependencies,
  layout,
  reports = {},
  issues = [],
}: {
  itemName: string;
  type: ItemType;
  dependencies: Readonly<Record<string, string>>;
  layout: Layout;
  reports?: Readonly<Record<string, DependencyReport | undefined>>;
  issues?: readonly ManifestIssue[];
}): { nodes: ComposerNode[]; edges: ComposerEdge[] } => {
  const names = Object.keys(dependencies).sort(byName);
  const positions = placeNodes(names, layout);
  return {
    nodes: [
      { id: ITEM_NODE_ID, type: "item", position: { x: 0, y: 0 }, data: { name: itemName, type } },
      ...names.map((name): ComposerNode => {
        const report = Object.hasOwn(reports, name) ? reports[name] : undefined;
        return {
          id: dependencyNodeId(name),
          type: "dependency",
          position: positions[name] ?? { x: 0, y: 0 },
          data: {
            name,
            range: dependencies[name] ?? "",
            facts: report?.facts,
            problems: [...rangeProblems(name, issues), ...(report?.problems ?? [])],
          },
        };
      }),
    ],
    edges: names.map((name) => ({
      id: `${ITEM_NODE_ID}->${dependencyNodeId(name)}`,
      source: ITEM_NODE_ID,
      target: dependencyNodeId(name),
    })),
  };
};
