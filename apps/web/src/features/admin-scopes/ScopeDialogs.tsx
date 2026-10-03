"use client";

import { NAME_PROBLEM_MESSAGES, nameProblem, normalizeScopeName } from "@ronneai/core";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { createScopeFromForm, updateScopeFromForm } from "./actions";
import type { ScopeActionState } from "./types";

const Description = ({ defaultValue }: { defaultValue?: string }) => {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="scope-description">Description</Label>
      <textarea
        id="scope-description"
        name="description"
        required
        maxLength={300}
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={`${inputClasses} h-auto py-2`}
      />
      <p className="text-xs text-muted">What belongs in this scope. {[...value].length}/300</p>
    </div>
  );
};

const CreateForm = ({ onDone }: { onDone: () => void }) => {
  const [state, action, pending] = useActionState<ScopeActionState, FormData>(
    createScopeFromForm,
    {},
  );
  const [typed, setTyped] = useState("");
  const name = normalizeScopeName(typed);
  const problem = typed ? nameProblem(name, "scope") : null;
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
      <div className="grid gap-1.5">
        <Label htmlFor="scope-name">Name</Label>
        <input
          id="scope-name"
          name="name"
          required
          maxLength={65}
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby="scope-name-hint"
          aria-invalid={problem ? true : undefined}
          className={inputClasses}
        />
        <p id="scope-name-hint" className="text-xs text-muted">
          {problem ? (
            NAME_PROBLEM_MESSAGES[problem]
          ) : (
            <>
              Items will be named <span className="font-mono text-fg">@{name || "scope"}/item</span>
              . Lowercase letters, digits and hyphens. It can't be changed later.
            </>
          )}
        </p>
      </div>
      <Description />
      <FieldError id="create-scope-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create scope
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
  const [state, action, pending] = useActionState<ScopeActionState, FormData>(
    updateScopeFromForm,
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
      <input type="hidden" name="name" value={name} />
      <p className="font-mono text-[13px] text-fg">@{name}</p>
      <Description defaultValue={description} />
      <FieldError id={`edit-scope-${name}-error`}>{state.error}</FieldError>
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

export const CreateScopeDialog = () => {
  const dialog = useDialog();
  return (
    <>
      <Button onClick={dialog.show}>Create scope</Button>
      <Dialog open={dialog.open} onClose={dialog.close} title="Create scope">
        <CreateForm key={dialog.round} onDone={dialog.close} />
      </Dialog>
    </>
  );
};

export const EditScopeButton = ({ name, description }: { name: string; description: string }) => {
  const dialog = useDialog();
  return (
    <>
      <button
        type="button"
        onClick={dialog.show}
        aria-label={`Edit @${name}`}
        className="rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        Edit
      </button>
      <Dialog open={dialog.open} onClose={dialog.close} title="Edit scope">
        <EditForm key={dialog.round} name={name} description={description} onDone={dialog.close} />
      </Dialog>
    </>
  );
};
