import type { ItemType } from "@ronneai/core";

export type Position = { x: number; y: number };

/** Where the author put each dependency's node, by `@scope/name` (`.ronne/layout.json`). */
export type Layout = Readonly<Record<string, Position>>;

/** What the catalogue says about a published item (018), with the tools it works in (026). */
export type DependencyFacts = {
  type: ItemType;
  /** The listed version: `latest`'s, else the newest release. */
  version: string;
  description: string;
  /** The AI tools it installs in, by name. */
  tools: string[];
};

/** A dependency as the registry sees it: its facts, or null if it isn't published, and 013's problems. */
export type DependencyReport = { facts: DependencyFacts | null; problems: string[] };

export type ItemNodeData = { name: string; type: ItemType };

export type DependencyNodeData = {
  name: string;
  range: string;
  /** Undefined until the registry has answered. */
  facts: DependencyFacts | null | undefined;
  problems: string[];
};

/** The canvas's nodes, in the shape React Flow takes: the draft in the centre, then its dependencies. */
export type ComposerNode =
  | { id: string; type: "item"; position: Position; data: ItemNodeData }
  | { id: string; type: "dependency"; position: Position; data: DependencyNodeData };

export type ComposerEdge = { id: string; source: string; target: string };
