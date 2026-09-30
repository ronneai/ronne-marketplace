"use client";

import "@xyflow/react/dist/base.css";
import "./canvas.css";
import {
  applyNodeChanges,
  Background,
  MiniMap,
  type NodeChange,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FlowNode, nodeTypes } from "./nodes";
import type { ComposerEdge, ComposerNode, Position } from "./types";

/** The mini-map shows once the set is large enough to get lost in. */
export const MINIMAP_FROM = 8;

/** Fit to view never zooms in past life size: a few nodes stay readable, not huge. */
export const FIT = { padding: 0.08, maxZoom: 1 } as const;

/** What React Flow keeps about a node that the manifest and the layout don't say. */
type Held = Pick<FlowNode, "selected" | "dragging" | "measured"> & { position?: Position };

const describe = (node: ComposerNode) =>
  node.type === "item"
    ? `${node.data.name}, this ${node.data.type}`
    : `${node.data.name}, ${node.data.facts?.type ?? "dependency"}, range ${node.data.range || "empty"}`;

/** The model's nodes with what React Flow holds: a node follows the pointer only while dragged. */
const withHeld = (nodes: readonly ComposerNode[], held: ReadonlyMap<string, Held>): FlowNode[] =>
  nodes.map((node) => {
    const { position, ...rest } = held.get(node.id) ?? {};
    return {
      ...node,
      ...rest,
      position: position ?? node.position,
      ariaLabel: describe(node),
      // The draft's node stays in the centre.
      ...(node.type === "item" ? { draggable: false } : {}),
    } as FlowNode;
  });

const controlClasses =
  "inline-flex size-8 items-center justify-center rounded-control border border-strong bg-surface text-fg hover:border-accent outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

const Controls = () => {
  const flow = useReactFlow();
  return (
    <Panel position="bottom-left" className="flex gap-1">
      <button
        type="button"
        aria-label="Zoom in"
        className={controlClasses}
        onClick={() => void flow.zoomIn()}
      >
        <ZoomIn size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        className={controlClasses}
        onClick={() => void flow.zoomOut()}
      >
        <ZoomOut size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Fit to view"
        className={controlClasses}
        onClick={() => void flow.fitView(FIT)}
      >
        <Maximize size={16} aria-hidden="true" />
      </button>
    </Panel>
  );
};

/**
 * Fits the view while the canvas opens: the nodes grow as the catalogue answers, and each new size
 * is fitted again. After that the view is the author's, and only Fit to view changes it.
 */
const FitWhileOpening = ({ opening, sizes }: { opening: boolean; sizes: string }) => {
  const flow = useReactFlow();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `sizes` is what it reacts to.
  useEffect(() => {
    if (opening) void flow.fitView(FIT);
  }, [opening, sizes, flow]);
  return null;
};

/**
 * The canvas (feature 031): React Flow drawing the model's nodes and edges. It holds nothing of
 * its own but the selection and a drag in progress; a finished move is handed to `onMove`, and the
 * layout file then says where the node is. Positions are node centres.
 */
export const ComposerCanvas = ({
  nodes: modelNodes,
  edges,
  readOnly,
  settled,
  onMove,
  onRemove,
}: {
  nodes: readonly ComposerNode[];
  edges: readonly ComposerEdge[];
  readOnly: boolean;
  /** The catalogue has answered for every dependency, so the nodes have their final content. */
  settled: boolean;
  onMove: (moved: Record<string, Position>) => void;
  onRemove: (names: readonly string[]) => void;
}) => {
  const [held, setHeld] = useState<ReadonlyMap<string, Held>>(new Map());
  const latest = useRef(modelNodes);
  latest.current = modelNodes;
  const nodes = useMemo(() => withHeld(modelNodes, held), [modelNodes, held]);

  // Opening ends a moment after the last answer, for its sizes to be measured, or as soon as the
  // author pans or zooms.
  const [opening, setOpening] = useState(true);
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setOpening(false), 500);
    return () => clearTimeout(timer);
  }, [settled]);
  const sizes = nodes
    .map((node) => `${node.id}:${node.measured?.width}x${node.measured?.height}`)
    .join(" ");
  const flowEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: "straight",
        selectable: false,
        focusable: false,
        deletable: false,
      })),
    [edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      // A drag that ended, or a move with the arrow keys: the layout file takes it from here.
      const moved: Record<string, Position> = {};
      for (const change of changes) {
        if (change.type !== "position" || change.dragging || !change.position) continue;
        const node = latest.current.find((n) => n.id === change.id);
        if (node?.type !== "dependency") continue;
        const to = { x: Math.round(change.position.x), y: Math.round(change.position.y) };
        if (to.x !== node.position.x || to.y !== node.position.y) moved[node.data.name] = to;
      }
      setHeld(
        (current) =>
          new Map(
            applyNodeChanges(changes, withHeld(latest.current, current)).map((node) => [
              node.id,
              {
                selected: node.selected,
                dragging: node.dragging,
                measured: node.measured,
                position: node.dragging ? node.position : undefined,
              },
            ]),
          ),
      );
      if (Object.keys(moved).length > 0) onMove(moved);
    },
    [onMove],
  );

  /** Delete or Backspace removes the selected dependencies, but only with the focus on the canvas. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || (event.key !== "Delete" && event.key !== "Backspace")) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, button")) return;
    const names = nodes.flatMap((node) =>
      node.selected && node.type === "dependency" ? [node.data.name] : [],
    );
    if (names.length === 0) return;
    event.preventDefault();
    onRemove(names);
  };

  return (
    <ReactFlow
      className="composer-canvas"
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onKeyDown={onKeyDown}
      onMoveStart={(event) => {
        if (event) setOpening(false);
      }}
      nodeOrigin={[0.5, 0.5]}
      nodesDraggable={!readOnly}
      nodesConnectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      fitView
      fitViewOptions={FIT}
      minZoom={0.2}
      maxZoom={1.5}
      ariaLabelConfig={{
        "node.a11yDescription.default": readOnly
          ? "Press enter or space to select a node."
          : "Press enter or space to select a node. You can then move it with the arrow keys, and remove it with delete. Press escape to cancel.",
      }}
    >
      <Background gap={24} />
      <Controls />
      <FitWhileOpening opening={opening} sizes={sizes} />
      {modelNodes.length > MINIMAP_FROM ? (
        <MiniMap pannable zoomable ariaLabel="Mini-map of the canvas" />
      ) : null}
    </ReactFlow>
  );
};
