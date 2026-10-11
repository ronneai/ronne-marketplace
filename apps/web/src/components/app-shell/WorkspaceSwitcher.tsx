"use client";

import { ArrowRight, Building2, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { DismissibleDetails } from "./DismissibleDetails";
import type { ShellWorkspace } from "./nav";

const option =
  "flex min-h-9 pointer-coarse:min-h-11 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-sm text-fg hover:bg-tint outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * The workspace switcher (119): it shows your personal workspace (114), and opened, lists the
 * workspaces you're a member of, each opening its page, then All workspaces. It jumps, it doesn't
 * filter: there is no current workspace (owner, 2026-10-11). A native <details>, so it works
 * without JavaScript. In the folded rail it's an icon, and the list opens to its right.
 */
export const WorkspaceSwitcher = ({
  workspaces,
  folded = false,
}: {
  workspaces: ShellWorkspace[];
  folded?: boolean;
}) => {
  const personal = workspaces.find((w) => w.personal);
  const title = personal ? `${personal.name} (personal workspace)` : "Workspaces";
  return (
    <DismissibleDetails className="relative">
      <summary
        aria-label={folded ? `Workspaces: ${title}` : undefined}
        title={title}
        className={`flex cursor-pointer list-none items-center rounded-control border border-hairline bg-surface text-fg hover:border-strong outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden ${folded ? "size-10 justify-center" : "min-h-11 w-full justify-between gap-2 px-3 py-1.5 text-left"}`}
      >
        {folded ? (
          <Building2 size={18} aria-hidden />
        ) : (
          <>
            <span className="grid min-w-0">
              <span className="truncate text-sm font-semibold">
                {personal?.name ?? "Workspaces"}
              </span>
              {personal ? (
                <span className="truncate font-mono text-xs text-muted">Personal workspace</span>
              ) : null}
            </span>
            <ChevronsUpDown size={16} aria-hidden className="shrink-0 text-muted" />
          </>
        )}
      </summary>
      <div
        className={`absolute z-40 grid gap-0.5 rounded-panel border border-strong bg-surface p-1 ${folded ? "top-0 left-full ml-2 w-64" : "inset-x-0 top-full mt-1"}`}
      >
        <p className="px-3 pt-1.5 pb-1 font-mono text-xs uppercase text-muted">Your workspaces</p>
        {workspaces.map((w) => (
          <Link
            key={w.name}
            href={`/workspaces/${encodeURIComponent(w.name)}`}
            title={w.name}
            className={option}
          >
            <span className="truncate">{w.name}</span>
            <span className="shrink-0 font-mono text-xs text-muted">
              {w.personal ? "personal" : w.role}
            </span>
          </Link>
        ))}
        <Link href="/workspaces" className={`${option} border-t border-hairline`}>
          All workspaces
          <ArrowRight size={14} aria-hidden className="shrink-0 text-muted" />
        </Link>
      </div>
    </DismissibleDetails>
  );
};
