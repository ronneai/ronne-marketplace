/** The longest message or decline reason on an item move (134), as on a scope move (115). */
export const ITEM_MOVE_TEXT_MAX_LENGTH = 500;

/** Why the new name can't be the item's (134): taken in the target scope, or another item's old name. */
export type ItemMoveClash = "item" | "submission" | "alias";

/**
 * What moving an item to another scope of its workspace would change, and what refuses it (feature
 * 134): the Move dialog shows it, and asking, approving and moving check it again.
 */
export type ItemMoveImpact = {
  item: { id: string; name: string; fullName: string; scopeId: string; workspaceId: string };
  target: { id: string; name: string };
  /** The item's full name in the target scope. */
  newName: string;
  /**
   * Why that name won't do: the target scope has an item with it (`item`), an open submission of a
   * new item with it (`submission`), or it's another item's old name (`alias`, 118).
   */
  clash: ItemMoveClash | null;
  /** The item's own open drafts and change proposals: they take the new name. */
  proposals: number;
  /**
   * Other open work in the workspace that depends on the item, by its item's name: it takes the new
   * name too.
   */
  dependents: string[];
  /** And how many the asker doesn't see: other people's drafts, for anyone but root. */
  dependentsHidden: number;
  /** Moved at once (root, the workspace's moderators and admins) or asked for (anyone else). */
  way: "now" | "request";
  /** Something above refuses the move. */
  refused: boolean;
};

/** A request to move an item, or a move made at once (recorded approved), as the services read it. */
export type ItemMove = {
  id: string;
  itemId: string;
  /** Null once the scope it left is deleted. */
  fromScopeId: string | null;
  toScopeId: string;
  requestedBy: string;
  message: string | null;
  status: "open" | "approved" | "declined" | "cancelled";
  decidedBy: string | null;
  /** Why it was declined (shown to the asker), or why it was cancelled. */
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};
