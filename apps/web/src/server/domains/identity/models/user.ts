import { InvalidEmailError, InvalidNameError } from "../exceptions/errors";

/**
 * A user's instance-wide role (`user.role`): root does everything in every workspace; anyone else
 * is a user, whose roles are per workspace (feature 091).
 */
export type Role = "root" | "user";

/**
 * A role in a workspace (`workspace_members.role`, feature 091): user, moderator, or admin (092), a
 * moderator who also runs the workspace: its members, scopes and description.
 */
export type WorkspaceRole = "admin" | "moderator" | "user";

/** Workspace id → the user's role there. A root's rows are kept but ignored for permissions. */
export type Memberships = Readonly<Record<string, WorkspaceRole>>;

/** The signed-in person, as the rest of the app sees them, with their memberships (091). */
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  workspaces: Memberships;
};

const ROLES: readonly Role[] = ["root", "user"];
const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["admin", "moderator", "user"];

export const isRole = (value: unknown): value is Role => {
  return ROLES.includes(value as Role);
};

export const isWorkspaceRole = (value: unknown): value is WorkspaceRole => {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole);
};

/** A user as root's admin list shows them. */
export type UserSummary = {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabledAt: Date | null;
  createdAt: Date;
  /** Its roles per workspace (091), moderated ones first, for the users list; ignored for root. */
  workspaces?: { name: string; role: WorkspaceRole }[];
};

export type RootAccount = { id: string; email: string; name: string; disabledAt: Date | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails are stored trimmed and lowercase, so the unique index works on every database. */
export const normalizeEmail = (email: string): string => {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 255 || !EMAIL.test(normalized)) throw new InvalidEmailError(email);
  return normalized;
};

export const normalizeName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 255) throw new InvalidNameError();
  return trimmed;
};
