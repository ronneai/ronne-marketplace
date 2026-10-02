"use client";

import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, Label, selectClasses, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { createUserFromForm } from "./actions";
import { OneTimePassword } from "./OneTimePassword";
import { PasswordChoice } from "./PasswordChoice";
import type { AdminActionState } from "./types";

const CreateUserForm = ({ onDone }: { onDone: () => void }) => {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    createUserFromForm,
    {},
  );
  const [role, setRole] = useState("user");
  if (state.oneTime)
    return (
      <div className="grid gap-4">
        <OneTimePassword value={state.oneTime} />
        <div>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4">
      <TextField id="new-email" name="email" type="email" label="Email" required maxLength={255} />
      <TextField id="new-name" name="name" label="Name" required maxLength={255} />
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="new-role">Role</Label>
          <Help id="role-root" />
        </div>
        <select
          id="new-role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={selectClasses}
        >
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="root">root</option>
        </select>
      </div>
      {role === "root" ? (
        <Notice kind="warn" title="Root can do everything.">
          Manage users (other roots included), scopes, settings and the audit log, and approve their
          own submissions.
        </Notice>
      ) : null}
      <PasswordChoice idPrefix="new" />
      <FieldError id="create-error">{state.error}</FieldError>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create user
        </Button>
      </div>
    </form>
  );
};

/** "Create user" and its dialog. Each opening starts a fresh form, so a shown password never lingers. */
export const CreateUserDialog = () => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Create user</Button>
      <Dialog open={open} onClose={close} title="Create user">
        <CreateUserForm key={round} onDone={close} />
      </Dialog>
    </>
  );
};
