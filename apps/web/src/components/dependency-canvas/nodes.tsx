"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { touchFieldClasses } from "@/components/ui/Field";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { CodeText } from "@/components/validation/IssueList";
import { useComposer } from "./context";
import type { DependencyNodeData, ItemNodeData, UnreleasedStatus } from "./types";

export type ItemFlowNode = Node<ItemNodeData, "item">;
export type DependencyFlowNode = Node<DependencyNodeData, "dependency">;
export type FlowNode = ItemFlowNode | DependencyFlowNode;

/**
 * Edges run from centre to centre, under the nodes, so they meet each node's border wherever the
 * node is. The handles only say where that centre is: nothing connects by hand.
 */
const centre = "!top-1/2 !left-1/2 !size-px !min-h-0 !min-w-0 !border-0 !opacity-0";

/** The draft itself, in the centre: its name and type. */
export const ItemNode = ({ data }: NodeProps<ItemFlowNode>) => (
  <div className="grid w-56 justify-items-center gap-2 rounded-panel border-2 border-accent-strong bg-surface px-4 py-3 text-center">
    <p className="font-mono text-sm font-semibold break-all text-fg">{data.name}</p>
    <Badge tone="accent">{data.type}</Badge>
    <Handle type="source" position={Position.Top} isConnectable={false} className={centre} />
  </div>
);

/** How one of the person's own items on its way reads on a badge (089), as in 056's marks. */
export const unreleasedLabel = (status: UnreleasedStatus): string =>
  status === "draft"
    ? "draft, yours"
    : status === "submitted"
      ? "in review, yours"
      : status === "changes_requested"
        ? "back for changes, yours"
        : "pending release, yours";

/**
 * What the catalogue knows of a dependency, or that it doesn't know it. One of the person's own on
 * its way shows its status (amber, as 056's marks) instead of "not published" (089).
 */
export const DependencyFactsLine = ({
  facts,
  status,
}: {
  facts: DependencyNodeData["facts"];
  status?: DependencyNodeData["status"];
}) =>
  facts === undefined ? (
    <span className="font-mono text-[11px] text-muted">Checking the catalogue…</span>
  ) : facts === null ? (
    status ? (
      <Badge tone="warning">{unreleasedLabel(status)}</Badge>
    ) : (
      <Badge tone="error">not published</Badge>
    )
  ) : (
    <>
      <TypeBadge type={facts.type} />
      <span className="font-mono text-[11px] text-muted">v{facts.version}</span>
    </>
  );

/** A dependency's problems, then its warnings (112), as the Problems list words them. */
export const DependencyProblems = ({
  problems,
  warnings = [],
}: {
  problems: readonly string[];
  warnings?: readonly string[];
}) => (
  <>
    {problems.map((problem) => (
      <p key={problem} className="text-xs text-fg">
        <span className="mr-1.5 font-mono text-[11px] font-semibold text-error-text">ERR:</span>
        <CodeText text={problem} />
      </p>
    ))}
    {warnings.map((warning) => (
      <p key={warning} className="text-xs text-fg">
        <span className="mr-1.5 font-mono text-[11px] font-semibold text-warning-text">WARN:</span>
        <CodeText text={warning} />
      </p>
    ))}
  </>
);

/**
 * The range field, in a node or in the panel. `nodrag` keeps a drag from starting in it. It shows
 * what was typed at once and follows the manifest when that changes: React Flow hands a node its
 * data a moment after the edit, and an input that waited for it would lose the caret's place.
 */
export const RangeField = ({
  name,
  range,
  invalid,
  className,
}: {
  name: string;
  range: string;
  invalid: boolean;
  className?: string;
}) => {
  const { readOnly, setRange } = useComposer();
  const [typed, setTyped] = useState(range);
  const [seen, setSeen] = useState(range);
  if (seen !== range) {
    setSeen(range);
    setTyped(range);
  }
  return (
    <input
      aria-label={`Range of ${name}`}
      value={typed}
      disabled={readOnly}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      placeholder="^1.0.0"
      onChange={(event) => {
        setTyped(event.target.value);
        setRange(name, event.target.value);
      }}
      className={cn(
        "nodrag nopan h-7 w-full min-w-0 rounded-control border border-strong bg-surface px-2 font-mono text-xs text-fg",
        touchFieldClasses,
        "outline-offset-2 focus-visible:border-fg focus-visible:outline-2 focus-visible:outline-focus",
        "aria-invalid:border-error disabled:cursor-not-allowed disabled:border-hairline disabled:bg-canvas disabled:text-muted",
        className,
      )}
    />
  );
};

export const RemoveButton = ({ name }: { name: string }) => {
  const { readOnly, remove } = useComposer();
  return readOnly ? null : (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      onClick={() => remove([name])}
      className="nodrag nopan inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted outline-offset-2 hover:bg-tint hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
    >
      <X size={14} aria-hidden="true" />
    </button>
  );
};

/** A dependency's name, linking to its page where the canvas says where that is. */
const DependencyName = ({ name }: { name: string }) => {
  const { hrefOf } = useComposer();
  const className = "font-mono text-[13px] font-semibold break-all text-fg";
  return hrefOf ? (
    <Link
      href={hrefOf(name)}
      className={cn(
        className,
        "nodrag nopan underline underline-offset-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
      )}
    >
      {name}
    </Link>
  ) : (
    <p className={className}>{name}</p>
  );
};

/**
 * One dependency: its name, what the catalogue says of it (type, listed version, description, the
 * tools it works in), its range, and its problems, which are the ones the checks report.
 */
export const DependencyNode = ({ data, selected }: NodeProps<DependencyFlowNode>) => (
  <div
    className={cn(
      "grid w-60 gap-2 rounded-panel border bg-surface p-3",
      data.problems.length > 0
        ? "border-error"
        : selected
          ? "border-accent-strong"
          : "border-strong",
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="grid min-w-0 gap-1.5">
        <DependencyName name={data.name} />
        <div className="flex flex-wrap items-center gap-1.5">
          <DependencyFactsLine facts={data.facts} status={data.status} />
        </div>
      </div>
      <RemoveButton name={data.name} />
    </div>
    {data.facts?.description ? (
      <p className="line-clamp-2 text-xs text-fg">{data.facts.description}</p>
    ) : null}
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="font-mono text-[11px] text-muted">
        range
      </span>
      <RangeField name={data.name} range={data.range} invalid={data.problems.length > 0} />
    </div>
    {data.facts ? (
      <p className="font-mono text-[11px] text-muted">
        {data.facts.tools.length > 0
          ? `works in ${data.facts.tools.join(", ")}`
          : "works in no built-in tool"}
      </p>
    ) : null}
    <DependencyProblems problems={data.problems} warnings={data.warnings} />
    <Handle type="target" position={Position.Top} isConnectable={false} className={centre} />
  </div>
);

export const nodeTypes = { item: ItemNode, dependency: DependencyNode };
