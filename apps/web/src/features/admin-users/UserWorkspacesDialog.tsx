"use client";

import { type ReactNode, useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { saveUserWorkspacesFromForm, userWorkspacesFor } from "./actions";
import type { AdminActionState } from "./types";
import { type WorkspaceOption, type WorkspaceRow, WorkspaceRows } from "./WorkspaceRows";

/** The dialog's form: loads the user's memberships, then saves the list as edited. */
const UserWorkspacesForm = ({
  user,
  workspaces,
  onDone,
}: {
  user: { id: string; email: string };
  workspaces: readonly WorkspaceOption[];
  onDone: () => void;
}) => {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    saveUserWorkspacesFromForm,
    {},
  );
  const [rows, setRows] = useState<WorkspaceRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    userWorkspacesFor(user.id).then((result) =>
      "error" in result ? setLoadError(result.error) : setRows(result.rows),
    );
  }, [user.id]);

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
      <input type="hidden" name="userId" value={user.id} />
      <p className="font-mono text-[13px] text-fg">{user.email}</p>
      {loadError ? <FieldError id={`workspaces-${user.id}-load`}>{loadError}</FieldError> : null}
      {rows ? (
        <>
          <WorkspaceRows workspaces={workspaces} rows={rows} setRows={setRows} />
          <input type="hidden" name="workspaces" value={JSON.stringify(rows)} />
        </>
      ) : loadError ? null : (
        <p className="text-sm text-muted">Loading their workspaces…</p>
      )}
      <FieldError id={`workspaces-${user.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={!rows}>
          Save
        </Button>
      </DialogActions>
    </form>
  );
};

/**
 * A user's Workspaces (092): their workspaces and roles, editable; Save applies the difference.
 * Not offered for root, who works in every workspace.
 */
export const UserWorkspacesButton = ({
  user,
  workspaces,
  count,
  children,
}: {
  user: { id: string; email: string };
  workspaces: readonly WorkspaceOption[];
  /** How many workspaces they're in, for the button's name. */
  count: number;
  /** What the button shows: their role badges, in the Role cell. */
  children: ReactNode;
}) => {
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
        aria-label={`Workspaces of ${user.email}: ${count}`}
        className="touch-hit -m-1 rounded-control p-1 text-left hover:bg-tint outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <Dialog open={open} onClose={close} title={`Workspaces of ${user.email}`}>
        {open ? (
          <UserWorkspacesForm key={round} user={user} workspaces={workspaces} onDone={close} />
        ) : null}
      </Dialog>
    </>
  );
};
