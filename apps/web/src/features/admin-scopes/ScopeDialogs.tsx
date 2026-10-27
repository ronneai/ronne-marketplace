"use client";

import { NAME_MAX_LENGTH, nameProblem, normalizeScopeName } from "@ronneai/core";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { createScopeFromForm, updateScopeFromForm } from "./actions";
import type { ScopeActionState } from "./types";

/** A name in the monospace face the sentences around it use. */
const mono = (chunks: React.ReactNode) => <span className="font-mono text-fg">{chunks}</span>;

const Description = ({ defaultValue }: { defaultValue?: string }) => {
  const t = useTranslations("admin.scopes.description");
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="scope-description">{t("label")}</Label>
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
      <p className="text-xs text-muted">{t("hint", { used: [...value].length, max: 300 })}</p>
    </div>
  );
};

/** The workspace a new scope goes in: the one whose page it's created on (092, 115). */
export type WorkspaceChoice = { id: string; name: string };

const InWorkspace = ({ workspace }: { workspace: WorkspaceChoice }) => {
  const t = useTranslations("admin.scopes.create");
  return (
    <p className="text-sm text-muted">
      {t.rich("inWorkspace", { workspace: workspace.name, mono })}
      <input type="hidden" name="workspaceId" value={workspace.id} />
    </p>
  );
};

/** Exported for its test (the dialog renders it only when open). */
export const CreateScopeForm = ({
  workspace,
  onDone,
}: {
  workspace: WorkspaceChoice;
  onDone: () => void;
}) => {
  const t = useTranslations("admin.scopes");
  const problems = useTranslations("common.nameProblem");
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
          <Button onClick={onDone}>{t("done")}</Button>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="scope-name">{t("create.name")}</Label>
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
          {problem
            ? problems(problem, { max: NAME_MAX_LENGTH })
            : t.rich("create.hint", { name: name || t("fallbackName"), mono })}
        </p>
      </div>
      <InWorkspace workspace={workspace} />
      <Description />
      <FieldError id="create-scope-error">{state.error}</FieldError>
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

export const EditScopeForm = ({
  name,
  description,
  onDone,
}: {
  name: string;
  description: string;
  onDone: () => void;
}) => {
  const t = useTranslations("admin.scopes");
  const [state, action, pending] = useActionState<ScopeActionState, FormData>(
    updateScopeFromForm,
    {},
  );
  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title={state.done} />
        <div>
          <Button onClick={onDone}>{t("done")}</Button>
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
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("save")}
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

export const CreateScopeDialog = ({ workspace }: { workspace: WorkspaceChoice }) => {
  const t = useTranslations("admin.scopes.create");
  const dialog = useDialog();
  return (
    <>
      <Button onClick={dialog.show}>{t("button")}</Button>
      <Dialog open={dialog.open} onClose={dialog.close} title={t("title")}>
        <CreateScopeForm key={dialog.round} workspace={workspace} onDone={dialog.close} />
      </Dialog>
    </>
  );
};

export const EditScopeButton = ({ name, description }: { name: string; description: string }) => {
  const t = useTranslations("admin.scopes.edit");
  const dialog = useDialog();
  return (
    <>
      <IconButton onClick={dialog.show} label={t("label", { name })}>
        <Pencil size={16} aria-hidden="true" />
      </IconButton>
      <Dialog open={dialog.open} onClose={dialog.close} title={t("title")}>
        <EditScopeForm
          key={dialog.round}
          name={name}
          description={description}
          onDone={dialog.close}
        />
      </Dialog>
    </>
  );
};
