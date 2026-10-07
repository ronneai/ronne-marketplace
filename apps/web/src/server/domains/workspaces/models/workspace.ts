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
  /** How many active moderators it has besides root (091); none means only root reviews there. */
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

/** Public only until private workspaces (093). */
export const workspaceVisibilityFrom = (value: string | undefined): WorkspaceVisibility => {
  if (value === undefined || value === "" || value === "public") return "public";
  throw new InvalidWorkspaceVisibilityError();
};
