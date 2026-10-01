"use client";

import type { ItemType } from "@ronneai/core";
import { ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";
import { ComposerCanvas } from "@/components/dependency-canvas/ComposerCanvas";
import { type ComposerActions, ComposerContext } from "@/components/dependency-canvas/context";
import { toGraph } from "@/components/dependency-canvas/graph";
import type { DependencyFacts, NodeReport } from "@/components/dependency-canvas/types";
import { dependencyHref } from "./links";

const ignore = () => {};

const VIEW: ComposerActions = {
  readOnly: true,
  setRange: ignore,
  remove: ignore,
  hrefOf: dependencyHref,
};

/**
 * 031's canvas, read-only (044): the item in the centre and its direct dependencies around it, on
 * the default ring (released versions carry no layout). Nothing moves; each name links to its page.
 */
export const DependencyCanvas = ({
  itemName,
  type,
  dependencies,
  facts,
}: {
  itemName: string;
  type: ItemType;
  dependencies: Readonly<Record<string, string>>;
  /** The catalogue's facts by name; a dependency without any isn't listed any more. */
  facts: Readonly<Record<string, DependencyFacts>>;
}) => {
  const { nodes, edges } = useMemo(() => {
    const reports: Record<string, NodeReport> = {};
    for (const name of Object.keys(dependencies))
      reports[name] = {
        facts: Object.hasOwn(facts, name) ? (facts[name] ?? null) : null,
        problems: [],
      };
    return toGraph({ itemName, type, dependencies, layout: {}, reports });
  }, [itemName, type, dependencies, facts]);
  return (
    <ReactFlowProvider>
      <ComposerContext value={VIEW}>
        <ComposerCanvas
          nodes={nodes}
          edges={edges}
          readOnly
          settled
          onMove={ignore}
          onRemove={ignore}
        />
      </ComposerContext>
    </ReactFlowProvider>
  );
};
