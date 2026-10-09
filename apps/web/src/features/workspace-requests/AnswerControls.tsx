"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { approveRequestFromForm, declineRequestFromForm } from "./actions";
import type { AnswerState, RequestRow } from "./types";

const REASON_MAX_LENGTH = 500;

/**
 * Approve (094): as `user`, or with a role select for root and the workspace's admins, who manage
 * its members. Once approved, the page refreshes and the row is gone: that's the confirmation. A
 * refusal (someone answered first) shows under the button.
 */
export const ApproveForm = ({ request }: { request: RequestRow }) => {
  const [state, action, pending] = useActionState<AnswerState, FormData>(
    approveRequestFromForm,
    {},
  );
  const errorId = `approve-${request.id}-error`;
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="workspace" value={request.workspace} />
      <div className="flex flex-nowrap items-center gap-2">
        {request.canPickRole ? (
          // The select fills its box (`selectClasses` has `w-full`): the box sets its width.
          <div className="w-32 shrink-0">
            <select
              name="role"
              defaultValue="user"
              aria-label={`Role for ${request.email}`}
              className={selectClasses}
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
            </select>
          </div>
        ) : null}
        <Button
          type="submit"
          loading={pending}
          aria-label={`Approve ${request.email}`}
          aria-describedby={state.error ? errorId : undefined}
        >
          Approve
        </Button>
      </div>
      <FieldError id={errorId}>{state.error}</FieldError>
    </form>
  );
};

const DeclineForm = ({ request, onDone }: { request: RequestRow; onDone: () => void }) => {
  const [state, action, pending] = useActionState<AnswerState, FormData>(
    declineRequestFromForm,
    {},
  );
  const [reason, setReason] = useState("");
  const reasonId = `decline-${request.id}-reason`;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="workspace" value={request.workspace} />
      <p className="text-sm text-muted">
        Decline <strong className="text-fg">{request.email}</strong> joining{" "}
        <span className="font-mono text-fg">{request.workspace}</span>? They can ask again in 7
        days.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={reasonId}>Reason (optional)</Label>
        <textarea
          id={reasonId}
          name="reason"
          maxLength={REASON_MAX_LENGTH}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-describedby={`${reasonId}-hint`}
          className={`${inputClasses} h-auto py-2`}
        />
        <p id={`${reasonId}-hint`} className="text-xs text-muted">
          They see it on their Workspaces page. {[...reason].length}/{REASON_MAX_LENGTH}
        </p>
      </div>
      <FieldError id={`decline-${request.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Decline
        </Button>
      </DialogActions>
    </form>
  );
};

/** Decline, with an optional reason, in a dialog; once declined, the row is gone with it. */
export const DeclineButton = ({ request }: { request: RequestRow }) => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={`Decline ${request.email}`}
      >
        Decline
      </Button>
      <Dialog open={open} onClose={close} title="Decline request">
        <DeclineForm key={round} request={request} onDone={close} />
      </Dialog>
    </>
  );
};
