"use client";

import { NAME_MAX_LENGTH, nameProblem, normalizeWorkspaceName } from "@ronneai/core";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  createWorkspaceFromForm,
  deleteWorkspaceFromForm,
  renameImpactFor,
  renameWorkspaceFromForm,
  setVisibilityFromForm,
  updateWorkspaceFromForm,
  visibilityImpactFor,
} from "./actions";
import type { RenameImpactResult, VisibilityImpactResult, WorkspaceActionState } from "./types";

/** What a failed read of an impact sets as its error; the form words it in the language. */
const LOAD_FAILED = "load_failed";

/** A name in the monospace face the sentences around it use. */
const mono = (chunks: React.ReactNode) => <span className="font-mono">{chunks}</span>;

const Description = ({ defaultValue }: { defaultValue?: string }) => {
  const t = useTranslations("admin.workspaces.dialogs.description");
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="workspace-description">{t("label")}</Label>
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
      <p className="text-xs text-muted">{t("hint", { used: [...value].length, max: 300 })}</p>
    </div>
  );
};

const Done = ({ message, onDone }: { message: string; onDone: () => void }) => {
  const t = useTranslations("admin.workspaces.dialogs");
  return (
    <div className="grid gap-4">
      <Notice kind="info" title={message} />
      <div>
        <Button onClick={onDone}>{t("done")}</Button>
      </div>
    </div>
  );
};

/** New workspace's form; exported for its test (the dialog renders it only when open). */
export const CreateWorkspaceForm = ({ onDone }: { onDone: () => void }) => {
  const t = useTranslations("admin.workspaces.dialogs");
  const problems = useTranslations("common.nameProblem");
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
        <Label htmlFor="workspace-name">{t("create.name")}</Label>
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
          {problem ? problems(problem, { max: NAME_MAX_LENGTH }) : t("create.nameHint")}
        </p>
      </div>
      <Description />
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          {t("create.visibility")} <Help id="visibility" />
        </legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="visibility" value="public" defaultChecked className="mt-1" />
          <span>
            <span className="font-medium text-fg">{t("create.public")}</span>
            <span className="block text-muted">{t("create.publicBody")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="visibility" value="private" className="mt-1" />
          <span>
            <span className="font-medium text-fg">{t("create.private")}</span>
            <span className="block text-muted">{t("create.privateBody")}</span>
          </span>
        </label>
      </fieldset>
      <FieldError id="create-workspace-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("create.submit")}
        </Button>
      </DialogActions>
    </form>
  );
};

export const EditWorkspaceForm = ({
  name,
  description,
  onDone,
}: {
  name: string;
  description: string;
  onDone: () => void;
}) => {
  const t = useTranslations("admin.workspaces.dialogs");
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
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </DialogActions>
    </form>
  );
};

