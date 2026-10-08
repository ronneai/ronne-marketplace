import { nameProblem, normalizeWorkspaceName } from "@ronneai/core";
import {
  InvalidWorkspaceDescriptionError,
  InvalidWorkspaceNameError,
  InvalidWorkspaceVisibilityError,
} from "../exceptions/errors";

export { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";

export type WorkspaceVisibility = "public" | "private";

/**
 * A workspace (feature 090): the level above scopes, workspace › scope › item. Not part of item
 * names: an item's workspace is its scope's. `global` is on every instance and can't change.
 */
export type Workspace = {
  id: string;
  name: string;
  description: string;
  visibility: WorkspaceVisibility;
  isGlobal: boolean;
  /** How many scopes it has. */
  scopes: number;
  /**
   * How many active moderators and admins it has besides root (091, 092); none means only root
   * reviews there.
   */
  moderators: number;
  createdBy: { id: string; email: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
};

export const GLOBAL_WORKSPACE_NAME = "global";
export const WORKSPACE_DESCRIPTION_MAX_LENGTH = 300;

/** What was typed, as a valid workspace name, or InvalidWorkspaceNameError naming the rule. */
export const workspaceNameFrom = (value: string): string => {
  const name = normalizeWorkspaceName(value);
  const problem = nameProblem(name, "workspace");
  if (problem) throw new InvalidWorkspaceNameError(problem);
  return name;
};

export const workspaceDescriptionFrom = (value: string): string => {
  const description = value.trim();
  if (description.length === 0 || [...description].length > WORKSPACE_DESCRIPTION_MAX_LENGTH)
    throw new InvalidWorkspaceDescriptionError();
  return description;
};

/** Exactly "public" or "private" (093): what Make private and Make public send. */
export const visibilityChoice = (value: string | undefined): WorkspaceVisibility => {
  if (value === "public" || value === "private") return value;
  throw new InvalidWorkspaceVisibilityError();
};

/** Public, unless private is asked for (093); public when nothing is said, as when creating. */
export const workspaceVisibilityFrom = (value: string | undefined): WorkspaceVisibility => {
  if (value === undefined || value === "" || value === "public") return "public";
  if (value === "private") return "private";
  throw new InvalidWorkspaceVisibilityError();
};
