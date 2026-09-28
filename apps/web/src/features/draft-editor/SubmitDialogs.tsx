"use client";

import { hasErrors } from "@ronneai/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { IssueList } from "@/components/validation/IssueList";
import { checkSubmissionAction, submitDraftAction, withdrawAction } from "./actions";
import type { SubmitResult } from "./types";

/**
 * Submit for review (feature 013). It first runs every check on the saved files, 011's and the
 * registry's, and lists the results; Submit is only offered when there are no errors. Unsaved
 * changes have to be saved first: the server only checks what's saved.
 */
export const SubmitDialog = ({
  resubmit = false,
  draftId,
  itemName,
  dirty,
  onClose,
}: {
  /** Sent back for changes (014): the same checks, then the next revision. */
  resubmit?: boolean;
  draftId: string;
  itemName: string;
  dirty: boolean;
  onClose: () => void;
}) => {
  const router = useRouter();
  const [result, setResult] = useState<SubmitResult | null>(null);
  const label = resubmit ? "Resubmit for review" : "Submit for review";
  const [checking, startCheck] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (dirty) return;
    startCheck(async () => setResult(await checkSubmissionAction(draftId)));
  }, [dirty, draftId]);

  const blocked = !result?.ok || hasErrors(result.issues);

  return (
    <Dialog open onClose={onClose} title={label}>
      {dirty ? (
        <div className="grid gap-4">
          <p className="text-sm text-fg">
            Save your changes first: the checks, and the reviewers, see what's saved.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {checking || !result ? (
            <p role="status" className="text-sm text-muted">
              Checking {itemName}…
            </p>
          ) : !result.ok && result.issues.length === 0 ? (
            <FieldError id="submit-error">{result.error}</FieldError>
          ) : hasErrors(result.issues) ? (
            <div className="grid gap-2">
              <p className="text-sm text-fg">
                {result.ok ? "Fix these before submitting:" : result.error}
              </p>
              <IssueList issues={result.issues} />
            </div>
          ) : (
            <div className="grid gap-2">
              <p role="status" className="text-sm text-fg">
                <span className="mr-2 font-mono text-xs font-semibold">OK:</span>
                All checks passed.
              </p>
              {result.issues.length > 0 ? <IssueList issues={result.issues} /> : null}
              <p className="text-sm text-muted">
                Once submitted, its files are frozen: reviewers see exactly these. You can withdraw
                it until it's approved.
              </p>
              <Help id="after-submit" />
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={blocked || checking}
              loading={submitting}
              onClick={() =>
                startSubmit(async () => {
                  const submitted = await submitDraftAction(draftId);
                  if (!submitted.ok) return setResult(submitted);
                  onClose();
                  router.refresh();
                })
              }
            >
              {label}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

/** Withdraw (feature 013): final, so it asks first. */
export const WithdrawDialog = ({
  draftId,
  itemName,
  onClose,
}: {
  draftId: string;
  itemName: string;
  onClose: () => void;
}) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={`Withdraw ${itemName}?`}>
      <div className="grid gap-4">
        <p className="text-sm text-fg">
          It can't be undone. It stays in My submissions, read-only, and you can start a new draft.
        </p>
        <FieldError id="withdraw-error">{error}</FieldError>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              start(async () => {
                const result = await withdrawAction(draftId);
                if (!result.ok) return setError(result.error);
                onClose();
                router.refresh();
              })
            }
          >
            Withdraw
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
