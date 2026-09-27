"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { revokeTokenFromForm } from "./actions";
import type { TokenActionState } from "./types";

/**
 * On success the page refreshes, the row shows "revoked", and this button (with its dialog) is no
 * longer rendered, so the updated row is the confirmation.
 */
const RevokeForm = ({ id, name, onDone }: { id: string; name: string; onDone: () => void }) => {
  const [state, action, pending] = useActionState<TokenActionState, FormData>(
    revokeTokenFromForm,
    {},
  );
  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title={state.done} />
        <div>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="tokenId" value={id} />
      <p className="text-sm text-muted">
        Revoke <strong className="text-fg">{name}</strong>? Anything using it, such as rmk on that
        machine, stops working and has to sign in again.
      </p>
      <FieldError id={`revoke-${id}-error`}>{state.error}</FieldError>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Revoke token
        </Button>
      </div>
    </form>
  );
};

export const RevokeTokenButton = ({ id, name }: { id: string; name: string }) => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Revoke ${name}`}
        className="rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        Revoke
      </button>
      <Dialog open={open} onClose={close} title="Revoke access token">
        <RevokeForm key={round} id={id} name={name} onDone={close} />
      </Dialog>
    </>
  );
};
