import { Lock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

/**
 * Where an item lives (115, owner): its workspace, linking to the workspace's page, and its scope.
 * Its full name only says the workspace outside `global` (118), so a card and the item page say
 * both, always. A personal workspace (114) says so; a private one (093) has a lock, since only its
 * members and root see the item.
 */
export const ItemPlace = ({
  workspace,
  scope,
  privateWorkspace,
  personalWorkspace,
  className,
}: {
  workspace: string;
  scope: string;
  privateWorkspace: boolean;
  personalWorkspace: boolean;
  className?: string;
}) => (
  <p
    className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted", className)}
  >
    <span>Workspace</span>
    <Link
      href={`/workspaces/${encodeURIComponent(workspace)}`}
      className="min-w-0 font-mono text-fg [overflow-wrap:anywhere] hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {workspace}
    </Link>
    {personalWorkspace ? (
      <span title="Only its owner and root see this item.">(personal)</span>
    ) : privateWorkspace ? (
      <span title={`Only ${workspace}'s members and root see this item.`}>
        <Lock aria-hidden="true" className="mr-0.5 inline size-3 align-[-1px]" />
        Private
      </span>
    ) : null}
    <span aria-hidden="true">·</span>
    <span>Scope</span>
    <span className="min-w-0 font-mono text-fg [overflow-wrap:anywhere]">@{scope}</span>
  </p>
);
