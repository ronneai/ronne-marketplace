"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Checkbox, FieldError, Label, selectClasses, TextField } from "@/components/ui/Field";
import { createTokenFromForm } from "./actions";
import { CreatedTokenPanel } from "./CreatedTokenPanel";
import type { TokenActionState } from "./types";

const CreateTokenForm = ({ onDone }: { onDone: () => void }) => {
  const [state, action, pending] = useActionState<TokenActionState, FormData>(
    createTokenFromForm,
    {},
  );
  const [lifetime, setLifetime] = useState("90");
  if (state.created)
    return (
      <div className="grid gap-4">
        <CreatedTokenPanel value={state.created} />
        <div>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4">
      <TextField
        id="token-name"
        name="name"
        label="Name"
        hint="Where you'll use it, for example the machine or the CI job."
        required
        maxLength={100}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="token-lifetime">Expires after</Label>
        <select
          id="token-lifetime"
          name="lifetime"
          value={lifetime}
          onChange={(event) => setLifetime(event.target.value)}
          className={selectClasses}
        >
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
          <option value="none">No expiry</option>
        </select>
      </div>
      {lifetime === "none" ? (
        <Checkbox
          id="token-no-expiry"
          name="confirmNoExpiry"
          label="I understand this token works until I revoke it."
        />
      ) : null}
      <FieldError id="token-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create token
        </Button>
      </DialogActions>
    </form>
  );
};

/** "Create token" and its dialog. Each opening starts a fresh form, so a shown token never lingers. */
export const CreateTokenDialog = () => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Create token</Button>
      <Dialog open={open} onClose={close} title="Create access token">
        <CreateTokenForm key={round} onDone={close} />
      </Dialog>
    </>
  );
};
