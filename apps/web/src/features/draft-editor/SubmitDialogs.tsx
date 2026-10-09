"use client";

import { hasErrors } from "@ronneai/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { IssueList } from "@/components/validation/IssueList";
import {
  checkSubmissionAction,
  deleteSubmissionAction,
  restoreAction,
  submitDraftAction,
  withdrawAction,
  withdrawInfoAction,
} from "./actions";
import type { GroupMember, SubmitPreview, SubmitResult } from "./types";

/** "@a", "@a and @b", "@a, @b and @c". */
const names = (list: readonly string[]) =>
  list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;

/**
 * Why Submit is off (112), or null: the item's own errors, or the first of its drafts that isn't
 * ready. Nothing while it's checking.
 */
export const submitBlocked = (result: SubmitPreview | SubmitResult | null): string | null => {
  if (!result) return null;
  if (!result.ok) return result.error;
  const waiting = "members" in result ? result.members.find((m) => !m.ready) : undefined;
  if (waiting) return `${waiting.name} isn't ready: fix its errors first.`;
  return hasErrors(result.issues) ? "Fix its errors first." : null;
};

/** The button's words: Submit alone, or with how many more of the person's drafts (112). */
export const submitLabel = (resubmit: boolean, members: readonly GroupMember[]) => {
  const verb = resubmit ? "Resubmit" : "Submit";
  return members.length === 0
    ? `${verb} for review`
    : `${verb} with ${members.length} more ${members.length === 1 ? "draft" : "drafts"}`;
};

/** Said when Submit is refused after the check (112): the dialog then checks again. */
export const CHANGED_SINCE_CHECK =
  "Something changed since the check: here's where each draft stands now.";

/**
 * What the dialog does after Submit (112): refused, it says so and checks again; with drafts sent
 * along, it says what went; otherwise it closes, as before.
 */
export const afterSubmit = (
  submitted: SubmitResult,
):
  | { next: "recheck"; message: string }
  | { next: "outcome"; sent: string[] }
  | { next: "close" } =>
  !submitted.ok
    ? { next: "recheck", message: CHANGED_SINCE_CHECK }
    : submitted.sent && submitted.sent.length > 0
      ? { next: "outcome", sent: submitted.sent }
      : { next: "close" };

/** What went for review (112): the item, and the drafts that went with it. */
export const SubmitOutcome = ({
  itemName,
  sent,
}: {
  itemName: string;
  sent: readonly string[];
}) => (
  <p role="status" className="text-sm text-fg">
    <span className="mr-2 font-mono text-xs font-semibold">OK:</span>
    Submitted {itemName} for review, with {names(sent)}.
  </p>
);

/**
 * The person's own drafts that go with the item (112), dependencies first: each with what brings
 * it in, whether it and another need each other, and its checks, linking to the draft.
 */
export const GroupList = ({
  itemName,
  members,
}: {
  itemName: string;
  members: readonly GroupMember[];
}) => (
  <section aria-labelledby="submit-group" className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id="submit-group" className="text-sm font-semibold text-fg">
        Goes with {members.length} of your drafts:
      </h3>
      <Help id="submit-together" />
    </div>
    <ul className="grid gap-3" aria-label={`Drafts submitted with ${itemName}`}>
      {members.map((member) => (
        <li key={member.id} className="grid gap-1 rounded-control border border-hairline p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/submissions/${member.id}`}
              className="font-mono text-sm text-fg underline"
            >
              {member.name}
            </Link>
            {member.inCycle ? <Badge tone="warning">needs each other</Badge> : null}
            <Badge tone={member.ready ? "accent" : "error"}>
              {member.ready ? "ready" : "not ready"}
            </Badge>
          </div>
          {member.neededBy.length > 0 ? (
            <p className="text-xs text-muted">Needed by {names(member.neededBy)}</p>
          ) : null}
          {member.issues.length > 0 ? <IssueList issues={member.issues} /> : null}
        </li>
      ))}
    </ul>
  </section>
);

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
  const [result, setResult] = useState<SubmitPreview | SubmitResult | null>(null);
  const [sent, setSent] = useState<string[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const members = result?.ok && "members" in result ? result.members : [];
  const label = submitLabel(resubmit, members);
  const [checking, startCheck] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (dirty) return;
    startCheck(async () => setResult(await checkSubmissionAction(draftId)));
  }, [dirty, draftId]);

  const blocked = submitBlocked(result);

  return (
    <Dialog open onClose={onClose} title={submitLabel(resubmit, [])}>
      {dirty ? (
        <div className="grid gap-4">
          <p className="text-sm text-fg">
            Save your changes first: the checks, and the reviewers, see what's saved.
          </p>
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </div>
      ) : sent ? (
        <div className="grid gap-4">
          <SubmitOutcome itemName={itemName} sent={sent} />
          <DialogActions>
            <Button
              onClick={() => {
                onClose();
                router.refresh();
              }}
            >
              Close
            </Button>
          </DialogActions>
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
          {refused ? <FieldError id="submit-refused">{refused}</FieldError> : null}
          {members.length > 0 && !checking ? (
            <GroupList itemName={itemName} members={members} />
          ) : null}
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={checking || !result}
              disabledReason={blocked}
              loading={submitting}
              onClick={() =>
                startSubmit(async () => {
                  const then = afterSubmit(await submitDraftAction(draftId));
                  if (then.next === "recheck") {
                    setRefused(then.message);
                    return setResult(await checkSubmissionAction(draftId));
                  }
                  if (then.next === "outcome") return setSent(then.sent);
                  onClose();
                  router.refresh();
                })
              }
            >
              {label}
            </Button>
          </DialogActions>
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
        <DialogActions>
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
        </DialogActions>
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
        <DialogActions>
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
        </DialogActions>
      </div>
    </Dialog>
  );
};

/**
 * Withdraw from a list or the review page (058): a text-only button that loads what the dialog
 * needs (whether it can be deleted, its dependents) when it's clicked, then opens it.
 */
export const WithdrawButton = ({ draftId, itemName }: { draftId: string; itemName: string }) => {
  const [info, setInfo] = useState<{ canDelete: boolean; dependents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="text"
        aria-label={`Withdraw: ${itemName}`}
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await withdrawInfoAction(draftId);
            if ("error" in result) return setError(result.error);
            setInfo(result);
          })
        }
      >
        Withdraw
      </Button>
      <FieldError id={`withdraw-info-error-${draftId}`}>{error}</FieldError>
      {info ? (
        <WithdrawDialog
          draftId={draftId}
          itemName={itemName}
          canDelete={info.canDelete}
          dependents={info.dependents}
          onClose={() => setInfo(null)}
        />
      ) : null}
    </>
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
