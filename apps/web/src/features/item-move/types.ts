import type { ItemMoveImpact } from "@/server/domains/workspaces/models/item-move";

/** What moving to a scope would change (134), or why it couldn't be read. */
export type ItemMoveImpactResult = ItemMoveImpact | { error: string };

/** What the Move dialog's last submit answered (134). */
export type ItemMoveActionState = {
  done?: "moved" | "requested";
  /** The item's name now, once moved. */
  newName?: string;
  error?: string;
  /** The checks found the name taken since the dialog read them. */
  refused?: ItemMoveImpact;
};

/** What Cancel on the item page's notice answered (134). */
export type ItemMoveCancelState = { done?: true; error?: string };
