"use client";

import { NAME_PROBLEM_MESSAGES, nameProblem, normalizeWorkspaceName } from "@ronneai/core";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  createWorkspaceFromForm,
  deleteWorkspaceFromForm,
  setVisibilityFromForm,
  updateWorkspaceFromForm,
  visibilityImpactFor,
} from "./actions";
import type { VisibilityImpactResult, WorkspaceActionState } from "./types";

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

/** New workspace's form; exported for its test (the dialog renders it only when open). */
export const CreateWorkspaceForm = ({ onDone }: { onDone: () => void }) => {
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
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          Visibility <Help id="visibility" />
        </legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="visibility" value="public" defaultChecked className="mt-1" />
          <span>
            <span className="font-medium text-fg">Public</span>
            <span className="block text-muted">
              Everyone signed in sees its scopes and items, and can depend on them.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="visibility" value="private" className="mt-1" />
          <span>
            <span className="font-medium text-fg">Private</span>
            <span className="block text-muted">
              Only its members and root see its items; only its own items can depend on them.
            </span>
          </span>
        </label>
      </fieldset>
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

/**
 * Make private, or public (093), root only. Making private shows what it meets first: released
 * items outside that depend on its items (Save stays off while there are any) and open submissions
 * outside that would fail at release. Making public asks first.
 */
export const VisibilityForm = ({
  name,
  to,
  onDone,
  loaded,
}: {
  name: string;
  to: "private" | "public";
  onDone: () => void;
  /** What Make private meets, when it's already known (its test); else it's read on open. */
  loaded?: VisibilityImpactResult;
}) => {
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    setVisibilityFromForm,
    {},
  );
  const [impact, setImpact] = useState<VisibilityImpactResult | null>(
    loaded ?? (to === "public" ? { dependents: [], openDependents: [] } : null),
  );
  useEffect(() => {
    if (to !== "private" || loaded) return;
    visibilityImpactFor(name)
      .then(setImpact)
      .catch(() =>
        setImpact({ error: "Couldn't check what depends on its items. Try again in a moment." }),
      );
  }, [name, to, loaded]);
  if (state.done) return <Done message={state.done} onDone={onDone} />;
  const blocked = impact && "dependents" in impact && impact.dependents.length > 0;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="visibility" value={to} />
      {to === "public" ? (
        <p className="text-sm text-fg">
          Make <span className="font-mono">{name}</span> public? Everyone on this instance will see
          its items and can depend on them.
        </p>
      ) : !impact ? (
        <p className="text-sm text-muted">Checking what depends on its items…</p>
      ) : "error" in impact ? (
        <FieldError id={`visibility-${name}-load`}>{impact.error}</FieldError>
      ) : (
        <>
          <p className="text-sm text-fg">
            Make <span className="font-mono">{name}</span> private? Only its members and root will
            see its items, and only its own items can depend on them.
          </p>
          <Help id="visibility" />
          {impact.dependents.length > 0 ? (
            <Notice
              kind="error"
              title={`${impact.dependents.length} ${impact.dependents.length === 1 ? "item" : "items"} outside ${name} ${impact.dependents.length === 1 ? "depends" : "depend"} on its items`}
            >
              <p>They'd stop installing. Release them without it first.</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-[13px]">
                {impact.dependents.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {impact.openDependents.length > 0 ? (
            <Notice
              kind="warn"
              title={`${impact.openDependents.length} open ${impact.openDependents.length === 1 ? "submission" : "submissions"} outside ${name} ${impact.openDependents.length === 1 ? "depends" : "depend"} on its items`}
            >
              <p>They'll fail at release.</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-[13px]">
                {impact.openDependents.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </>
      )}
      <FieldError id={`visibility-${name}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={pending}
          disabled={!impact || "error" in impact}
          disabledReason={blocked ? "Items outside depend on its items." : null}
        >
          {to === "private" ? "Make private" : "Make public"}
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
        <CreateWorkspaceForm key={dialog.round} onDone={dialog.close} />
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

/** Root's Make private or Make public (093) on a workspace's page; not for `global`. */
export const VisibilityButton = ({
  name,
  visibility,
}: {
  name: string;
  visibility: "public" | "private";
}) => {
  const dialog = useDialog();
  const to = visibility === "public" ? "private" : "public";
  // The way it was opened: the change refreshes the page, which flips `to` while the dialog still
  // shows its result, and its title and form mustn't flip with it.
  const [asked, setAsked] = useState<"private" | "public">(to);
  const open = () => {
    setAsked(to);
    dialog.show();
  };
  return (
    <>
      <Button variant="secondary" onClick={open}>
        {to === "private" ? "Make private" : "Make public"}
      </Button>
      <Dialog
        open={dialog.open}
        onClose={dialog.close}
        title={asked === "private" ? "Make private" : "Make public"}
      >
        {dialog.open ? (
          <VisibilityForm key={dialog.round} name={name} to={asked} onDone={dialog.close} />
        ) : null}
      </Dialog>
    </>
  );
};
