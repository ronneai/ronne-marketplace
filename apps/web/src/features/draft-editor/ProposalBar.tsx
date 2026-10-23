"use client";

import { GitMerge } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("author.editor.proposal");
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
            ? t("staleTitle", { stale: proposal.stale })
            : t("title", { item: proposal.itemName, version: proposal.baseVersion })
        }
      >
        <div className="grid gap-2">
          <p>
            {proposal.stale
              ? t(status === "submitted" || status === "approved" ? "staleReview" : "stale", {
                  version: proposal.baseVersion,
                  stale: proposal.stale,
                })
              : t("fresh")}{" "}
            <Link href={proposal.baseHref} className="underline underline-offset-2">
              {t("see", { version: proposal.baseVersion })}
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
                {t("rebase", { stale: proposal.stale })}
              </Button>
              {dirty ? <span className="text-xs">{t("saveFirst")}</span> : null}
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
            {t("conflicts", { count: proposal.conflicts.length })}
          </h2>
          <p className="text-fg">{t("conflictsText", { version: proposal.baseVersion })}</p>
          <ul className="grid gap-2">
            {proposal.conflicts.map((conflict) => (
              <li key={conflict.path} className="rounded-control border border-hairline bg-surface">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-mono text-sm text-fg">{conflict.path}</span>
                    <span className="text-xs text-muted">
                      {t("compare", { version: proposal.baseVersion })}
                    </span>
                  </summary>
                  <div className="border-t border-hairline p-3">
                    {conflict.change ? (
                      <FileChanges changes={[conflict.change]} since={null} emptyText={t("same")} />
                    ) : (
                      <p className="text-sm text-muted">
                        {t("unreadable", { version: proposal.baseVersion })}
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
                      {t("resolve")}
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
