"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("workspaces.requests");
  const roles = useTranslations("common.roleTitle");
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
              aria-label={t("roleFor", { email: request.email })}
              className={selectClasses}
            >
              <option value="user">{roles("user")}</option>
              <option value="moderator">{roles("moderator")}</option>
            </select>
          </div>
        ) : null}
        <Button
          type="submit"
          loading={pending}
          aria-label={t("approveAria", { email: request.email })}
          aria-describedby={state.error ? errorId : undefined}
        >
          {t("approve")}
        </Button>
      </div>
      <FieldError id={errorId}>{state.error}</FieldError>
    </form>
  );
};

const DeclineForm = ({ request, onDone }: { request: RequestRow; onDone: () => void }) => {
  const t = useTranslations("workspaces.requests");
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
        {t.rich("declineBody", {
          email: request.email,
          workspace: request.workspace,
          strong: (chunks) => <strong className="text-fg">{chunks}</strong>,
          mono: (chunks) => <span className="font-mono text-fg">{chunks}</span>,
        })}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={reasonId}>{t("reason")}</Label>
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
          {t("reasonHint", { used: [...reason].length, max: REASON_MAX_LENGTH })}
        </p>
      </div>
      <FieldError id={`decline-${request.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("decline")}
        </Button>
      </DialogActions>
    </form>
  );
};

/** Decline, with an optional reason, in a dialog; once declined, the row is gone with it. */
export const DeclineButton = ({ request }: { request: RequestRow }) => {
  const t = useTranslations("workspaces.requests");
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
        aria-label={t("declineAria", { email: request.email })}
      >
        {t("decline")}
      </Button>
      <Dialog open={open} onClose={close} title={t("declineTitle")}>
        <DeclineForm key={round} request={request} onDone={close} />
      </Dialog>
    </>
  );
};
