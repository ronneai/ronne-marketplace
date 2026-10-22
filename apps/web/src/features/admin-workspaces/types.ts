import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import type { MoveTarget } from "@/server/domains/workspaces/services/scope-moves";

export type WorkspaceActionState = { error?: string; done?: string };

/** What Make private would meet (093), or why it couldn't be read. */
export type VisibilityImpactResult =
  | { dependents: string[]; openDependents: string[]; startHere?: string[] }
  | { error: string };

/** How many items a rename gives the new name (113), or why it couldn't be read. */
export type RenameImpactResult = { items: number } | { error: string };

/** What moving a scope would change and how it would happen (115), or why it couldn't be read. */
export type MoveImpactResult =
  | (MoveImpact & {
      way: "once" | "twice" | "request";
      answeredBy: "root" | "admins" | null;
    })
  | { error: string };

/** Where a scope could move (115), or why they couldn't be read. */
export type MoveTargetsResult = { targets: MoveTarget[] } | { error: string };

/** What a move did (115): moved, asked, refused with what refuses it, or an error. */
export type MoveActionState = {
  done?: "moved" | "requested";
  error?: string;
  refused?: MoveImpact;
};
