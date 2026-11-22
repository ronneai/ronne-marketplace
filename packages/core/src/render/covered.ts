import { targetsFor } from "./helpers.js";
import type { RenderContext, RenderInput, RenderWarning } from "./types.js";

/**
 * Leaving an item to another target of the same install (025, 028): a tool that also reads another
 * tool's copy, as Cursor and Copilot read some of Claude Code's files, writes none of its own when
 * that copy is written too, so the item isn't loaded twice.
 */

/** Whether `target` is a target of this install and the item is offered to it. */
export const alsoTarget = (item: RenderInput, context: RenderContext, target: string): boolean =>
  (context.targets ?? []).includes(target) && targetsFor(item.manifest, target).enabled;

/** Nothing written, and a `covered_by_target` warning saying whose copy the tool reads instead. */
export const covered = (
  item: RenderInput,
  reader: string,
  writer: string,
  where: string,
): { changes: []; warnings: RenderWarning[] } => ({
  changes: [],
  warnings: [
    {
      code: "covered_by_target",
      message: `${reader} reads ${writer}'s copy of ${item.name} (${where}), so no second one was written.`,
    },
  ],
});
