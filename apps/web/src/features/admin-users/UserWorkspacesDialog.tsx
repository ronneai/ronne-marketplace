"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { useToastWhen } from "@/components/ui/toast";
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
  const t = useTranslations("admin.userWorkspaces");
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

  useToastWhen(state, state.done, "ok", onDone);
  if (state.done) return null;
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
        <p className="text-sm text-muted">{t("loading")}</p>
      )}
      <FieldError id={`workspaces-${user.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!rows}>
          {t("save")}
        </Button>
      </DialogActions>
    </form>
  );
};

/**
 * A user's Workspaces (092): their workspaces and roles, editable; Save applies the difference.
 * The button on the user's page (123). Not offered for root, who works in every workspace.
 */
export const UserWorkspacesButton = ({
  user,
  workspaces,
  children,
}: {
  user: { id: string; email: string };
  workspaces: readonly WorkspaceOption[];
  /** The button's label. */
  children: ReactNode;
}) => {
  const t = useTranslations("admin.userWorkspaces");
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onClose={close} title={t("title", { email: user.email })}>
        {open ? (
          <UserWorkspacesForm key={round} user={user} workspaces={workspaces} onDone={close} />
        ) : null}
      </Dialog>
    </>
  );
};
