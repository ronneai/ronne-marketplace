import type { ShelfEntry } from "@/server/domains/shelves/actions/pins";

/** What a pin action answers (feature 125): the shelf as it is now, or why it didn't work. */
export type ShelfResult =
  | { ok: true; entries: ShelfEntry[]; max: number }
  | { ok: false; error: string };

/** A shelf in the Pin menu, as the client gets it: the key names the shelf in the actions. */
export type PinTargetView = {
  key: string;
  /** The workspace's name; null for Start here. */
  workspace: string | null;
  pinned: boolean;
  blocked: "private" | null;
};
