import type { DragEvent } from "react";
import type { PickerEntry } from "./types";

/** What a picker result carries while it's dragged onto the canvas. */
export const DRAG_TYPE = "application/x-ronne-dependency";

export const startDrag = (event: DragEvent, entry: PickerEntry) => {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(entry));
  event.dataTransfer.setData("text/plain", entry.name);
  event.dataTransfer.effectAllowed = "copy";
};

/** The dragged result, or null for anything else dropped on the canvas. */
export const readDragged = (event: DragEvent): PickerEntry | null => {
  try {
    const entry = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as PickerEntry;
    return typeof entry?.name === "string" && typeof entry.version === "string" ? entry : null;
  } catch {
    return null;
  }
};
