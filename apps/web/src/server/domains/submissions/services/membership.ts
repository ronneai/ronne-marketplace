import { ForbiddenError } from "../../identity/exceptions/errors";
import { can } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { NotAMemberError } from "../exceptions/errors";

/**
 * Who may write where (091). Reading your own drafts and submissions, and withdrawing them, needs
 * only to be signed in, so a removed member keeps them; creating, editing, proposing and submitting
 * need membership of the scope's workspace (any role), or root.
 */

/** The signed-in user, or ForbiddenError. */
export const requireSignedIn = (actor: { user: CurrentUser | null }): CurrentUser => {
  if (!actor.user) throw new ForbiddenError("submissions.create");
  return actor.user;
};

/** Throws NotAMemberError unless the user may submit in the workspace. */
export const requireMember = (
  actor: { user: CurrentUser | null },
  workspace: { id: string; name: string },
  doing?: string,
): CurrentUser => {
  const user = requireSignedIn(actor);
  if (!can(user, "submissions.create", workspace.id))
    throw new NotAMemberError(workspace.name, doing);
  return user;
};
