"use client";

import { NAME_PROBLEM_MESSAGES, nameProblem, normalizeWorkspaceName } from "@ronneai/core";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  createWorkspaceFromForm,
  deleteWorkspaceFromForm,
  updateWorkspaceFromForm,
} from "./actions";
import type { WorkspaceActionState } from "./types";

const Description = ({ defaultValue }: { defaultValue?: string }) => {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="workspace-description">Description</Label>
      <textarea
        id="workspace-description"
        name="description"
        required
        maxLength={300}
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={`${inputClasses} h-auto py-2`}
      />
      <p className="text-xs text-muted">
        Who it's for and what goes in it. {[...value].length}/300
      </p>
    </div>
  );
};

const Done = ({ message, onDone }: { message: string; onDone: () => void }) => (
  <div className="grid gap-4">
    <Notice kind="info" title={message} />
    <div>
      <Button onClick={onDone}>Done</Button>
    </div>
  </div>
);

const CreateForm = ({ onDone }: { onDone: () => void }) => {
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    createWorkspaceFromForm,
    {},
  );
  const [typed, setTyped] = useState("");
  const name = normalizeWorkspaceName(typed);
  const problem = typed ? nameProblem(name, "workspace") : null;
  if (state.done) return <Done message={state.done} onDone={onDone} />;
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="workspace-name">Name</Label>
        <input
          id="workspace-name"
          name="name"
          required
          maxLength={65}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby="workspace-name-hint"
          aria-invalid={problem ? true : undefined}
          className={inputClasses}
        />
        <p id="workspace-name-hint" className="text-xs text-muted">
          {problem
            ? NAME_PROBLEM_MESSAGES[problem]
            : "Lowercase letters, digits and hyphens. It can't be changed later, and it isn't part of item names."}
        </p>
      </div>
      <Description />
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold text-fg">Visibility</p>
        <input type="hidden" name="visibility" value="public" />
        <p className="text-sm text-muted">
          Public: everyone signed in sees its scopes and items. Private workspaces come in a later
          version.
        </p>
      </div>
      <FieldError id="create-workspace-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create workspace
        </Button>
      </DialogActions>
    </form>
  );
};

const EditForm = ({
  name,
  description,
  onDone,
}: {
  name: string;
  description: string;
  onDone: () => void;
}) => {
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    updateWorkspaceFromForm,
    {},
  );
  if (state.done) return <Done message={state.done} onDone={onDone} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="name" value={name} />
      <p className="font-mono text-[13px] text-fg">{name}</p>
      <Description defaultValue={description} />
      <FieldError id={`edit-workspace-${name}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </DialogActions>
    </form>
  );
};

const DeleteForm = ({ name, onDone }: { name: string; onDone: () => void }) => {
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    deleteWorkspaceFromForm,
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="name" value={name} />
      <p className="text-sm text-fg">
        Delete the workspace <span className="font-mono">{name}</span>? It has no scopes. This can't
        be undone.
      </p>
      <FieldError id={`delete-workspace-${name}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" loading={pending}>
          Delete workspace
        </Button>
      </DialogActions>
    </form>
  );
};

/** A dialog whose form remounts each time it opens, so no earlier result lingers. */
const useDialog = () => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return { open, round, show: () => setOpen(true), close };
};

export const CreateWorkspaceDialog = () => {
  const dialog = useDialog();
  return (
    <>
      <Button onClick={dialog.show}>New workspace</Button>
      <Dialog open={dialog.open} onClose={dialog.close} title="New workspace">
        <CreateForm key={dialog.round} onDone={dialog.close} />
      </Dialog>
    </>
  );
};

export const EditWorkspaceButton = ({
  name,
  description,
}: {
  name: string;
  description: string;
}) => {
  const dialog = useDialog();
  return (
    <>
      <Button variant="secondary" onClick={dialog.show}>
        Edit description
      </Button>
      <Dialog open={dialog.open} onClose={dialog.close} title="Edit workspace">
        <EditForm key={dialog.round} name={name} description={description} onDone={dialog.close} />
      </Dialog>
    </>
  );
};

/** Delete, only while the workspace has no scopes: nothing moves scopes to another one yet. */
export const DeleteWorkspaceButton = ({ name, scopes }: { name: string; scopes: number }) => {
  const dialog = useDialog();
  return (
    <>
      <Button
        variant="secondary"
        onClick={dialog.show}
        disabledReason={scopes > 0 ? "Move or remove its scopes first." : null}
      >
        Delete
      </Button>
      <Dialog open={dialog.open} onClose={dialog.close} title="Delete workspace">
        <DeleteForm key={dialog.round} name={name} onDone={dialog.close} />
      </Dialog>
    </>
  );
};
