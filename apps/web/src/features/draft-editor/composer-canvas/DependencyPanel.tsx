"use client";

import type { ItemType } from "@ronneai/core";
import { useComposer } from "@/components/dependency-canvas/context";
import {
  DependencyFactsLine,
  DependencyProblems,
  RangeField,
  RemoveButton,
} from "@/components/dependency-canvas/nodes";
import { Help } from "@/components/help/Help";
import { Notice } from "@/components/ui/Notice";
import type { ComposerNode } from "./types";

/**
 * Every dependency as a list, under the canvas: the same ranges, problems and removal, in name
 * order, so the whole canvas can be read and changed without a pointer. A name shows its node.
 */
export const DependencyPanel = ({
  type,
  nodes,
  failed,
  wide = false,
  onShow,
}: {
  type: ItemType;
  nodes: readonly ComposerNode[];
  /** The registry couldn't be asked about the dependencies. */
  failed: boolean;
  /** The list has the panel's whole width (read-only, without the picker): two columns. */
  wide?: boolean;
  onShow: (id: string) => void;
}) => {
  const { readOnly } = useComposer();
  const dependencies = nodes.flatMap((node) => (node.type === "dependency" ? [node] : []));
  return (
    <aside aria-label="Dependencies" className="grid content-start gap-3">
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-fg">
          Dependencies <span className="font-mono text-xs text-muted">({dependencies.length})</span>
        </h2>
        <p className="text-xs text-muted">
          {type === "bundle" ? "The items this bundle installs." : "Items installed with this one."}
        </p>
        <Help id="canvas" />
      </div>
      {failed ? (
        <Notice kind="warn" title="The catalogue couldn't be reached.">
          The dependencies are shown as ronne.yaml has them; their details come back with the next
          change.
        </Notice>
      ) : null}
      {dependencies.length === 0 ? (
        <p className="text-sm text-muted">
          None yet.{readOnly ? "" : " Add one from the catalogue, or drag it onto the canvas."}
        </p>
      ) : (
        <ul className={wide ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
          {dependencies.map(({ id, data }) => (
            <li
              key={id}
              className="grid content-start gap-1.5 rounded-control border border-hairline p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  title="Show on the canvas"
                  onClick={() => onShow(id)}
                  className="min-w-0 rounded-control text-left font-mono text-xs font-semibold break-all text-fg outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {data.name}
                </button>
                <RemoveButton name={data.name} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <DependencyFactsLine facts={data.facts} status={data.status} />
              </div>
              <RangeField name={data.name} range={data.range} invalid={data.problems.length > 0} />
              <DependencyProblems problems={data.problems} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};
