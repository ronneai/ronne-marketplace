import type { ItemType } from "@ronneai/core";
import { MANIFEST_PATH } from "@/server/domains/submissions/models/submission";
import type { FilesAction } from "../files";
import { LAYOUT_PATH, moveNodes, readLayout, writeLayout } from "./layout";
import { addDependency, readDependencies, removeDependency, setDependencyRange } from "./model";
import type { Position } from "./types";

/** What the canvas reads of the draft: ronne.yaml, and the layout file if there is one. */
export type ComposerFiles = { manifest: string; layout: string | undefined };

/**
 * Each thing the author does on the canvas, as the editor's own file changes (feature 012's
 * reducer): the same path a form edit takes, so unsaved changes, Save and the checks work as they
 * do. A change that leaves a file as it was is no change. Dependencies only touch ronne.yaml, and
 * moves only `.ronne/layout.json`.
 */
export const composerChanges = (files: ComposerFiles, type: ItemType) => {
  const manifest = (after: string): FilesAction[] =>
    after === files.manifest ? [] : [{ type: "edit", path: MANIFEST_PATH, content: after }];
  const layout = (names: readonly string[], moved: Readonly<Record<string, Position>>) => {
    const content = writeLayout(moveNodes(readLayout(files.layout), names, moved));
    return content === files.layout
      ? []
      : [{ type: "put", path: LAYOUT_PATH, encoding: "utf8", content } satisfies FilesAction];
  };
  const names = () => Object.keys(readDependencies(files.manifest) ?? {});
  return {
    /** Adds a dependency; dropped on the canvas, it stays where it was dropped. */
    add: (name: string, range: string, at?: Position): FilesAction[] => {
      const after = addDependency(files.manifest, name, range);
      if (readDependencies(after) === null) return [];
      return [...manifest(after), ...(at ? layout([...names(), name], { [name]: at }) : [])];
    },
    setRange: (name: string, range: string): FilesAction[] =>
      manifest(setDependencyRange(files.manifest, name, range)),
    remove: (removed: readonly string[]): FilesAction[] =>
      manifest(removed.reduce((text, name) => removeDependency(text, name, type), files.manifest)),
    move: (moved: Readonly<Record<string, Position>>): FilesAction[] => layout(names(), moved),
  };
};
