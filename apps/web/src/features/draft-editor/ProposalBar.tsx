"use client";

import { GitMerge } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileChanges } from "@/components/files/FileViews";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { rebaseAction, resolveConflictAction } from "./actions";
import type { EditorProposal } from "./types";

/**
 * A change proposal in the editor (feature 017): which version it changes, the Rebase button once a
 * newer version is out, and the conflicts a rebase left, each with its diff and Mark resolved.
 * Rebasing reloads the files, so it waits until the editor's changes are saved.
 */
export const ProposalBar = ({
  draftId,
  proposal,
  status,
  dirty,
}: {
  draftId: string;
  proposal: EditorProposal;
  status: string;
  dirty: boolean;
}) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) return setError(result.error);
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <Notice
        kind={proposal.stale ? "warn" : "info"}
        title={
          proposal.stale
            ? `${proposal.stale} has been released since this proposal started.`
            : `A change to ${proposal.itemName} ${proposal.baseVersion}.`
        }
      >
        <div className="grid gap-2">
          <p>
            {proposal.stale ? (
              <>
                It changes {proposal.baseVersion}. Rebasing brings in what {proposal.stale} changed:
                files you didn't touch take {proposal.stale}&apos;s, and files you both changed stay
                yours, listed below to compare.
                {status === "submitted" || status === "approved"
                  ? " It goes back to changes requested, to be reviewed again."
                  : ""}
              </>
            ) : (
              <>
                Its scope, name and type are the item&apos;s. Releasing it publishes the item&apos;s
                next version.
              </>
            )}{" "}
            <Link href={proposal.baseHref} className="underline underline-offset-2">
              See {proposal.baseVersion}
            </Link>
          </p>
          {proposal.stale && proposal.canRebase ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                loading={pending}
                disabled={dirty}
                onClick={() => run(() => rebaseAction(draftId))}
              >
                <GitMerge size={16} aria-hidden="true" />
                Rebase onto {proposal.stale}
              </Button>
              {dirty ? <span className="text-xs">Save your changes first.</span> : null}
            </div>
          ) : null}
        </div>
      </Notice>

      {proposal.conflicts.length > 0 ? (
        <section
          aria-labelledby="conflicts"
          className="grid gap-2 rounded-panel border border-warning/40 bg-warning-subtle p-4 text-sm"
        >
          <h2 id="conflicts" className="font-semibold text-warning-text">
            Conflicts ({proposal.conflicts.length})
          </h2>
          <p className="text-fg">
            You and {proposal.baseVersion} both changed these files. They kept your version: compare
            it with {proposal.baseVersion}&apos;s, fix it in the editor, save, then mark it
            resolved. Submitting waits until none is left.
          </p>
          <ul className="grid gap-2">
            {proposal.conflicts.map((conflict) => (
              <li key={conflict.path} className="rounded-control border border-hairline bg-surface">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-mono text-sm text-fg">{conflict.path}</span>
                    <span className="text-xs text-muted">Compare with {proposal.baseVersion}</span>
                  </summary>
                  <div className="border-t border-hairline p-3">
                    {conflict.change ? (
                      <FileChanges
                        changes={[conflict.change]}
                        since={null}
                        emptyText="It's the same as the base version now."
                      />
                    ) : (
                      <p className="text-sm text-muted">
                        {proposal.baseVersion}&apos;s files couldn&apos;t be read, so there&apos;s
                        nothing to compare with.
                      </p>
                    )}
                  </div>
                </details>
                {proposal.canResolve ? (
                  <div className="flex justify-end border-t border-hairline px-3 py-2">
                    <Button
                      variant="ghost"
                      loading={pending}
                      disabled={dirty}
                      onClick={() => run(() => resolveConflictAction(draftId, conflict.path))}
                    >
                      Mark resolved
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <FieldError id="proposal-error">{error}</FieldError>
    </div>
  );
};
