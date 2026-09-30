import type { ItemType } from "@ronneai/core";
import type {
  DependencyFacts,
  DependencyReport,
  PickerEntry,
} from "@/server/domains/submissions/models/composer";

export type { DependencyFacts, DependencyReport, PickerEntry };

export type Position = { x: number; y: number };

/** Where the author put each dependency's node, by `@scope/name` (`.ronne/layout.json`). */
export type Layout = Readonly<Record<string, Position>>;

export type ItemNodeData = { name: string; type: ItemType };

export type DependencyNodeData = {
  name: string;
  range: string;
  /** From the catalogue: null if it isn't published, undefined until the registry has answered. */
  facts: DependencyFacts | null | undefined;
  problems: string[];
};

/** The canvas's nodes, in the shape React Flow takes: the draft in the centre, then its dependencies. */
export type ComposerNode =
  | { id: string; type: "item"; position: Position; data: ItemNodeData }
  | { id: string; type: "dependency"; position: Position; data: DependencyNodeData };

export type ComposerEdge = { id: string; source: string; target: string };
