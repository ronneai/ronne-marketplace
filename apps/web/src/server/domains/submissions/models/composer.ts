import type { DependencyFacts } from "../../items/models/catalogue";

export type { DependencyFacts };

/**
 * A dependency as the registry sees it, for the canvas (feature 031): its facts, or null if it
 * isn't published, and what 013's checks would say about it when the draft is submitted.
 */
export type DependencyReport = {
  facts: DependencyFacts | null;
  /** What would stop it: errors. */
  problems: string[];
  /** What to know, which doesn't stop it (112): it goes with this item, they need each other. */
  warnings?: string[];
  /** For one that isn't published: the person's own submission's status, if it's theirs (089). */
  status?: UnreleasedStatus | null;
};

/** Where one of the person's own items is on its way (089): drafts and open submissions. */
export type UnreleasedStatus = "draft" | "submitted" | "changes_requested" | "approved";

/** The most dependencies one request reports on; the canvas asks again for the rest. */
export const DEPENDENCY_REPORTS_MAX = 50;

/**
 * An item the picker offers (031, 089): its name and the catalogue's facts. Published items are
 * anyone's; unreleased ones are the person's own, with their status, `1.0.0` (their first release)
 * as the version, and no tools yet.
 */
export type PickerEntry = DependencyFacts & {
  name: string;
  status: "published" | UnreleasedStatus;
  mine: boolean;
};

export type PickerPage = { entries: PickerEntry[]; nextCursor: string | null };

/** How many items the picker shows at a time. */
export const PICKER_PAGE_SIZE = 12;
