import type { NameProblem } from "@ronneai/core";
import type { WorkspaceVisibility } from "./workspace";

/**
 * What moving a scope to another workspace would change, and what refuses it (feature 115): the
 * Move dialog shows it, and asking, approving and moving check it again.
 */
export type MoveImpact = {
  scope: { id: string; name: string; workspace: string };
  target: {
    id: string;
    name: string;
    visibility: WorkspaceVisibility;
    global: boolean;
    /** The asker's own personal workspace (114). */
    personal: boolean;
  };
  /** The scope's name in the target: its current one unless renamed for a clash. */
  name: string;
  /** Why that name won't do as a scope's name, if it won't. */
  nameProblem: NameProblem | null;
  /** The target already has a scope with that name. */
  clash: boolean;
  /** Each item's name now and in the target. */
  items: { from: string; to: string }[];
  /** New names that are another item's old name (118), by name when the asker sees that item. */
  aliasTaken: string[];
  /** And how many such items the asker doesn't see. */
  aliasHidden: number;
  /** Released items outside the target that depend on the scope's items (a private target). */
  outsideDependents: string[];
  /** And how many the asker doesn't see. */
  outsideHidden: number;
  /** The scope's own released versions and open submissions that depend on another private workspace. */
  ownDependencies: { item: string; dependency: string }[];
  /** And how many the asker doesn't see (for anyone but root, a name nobody has counts too). */
  ownHidden: number;
  /** Open submissions outside the target that depend on the scope's items (a private target). */
  openDependents: string[];
  /** And how many the asker doesn't see. */
  openHidden: number;
  /** Open work in the scope by people who aren't the target's members: they keep read and withdraw. */
  notMembers: { item: string; author: string }[];
  /** And how many the asker doesn't see: other people's drafts, for anyone but root. */
  notMembersHidden: number;
  /** Released versions not reviewed (114), `@name@version`: someone else has to approve. */
  notReviewed: string[];
  /** Fewer people will see the items: installs by the others stop updating (093). */
  fewerSee: boolean;
  /** Something above refuses the move. */
  refused: boolean;
};

/** A request to move a scope, or a move made at once (recorded approved), as the services read it. */
export type ScopeMove = {
  id: string;
  scopeId: string;
  /** The scope's name now: in the target once moved. */
  scopeName: string;
  fromWorkspaceId: string | null;
  toWorkspaceId: string;
  toWorkspace: string;
  requestedBy: string;
  /** Its name in the target. */
  newName: string;
  message: string | null;
  status: "open" | "approved" | "declined" | "cancelled";
  decidedBy: string | null;
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

/** At most this many characters in a move's message or a decline's reason (as 094's). */
export const SCOPE_MOVE_TEXT_MAX_LENGTH = 500;
