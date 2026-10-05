import type { ItemType, ManifestIssue } from "@ronneai/core";
import { placeNodes } from "./layout";
import type { ComposerEdge, ComposerNode, Layout, NodeReport } from "./types";

/** The item's own node. Dependencies' ids carry a prefix, so no name can collide with it. */
export const ITEM_NODE_ID = "item";
export const dependencyNodeId = (name: string) => `dependency:${name}`;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 011's problems with one dependency's line: a range that isn't a semver range. */
const rangeProblems = (name: string, issues: readonly ManifestIssue[]): string[] => {
  const pointer = `/dependencies/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
  return issues.filter((issue) => issue.path === pointer).map((issue) => issue.message);
};

/**
 * The canvas for an item's dependencies and a layout: the item in the centre and one node per
 * dependency, each joined to it, in name order. The canvas holds nothing else, so the same inputs
 * always draw the same canvas. `reports` is what the registry said about each dependency (013's
 * checks), and `issues` a draft's own problems (011's), which give a node its range problem.
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
  reports?: Readonly<Record<string, NodeReport | undefined>>;
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
            status: report?.status ?? null,
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
