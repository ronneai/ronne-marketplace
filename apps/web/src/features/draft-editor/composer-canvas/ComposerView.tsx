"use client";

import type { ItemType, ManifestIssue } from "@ronneai/core";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { ComposerCanvas, FIT } from "@/components/dependency-canvas/ComposerCanvas";
import { ComposerContext } from "@/components/dependency-canvas/context";
import { toGraph } from "@/components/dependency-canvas/graph";
import { readLayout } from "@/components/dependency-canvas/layout";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FilesAction } from "../files";
import { CataloguePicker } from "./CataloguePicker";
import { composerChanges } from "./changes";
import { DependencyPanel } from "./DependencyPanel";
import { useDependencyReports } from "./hooks";
import { readDependencies, startingRange } from "./model";
import type { PickerEntry, Position } from "./types";

type Props = {
  itemName: string;
  type: ItemType;
  /** ronne.yaml, and `.ronne/layout.json` if the draft has one. */
  manifest: string;
  layout: string | undefined;
  /** The draft's problems (011), which give a node its range problem. */
  issues: readonly ManifestIssue[];
  readOnly: boolean;
  /** The editor's own file changes, so a canvas edit is an edit like any other. */
  onChange: (actions: FilesAction[]) => void;
  onShowYaml: () => void;
};

const Composer = ({
  itemName,
  type,
  manifest,
  layout: layoutText,
  issues,
  readOnly,
  onChange,
  dependencies,
}: Omit<Props, "onShowYaml"> & { dependencies: Record<string, string> }) => {
  const flow = useReactFlow();
  const layout = useMemo(() => readLayout(layoutText), [layoutText]);
  const { reports, failed } = useDependencyReports(itemName, type, dependencies);
  const { nodes, edges } = useMemo(
    () => toGraph({ itemName, type, dependencies, layout, reports, issues }),
    [itemName, type, dependencies, layout, reports, issues],
  );

  const changes = useMemo(
    () => composerChanges({ manifest, layout: layoutText }, type),
    [manifest, layoutText, type],
  );
  const actions = useMemo(
    () => ({
      readOnly,
      setRange: (name: string, range: string) => onChange(changes.setRange(name, range)),
      remove: (names: readonly string[]) => onChange(changes.remove(names)),
    }),
    [readOnly, changes, onChange],
  );
  const onMove = useCallback(
    (moved: Record<string, Position>) => onChange(changes.move(moved)),
    [changes, onChange],
  );
  // Added with its button, a dependency goes on the ring and the view is fitted to show it;
  // dropped, it stays where it was dropped.
  const [fitSignal, setFitSignal] = useState(0);
  const add = (entry: PickerEntry, at?: Position) => {
    onChange(changes.add(entry.name, startingRange(entry.version), at));
    if (!at) setFitSignal((signal) => signal + 1);
  };
  const added = useMemo(() => new Set(Object.keys(dependencies)), [dependencies]);

  return (
    <ComposerContext value={actions}>
      <div className="grid h-full grid-rows-[minmax(14rem,1fr)_auto]">
        <section aria-label="Canvas" className="min-h-0 min-w-0">
          <ComposerCanvas
            nodes={nodes}
            edges={edges}
            readOnly={readOnly}
            settled={failed || Object.values(reports).every((report) => report !== undefined)}
            fitSignal={fitSignal}
            onMove={onMove}
            onRemove={actions.remove}
            onDropEntry={add}
          />
        </section>
        <div
          className={
            readOnly
              ? "border-t border-hairline bg-surface"
              : "grid border-t border-hairline bg-surface md:grid-cols-2 md:divide-x md:divide-hairline"
          }
        >
          {readOnly ? null : (
            <div className="max-h-44 overflow-y-auto p-3 md:max-h-60">
              <CataloguePicker itemName={itemName} type={type} added={added} onAdd={add} />
            </div>
          )}
          <div className="max-h-44 overflow-y-auto p-3 md:max-h-60">
            <DependencyPanel
              type={type}
              nodes={nodes}
              failed={failed}
              wide={readOnly}
              onShow={(id) => void flow.fitView({ ...FIT, nodes: [{ id }] })}
            />
          </div>
        </div>
      </div>
    </ComposerContext>
  );
};

/**
 * The Canvas view of ronne.yaml (feature 031): the draft and its dependencies as nodes, with a
 * list of them under it. It is only a view over `dependencies`: it reads them from the YAML on
 * every change and writes each edit back through the editor's files, and keeps node positions in
 * `.ronne/layout.json`. While the YAML doesn't parse, it shows nothing to edit.
 */
export const ComposerView = ({ onShowYaml, ...props }: Props) => {
  const dependencies = useMemo(() => readDependencies(props.manifest), [props.manifest]);
  if (!dependencies)
    return (
      <div className="h-full bg-surface">
        <Notice kind="info" title="The canvas needs valid YAML.">
          <div className="grid gap-3">
            <p>
              ronne.yaml has a YAML error. Fix it in the YAML view; the problems below say where.
            </p>
            <div>
              <Button variant="secondary" onClick={onShowYaml}>
                Open the YAML
              </Button>
            </div>
          </div>
        </Notice>
      </div>
    );
  return (
    <ReactFlowProvider>
      <Composer {...props} dependencies={dependencies} />
    </ReactFlowProvider>
  );
};
