import type { ItemType } from "@ronneai/core";
import type { DependencyFacts } from "@/server/domains/items/models/catalogue";
import type { PickerEntry, UnreleasedStatus } from "@/server/domains/submissions/models/composer";

/** A catalogue item offered for the canvas, as the draft editor's picker lists it (031, 089). */
export type { DependencyFacts, PickerEntry, UnreleasedStatus };

/**
 * What the registry says about one dependency: its facts, or null if it isn't published, and the
 * problems 013's checks find with it (none on an item page, whose versions passed them).
 */
export type NodeReport = {
  facts: DependencyFacts | null;
  problems: string[];
  /** Warnings from the same checks (112), which don't stop it. */
  warnings?: string[];
  /** One of the person's own on its way (089), shown instead of "not published". */
  status?: UnreleasedStatus | null;
};

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
  /** Warnings (112): shown in amber, and the node stays as it is. */
  warnings?: string[];
  /** One of the person's own on its way (089). */
  status?: UnreleasedStatus | null;
};

/** The canvas's nodes, in the shape React Flow takes: the item in the centre, then its dependencies. */
export type ComposerNode =
  | { id: string; type: "item"; position: Position; data: ItemNodeData }
  | { id: string; type: "dependency"; position: Position; data: DependencyNodeData };

export type ComposerEdge = { id: string; source: string; target: string };