export const DeleteWorkspaceForm = ({ name, onDone }: { name: string; onDone: () => void }) => {
  const t = useTranslations("admin.workspaces.dialogs");
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    deleteWorkspaceFromForm,
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="name" value={name} />
      <p className="text-sm text-fg">{t.rich("delete.body", { name, mono })}</p>
      <FieldError id={`delete-workspace-${name}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="destructive" loading={pending}>
          {t("delete.submit")}
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
  const t = useTranslations("shelves.visibility");
  const v = useTranslations("admin.workspaces.dialogs");
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
      .catch(() => setImpact({ error: LOAD_FAILED }));
  }, [name, to, loaded]);
  if (state.done) return <Done message={state.done} onDone={onDone} />;
  const blocked = impact && "dependents" in impact && impact.dependents.length > 0;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="visibility" value={to} />
      {to === "public" ? (
        <p className="text-sm text-fg">{v.rich("visibility.askPublic", { name, mono })}</p>
      ) : !impact ? (
        <p className="text-sm text-muted">{v("visibility.checking")}</p>
      ) : "error" in impact ? (
        <FieldError id={`visibility-${name}-load`}>
          {impact.error === LOAD_FAILED ? v("visibility.loadFailed") : impact.error}
        </FieldError>
      ) : (
        <>
          <p className="text-sm text-fg">{v.rich("visibility.askPrivate", { name, mono })}</p>
          <Help id="visibility" />
          {impact.dependents.length > 0 ? (
            <Notice
              kind="error"
              title={v("visibility.dependentsTitle", { count: impact.dependents.length, name })}
            >
              <p>{v("visibility.dependentsBody")}</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-[13px]">
                {impact.dependents.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {/* Start here is for everyone, so Make private takes the workspace's items off it (125). */}
          {impact.startHere?.length ? (
            <Notice kind="info" title={t("startHereTitle", { count: impact.startHere.length })}>
              <p>{t("startHereBody", { count: impact.startHere.length })}</p>
              <ul className="mt-1 list-disc pl-5 font-mono text-[13px]">
                {impact.startHere.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {impact.openDependents.length > 0 ? (
            <Notice
              kind="warn"
              title={v("visibility.openTitle", { count: impact.openDependents.length, name })}
            >
              <p>{v("visibility.openBody")}</p>
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
          {v("cancel")}
        </Button>
        <Button
          type="submit"
          loading={pending}
          disabled={!impact || "error" in impact}
          disabledReason={blocked ? v("visibility.blocked") : null}
        >
          {to === "private" ? v("visibility.makePrivate") : v("visibility.makePublic")}
        </Button>
      </DialogActions>
    </form>
  );
};

/**
 * Rename (113), for root and the workspace's admins: the new name, checked as typed, and what
 * changes. Saving goes to the new address; the old one answers as unknown.
 */
export const RenameForm = ({
  name,
  onDone,
  loaded,
}: {
  name: string;
  onDone: () => void;
  /** How many items it has, when it's already known (its test); else it's read on open. */
  loaded?: RenameImpactResult;
}) => {
  const t = useTranslations("admin.workspaces.dialogs");
  const problems = useTranslations("common.nameProblem");
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    renameWorkspaceFromForm,
    {},
  );
  const [impact, setImpact] = useState<RenameImpactResult | null>(loaded ?? null);
  const [typed, setTyped] = useState(name);
  useEffect(() => {
    if (loaded) return;
    renameImpactFor(name)
      .then(setImpact)
      .catch(() => setImpact({ error: LOAD_FAILED }));
  }, [name, loaded]);
  const to = normalizeWorkspaceName(typed);
  const problem = typed ? nameProblem(to, "workspace") : null;
  const same = to === name;
  const shown = problem || same || !to ? "…" : to;
  const items = impact && "items" in impact ? impact.items : null;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="name" value={name} />
      <div className="grid gap-1.5">
        <Label htmlFor={`rename-${name}`}>{t("rename.newName")}</Label>
        <input
          id={`rename-${name}`}
          name="to"
          required
          maxLength={65}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby={`rename-${name}-hint`}
          aria-invalid={problem ? true : undefined}
          className={inputClasses}
        />
        <p id={`rename-${name}-hint`} className="text-xs text-muted">
          {problem ? problems(problem, { max: NAME_MAX_LENGTH }) : t("rename.hint")}
        </p>
      </div>
      {impact && "error" in impact ? (
        <FieldError id={`rename-${name}-load`}>
          {impact.error === LOAD_FAILED ? t("rename.loadFailed") : impact.error}
        </FieldError>
      ) : (
        <Notice kind="warn" title={t("rename.changesTitle")}>
          <p>
            {items === null
              ? t.rich("rename.itemsUnknown", { from: name, to: shown, mono })
              : t.rich("rename.items", { count: items, from: name, to: shown, mono })}
          </p>
          <p className="mt-2">{t.rich("rename.links", { mono })}</p>
        </Notice>
      )}
      <Help id="rename-workspace" />
      <FieldError id={`rename-${name}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={pending}
          disabledReason={problem ? t("rename.fixName") : same ? t("rename.typeNew") : null}
        >
          {t("rename.button")}
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
  const t = useTranslations("admin.workspaces.dialogs.create");
  const dialog = useDialog();
  return (
    <>
      <Button onClick={dialog.show}>{t("button")}</Button>
      <Dialog open={dialog.open} onClose={dialog.close} title={t("title")}>
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
  const t = useTranslations("admin.workspaces.dialogs.edit");
  const dialog = useDialog();
  return (
    <>
      <Button variant="secondary" onClick={dialog.show}>
        {t("button")}
      </Button>
      <Dialog open={dialog.open} onClose={dialog.close} title={t("title")}>
        <EditWorkspaceForm
          key={dialog.round}
          name={name}
          description={description}
          onDone={dialog.close}
        />
      </Dialog>
    </>
  );
};

/** Rename (113) on a workspace's page, for root and its admins; not for `global`. */
export const RenameWorkspaceButton = ({ name }: { name: string }) => {
  const t = useTranslations("admin.workspaces.dialogs.rename");
  const dialog = useDialog();
  return (
    <>
      <Button variant="secondary" onClick={dialog.show}>
        {t("button")}
      </Button>
      <Dialog open={dialog.open} onClose={dialog.close} title={t("title")}>
        {dialog.open ? <RenameForm key={dialog.round} name={name} onDone={dialog.close} /> : null}
      </Dialog>
    </>
  );
};

/** Delete, only while the workspace has no scopes: nothing moves scopes to another one yet. */
export const DeleteWorkspaceButton = ({ name, scopes }: { name: string; scopes: number }) => {
  const t = useTranslations("admin.workspaces.dialogs.delete");
  const dialog = useDialog();
  return (
    <>
      <Button
        variant="secondary"
        onClick={dialog.show}
        disabledReason={scopes > 0 ? t("reason") : null}
      >
        {t("button")}
      </Button>
      <Dialog open={dialog.open} onClose={dialog.close} title={t("title")}>
        <DeleteWorkspaceForm key={dialog.round} name={name} onDone={dialog.close} />
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
  const t = useTranslations("admin.workspaces.dialogs.visibility");
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
        {to === "private" ? t("makePrivate") : t("makePublic")}
      </Button>
      <Dialog
        open={dialog.open}
        onClose={dialog.close}
        title={asked === "private" ? t("makePrivate") : t("makePublic")}
      >
        {dialog.open ? (
          <VisibilityForm key={dialog.round} name={name} to={asked} onDone={dialog.close} />
        ) : null}
      </Dialog>
    </>
  );
};
