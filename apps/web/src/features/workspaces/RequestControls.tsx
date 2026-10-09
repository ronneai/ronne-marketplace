"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { cancelRequestFromForm, requestAccessFromForm } from "./actions";
import type { RequestActionState } from "./types";

const MESSAGE_MAX_LENGTH = 500;

/**
 * Ask to join (094): an optional message, then the request. Inline on the join page; in a dialog
 * on the Workspaces page, where `onCancel` closes it.
 */
export const AskToJoinForm = ({
  workspace,
  onCancel,
}: {
  workspace: string;
  onCancel?: () => void;
}) => {
  const [state, action, pending] = useActionState<RequestActionState, FormData>(
    requestAccessFromForm,
    {},
  );
  const [message, setMessage] = useState("");
  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title={state.done}>
          <p className="mt-1 text-muted">
            The answer shows on the Workspaces page. You can cancel the request there.
          </p>
        </Notice>
        {onCancel ? (
          <div>
            <Button onClick={onCancel}>Done</Button>
          </div>
        ) : null}
      </div>
    );
  const messageId = `join-${workspace}-message`;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="workspace" value={workspace} />
      <div className="grid gap-1.5">
        <Label htmlFor={messageId}>Message (optional)</Label>
        <textarea
          id={messageId}
          name="message"
          maxLength={MESSAGE_MAX_LENGTH}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={`${messageId}-hint`}
          className={`${inputClasses} h-auto py-2`}
        />
        <p id={`${messageId}-hint`} className="text-xs text-muted">
          Who you are and why you'd like to join, for whoever answers. {[...message].length}/
          {MESSAGE_MAX_LENGTH}
        </p>
      </div>
      <FieldError id={`join-${workspace}-error`}>{state.error}</FieldError>
      <DialogActions>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={pending}>
          Ask to join
        </Button>
      </DialogActions>
    </form>
  );
};

/** Ask to join, from a row of the Workspaces page. */
export const AskToJoinButton = ({ workspace }: { workspace: string }) => {
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
        aria-label={`Ask to join ${workspace}`}
      >
        Ask to join
      </Button>
      <Dialog open={open} onClose={close} title={`Ask to join ${workspace}`}>
        <AskToJoinForm key={round} workspace={workspace} onCancel={close} />
      </Dialog>
    </>
  );
};

/** Takes back an open request; nothing to confirm, since asking again is as easy. */
export const CancelRequestButton = ({
  requestId,
  workspace,
}: {
  requestId: string;
  workspace: string;
}) => {
  const [state, action, pending] = useActionState<RequestActionState, FormData>(
    cancelRequestFromForm,
    {},
  );
  return (
    <form action={action} className="inline-grid gap-1">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="workspace" value={workspace} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Cancel your request to join ${workspace}`}
        className="touch-hit rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        Cancel
      </button>
      <FieldError id={`cancel-${requestId}-error`}>{state.error}</FieldError>
    </form>
  );
};
