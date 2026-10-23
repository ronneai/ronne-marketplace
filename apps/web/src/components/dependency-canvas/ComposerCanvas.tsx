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
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRAG_TYPE, readDragged } from "./drag";
import { type FlowNode, nodeTypes } from "./nodes";
import type { ComposerEdge, ComposerNode, PickerEntry, Position } from "./types";

/** The mini-map shows once the set is large enough to get lost in. */
export const MINIMAP_FROM = 8;

/** Fit to view never zooms in past life size: a few nodes stay readable, not huge. */
export const FIT = { padding: 0.08, maxZoom: 1 } as const;

/** What React Flow keeps about a node that the manifest and the layout don't say. */
type Held = Pick<FlowNode, "selected" | "dragging" | "measured"> & { position?: Position };

/** A node as a screen reader names it: "@team/fmt, this skill", "@team/git, mcp-server, range ^1.0.0". */
type Describe = (node: ComposerNode) => string;

export const useDescribe = (): Describe => {
  const t = useTranslations("author.canvas");
  // The same function while the language is, so the nodes aren't rebuilt on every render.
  return useMemo<Describe>(
    () => (node) =>
      node.type === "item"
        ? t("itemNode", { name: node.data.name, type: node.data.type })
        : t("dependencyNode", {
            name: node.data.name,
            type: node.data.facts?.type ?? t("dependencyWord"),
            range: node.data.range || t("emptyRange"),
          }),
    [t],
  );
};

/**
 * What React Flow says to screen readers, in the person's language (131): how to select and move
 * a node, and where it moved. Its other defaults name controls this canvas doesn't use. React Flow
 * takes these in an effect, so the server's markup has its English defaults until the page loads.
 */
export const useAriaLabels = (readOnly: boolean) => {
  const t = useTranslations("author.canvas");
  return useMemo(
    () => ({
      "node.a11yDescription.default": t(readOnly ? "nodeHelpReadOnly" : "nodeHelp"),
      "node.a11yDescription.keyboardDisabled": t("nodeHelpReadOnly"),
      "node.a11yDescription.ariaLiveMessage": ({
        direction,
        x,
        y,
      }: {
        direction: string;
        x: number;
        y: number;
      }) => t("moved", { direction, x, y }),
      "edge.a11yDescription.default": t("edgeHelp"),
      "minimap.ariaLabel": t("minimap"),
      "handle.ariaLabel": t("handle"),
    }),
    [t, readOnly],
  );
};

/** The model's nodes with what React Flow holds: a node follows the pointer only while dragged. */
const withHeld = (
  nodes: readonly ComposerNode[],
  held: ReadonlyMap<string, Held>,
  describe: Describe,
): FlowNode[] =>
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
  const t = useTranslations("author.canvas");
  const flow = useReactFlow();
  return (
    <Panel position="bottom-left" className="flex gap-1">
      <button
        type="button"
        aria-label={t("zoomIn")}
        className={controlClasses}
        onClick={() => void flow.zoomIn()}
      >
        <ZoomIn size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t("zoomOut")}
        className={controlClasses}
        onClick={() => void flow.zoomOut()}
      >
        <ZoomOut size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t("fit")}
        className={controlClasses}
        onClick={() => void flow.fitView(FIT)}
      >
        <Maximize size={16} aria-hidden="true" />
      </button>
    </Panel>
  );
};

/**
 * Fits the view while the canvas opens, and after a dependency is added with its button: the nodes
 * grow as the catalogue answers, and each new size is fitted again. Otherwise the view is the
 * author's, and only Fit to view changes it.
 */
const FitWhile = ({ fitting, sizes }: { fitting: boolean; sizes: string }) => {
  const flow = useReactFlow();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `sizes` is what it reacts to.
  useEffect(() => {
    if (fitting) void flow.fitView(FIT);
  }, [fitting, sizes, flow]);
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
  fitSignal = 0,
  onMove,
  onRemove,
  onDropEntry,
}: {
  nodes: readonly ComposerNode[];
  edges: readonly ComposerEdge[];
  readOnly: boolean;
  /** The catalogue has answered for every dependency, so the nodes have their final content. */
  settled: boolean;
  /** Changes when the view should be fitted again: a dependency was added with its button. */
  fitSignal?: number;
  onMove: (moved: Record<string, Position>) => void;
  onRemove: (names: readonly string[]) => void;
  /** A picker result dropped on the canvas, and where: its node's centre. */
  onDropEntry?: (entry: PickerEntry, at: Position) => void;
}) => {
  const t = useTranslations("author.canvas");
  const describe = useDescribe();
  const ariaLabels = useAriaLabels(readOnly);
  const [held, setHeld] = useState<ReadonlyMap<string, Held>>(new Map());
  const latest = useRef(modelNodes);
  latest.current = modelNodes;
  const nodes = useMemo(() => withHeld(modelNodes, held, describe), [modelNodes, held, describe]);

  // Fitting ends a moment after the last answer, for its sizes to be measured, or as soon as the
  // author pans or zooms.
  const [fitting, setFitting] = useState(true);
  const fitted = useRef(fitSignal);
  useEffect(() => {
    if (fitSignal !== fitted.current) {
      fitted.current = fitSignal;
      setFitting(true);
    }
    if (!settled) return;
    const timer = setTimeout(() => setFitting(false), 500);
    return () => clearTimeout(timer);
  }, [settled, fitSignal]);
  const toFlowPosition = useRef<ReactFlowInstance["screenToFlowPosition"] | null>(null);
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
            applyNodeChanges(changes, withHeld(latest.current, current, describe)).map((node) => [
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
    [onMove, describe],
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
        if (event) setFitting(false);
      }}
      onInit={(instance) => {
        toFlowPosition.current = instance.screenToFlowPosition;
      }}
      onDragOver={(event) => {
        if (readOnly || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const entry = readDragged(event);
        if (readOnly || !entry || !toFlowPosition.current) return;
        event.preventDefault();
        onDropEntry?.(entry, toFlowPosition.current({ x: event.clientX, y: event.clientY }));
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
      ariaLabelConfig={ariaLabels}
    >
      <Background gap={24} />
      <Controls />
      <FitWhile fitting={fitting} sizes={sizes} />
      {modelNodes.length > MINIMAP_FROM ? (
        <MiniMap pannable zoomable ariaLabel={t("minimap")} />
      ) : null}
    </ReactFlow>
  );
};
