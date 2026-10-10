import { Lock } from "lucide-react";

/**
 * "Private" with a lock before the name of an item in a private workspace (093): only its members
 * and root see it. The workspace itself is in the name since 118, so a public one's item has none.
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
  if (!privateWorkspace) return null;
  return (
    <span className={className} title={`Only ${workspace}'s members and root see this item.`}>
      <Lock aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
      Private
      <span aria-hidden="true"> · </span>
      <span className="sr-only">, </span>
    </span>
  );
};
