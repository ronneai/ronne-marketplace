import { Lock } from "lucide-react";
import { GLOBAL_WORKSPACE_NAME } from "@/server/domains/workspaces/models/workspace";

/**
 * The workspace before an item's name, quietly, when it isn't `global` (090). A private one's
 * (093) carries a lock and "Private · acme": only its members and root see the item.
 */
export const WorkspaceLabel = ({
  workspace,
  privateWorkspace,
  className,
}: {
  workspace: string;
  privateWorkspace: boolean;
  className: string;
}) => {
  if (!privateWorkspace && workspace === GLOBAL_WORKSPACE_NAME) return null;
  return (
    <span
      className={className}
      title={privateWorkspace ? `Only ${workspace}'s members and root see this item.` : undefined}
    >
      {privateWorkspace ? (
        <>
          <Lock aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
          Private
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
        </>
      ) : null}
      {workspace}
      <span aria-hidden="true"> · </span>
      <span className="sr-only">, </span>
    </span>
  );
};
