import type { DependencyFacts } from "../../items/models/catalogue";

export type { DependencyFacts };

/**
 * A dependency as the registry sees it, for the canvas (feature 031): its facts, or null if it
 * isn't published, and what 013's checks would say about it when the draft is submitted.
 */
export type DependencyReport = { facts: DependencyFacts | null; problems: string[] };

/** The most dependencies one request reports on; the canvas asks again for the rest. */
export const DEPENDENCY_REPORTS_MAX = 50;

/** A published item the picker offers: its name and the catalogue's facts. */
export type PickerEntry = DependencyFacts & { name: string };

export type PickerPage = { entries: PickerEntry[]; nextCursor: string | null };

/** How many items the picker shows at a time. */
export const PICKER_PAGE_SIZE = 12;
