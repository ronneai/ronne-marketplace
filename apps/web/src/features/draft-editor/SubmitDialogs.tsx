"use client";

import { hasErrors } from "@ronneai/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { IssueList } from "@/components/validation/IssueList";
import {
  checkSubmissionAction,
  deleteSubmissionAction,
  restoreAction,
  submitDraftAction,
  withdrawAction,
} from "./actions";
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
                it until it's released.
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

/** The reason Delete for good is unavailable (057), as the service words it. */
export const REVIEW_HISTORY_REASON =
  "Reviewers have commented on it or decided it. Archive it instead.";

const CHOICES = {
  archive: {
    label: "Archive",
    text: "It leaves review and My submissions' list. Find it under Archived, where you can restore it as a draft.",
  },
  delete: {
    label: "Delete for good",
    text: "It's removed with its files and history. This can't be undone.",
  },
} as const;

/** Withdraw (013): archive it, or delete it for good when no reviewer took part (057). */
export const WithdrawDialog = ({
  draftId,
  itemName,
  dependents = 0,
  canDelete = false,
  onClose,
}: {
  draftId: string;
  itemName: string;
  /** Open submissions that depend on it (056): they're blocked once it's withdrawn. */
  dependents?: number;
  canDelete?: boolean;
  onClose: () => void;
}) => {
  const router = useRouter();
  const [mode, setMode] = useState<"archive" | "delete">("archive");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={`Withdraw ${itemName}?`}>
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="sr-only">What to do with it</legend>
          {(["archive", "delete"] as const).map((value) => {
            const disabled = value === "delete" && !canDelete;
            return (
              <label
                key={value}
                className={`grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-control border p-3 text-sm ${
                  mode === value ? "border-accent" : "border-hairline"
                } ${disabled ? "text-muted" : "cursor-pointer text-fg"}`}
              >
                <input
                  type="radio"
                  name="withdrawMode"
                  value={value}
                  checked={mode === value}
                  disabled={disabled}
                  onChange={() => setMode(value)}
                  className="mt-0.5 size-4 accent-(--accent)"
                />
                <span className="font-semibold">{CHOICES[value].label}</span>
                <span className="col-start-2 text-muted">
                  {disabled ? REVIEW_HISTORY_REASON : CHOICES[value].text}
                </span>
              </label>
            );
          })}
        </fieldset>
        <Help id="withdraw" />
        {dependents > 0 ? (
          <p className="text-sm text-warning-text">
            {dependents === 1 ? "1 submission depends" : `${dependents} submissions depend`} on
            this. {dependents === 1 ? "It's" : "They're"} blocked until another submission of{" "}
            {itemName} comes along.
          </p>
        ) : null}
        <FieldError id="withdraw-error">{error}</FieldError>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant={mode === "delete" ? "destructive" : "primary"}
            loading={pending}
            onClick={() =>
              start(async () => {
                const result = await withdrawAction(draftId, mode);
                if (!result.ok) {
                  // A reviewer took part meanwhile: only archiving is left.
                  if (result.error === REVIEW_HISTORY_REASON) setMode("archive");
                  return setError(result.error);
                }
                onClose();
                router.refresh();
              })
            }
          >
            {CHOICES[mode].label}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

/** Deleting an archived submission for good (057): it can't be undone, so it asks first. */
export const DeleteArchivedDialog = ({
  draftId,
  itemName,
  onClose,
  fromList = false,
}: {
  draftId: string;
  itemName: string;
  onClose: () => void;
  /** Opened from My submissions: stay there; from its own page, go to My submissions. */
  fromList?: boolean;
}) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={`Delete ${itemName} for good?`}>
      <div className="grid gap-4">
        <p className="text-sm text-fg">{CHOICES.delete.text}</p>
        <FieldError id="delete-error">{error}</FieldError>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              start(async () => {
                const result = await deleteSubmissionAction(draftId);
                if (!result.ok) return setError(result.error);
                onClose();
                if (fromList) router.refresh();
                else router.push("/submissions");
              })
            }
          >
            Delete for good
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

/** Restore (057): an archived submission comes back as a draft. Nothing is lost, so no question. */
export const RestoreButton = ({ draftId }: { draftId: string }) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await restoreAction(draftId);
            if (!result.ok) return setError(result.error);
            router.refresh();
          })
        }
      >
        Restore
      </Button>
      <FieldError id={`restore-error-${draftId}`}>{error}</FieldError>
    </>
  );
};
