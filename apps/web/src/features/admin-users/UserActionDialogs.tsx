"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { FieldError, Label, selectClasses } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import {
  changeRoleFromForm,
  disableImpactFor,
  disableUserFromForm,
  enableUserFromForm,
  resetPasswordFromForm,
  resetTwoFactorFromForm,
  setPasswordChangeFromForm,
} from "./actions";
import { OneTimePassword } from "./OneTimePassword";
import { PasswordChoice } from "./PasswordChoice";
import type { AdminActionState } from "./types";

export type Role = "root" | "user";
export type RowUser = {
  id: string;
  email: string;
  /** For the erase dialog (103), which names the account. */
  name?: string;
  role: Role;
  disabled: boolean;
  /** Erased (103): the row's only action is the greyed data download (104). */
  erased?: boolean;
  /** Two-factor sign-in is on (105): only then is "Reset two-factor" offered. */
  twoFactor?: boolean;
  /** Asked to choose a new password at the next sign-in (128). */
  passwordChange?: boolean;
  /** The signed-in root's own row: read-only here (059). */
  self?: boolean;
  /** The provider whose SCIM manages the account (108), which its next sync can undo. */
  managedBy?: string;
};

const ROLES: readonly Role[] = ["user", "root"];
export type Kind =
  | "role"
  | "disable"
  | "enable"
  | "reset"
  | "twoFactor"
  | "askChange"
  | "clearChange";
type FormAction = (state: AdminActionState, form: FormData) => Promise<AdminActionState>;

/** Every dialog's title: messages, the password-change ones from 128's. */
export const useTitles = (): Record<Kind, string> => {
  const t = useTranslations("admin.passwordChange");
  const titles = useTranslations("admin.actions.titles");
  return {
    role: titles("role"),
    disable: titles("disable"),
    enable: titles("enable"),
    reset: titles("reset"),
    twoFactor: titles("twoFactor"),
    askChange: t("askTitle"),
    clearChange: t("clearTitle"),
  };
};

const ACTIONS: Record<Kind, FormAction> = {
  role: changeRoleFromForm,
  disable: disableUserFromForm,
  enable: enableUserFromForm,
  reset: resetPasswordFromForm,
  twoFactor: resetTwoFactorFromForm,
  askChange: setPasswordChangeFromForm,
  clearChange: setPasswordChangeFromForm,
};

type Impact = { error: string } | { sessions: number; tokens: number } | null;

const DisableImpact = ({ userId }: { userId: string }) => {
  const t = useTranslations("admin.actions");
  const [impact, setImpact] = useState<Impact>(null);
  useEffect(() => {
    disableImpactFor(userId).then(setImpact);
  }, [userId]);
  return (
    <p className="text-sm text-muted">
      {impact === null
        ? t("impactLoading")
        : "error" in impact
          ? impact.error
          : t("impact", { sessions: impact.sessions, tokens: impact.tokens })}
    </p>
  );
};

/**
 * Before Disable or Enable on an account a provider's SCIM manages (108): its next sync sets it
 * back to what the provider says.
 */
export const ScimManagedNotice = ({ managedBy }: { managedBy?: string }) => {
  const t = useTranslations("admin.actions");
  return managedBy ? (
    <Notice kind="warn" title={t("scimTitle", { provider: managedBy })}>
      {t("scimBody")} <Help id="scim-managed" />
    </Notice>
  ) : null;
};

/** What a role change means, said before it happens; root changes are warnings (059). */
export const RoleChangeNotice = ({ email, from, to }: { email: string; from: Role; to: Role }) => {
  const t = useTranslations("admin.actions");
  const roles = useTranslations("common.roles");
  if (to === "root")
    return (
      <Notice kind="warn" title={t("makeRoot.title", { email })}>
        {t("makeRoot.body")}
      </Notice>
    );
  if (from === "root")
    return (
      <Notice kind="warn" title={t("removeRoot.title", { email })}>
        {t("removeRoot.body")}
      </Notice>
    );
  return (
    <p className="text-sm text-muted">
      {t.rich("changeRole", {
        from: () => <strong className="text-fg">{roles(from)}</strong>,
        to: () => <strong className="text-fg">{roles(to)}</strong>,
      })}
    </p>
  );
};

const RoleChoice = ({ user }: { user: RowUser }) => {
  const t = useTranslations("admin.actions");
  const roles = useTranslations("common.roles");
  const others = ROLES.filter((role) => role !== user.role);
  const [role, setRole] = useState<Role>(others[0] ?? "user");
  const id = `role-${user.id}`;
  return (
    <>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{t("newRole")}</Label>
          <Help id="role-root" />
        </div>
        <select
          id={id}
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          className={selectClasses}
        >
          {others.map((r) => (
            <option key={r} value={r}>
              {roles(r)}
            </option>
          ))}
        </select>
      </div>
      <RoleChangeNotice email={user.email} from={user.role} to={role} />
    </>
  );
};

/** One dialog's form. It's remounted each time the dialog opens, so no result lingers. */
export const ActionForm = ({
  kind,
  user,
  onDone,
}: {
  kind: Kind;
  user: RowUser;
  onDone: () => void;
}) => {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(ACTIONS[kind], {});
  const titles = useTitles();
  const t = useTranslations("admin.passwordChange");
  const a = useTranslations("admin.actions");

  // A one-time password is a result to read and copy, so it stays in the dialog (138).
  useToastWhen(state, state.done, "ok", onDone);
  if (state.oneTime)
    return (
      <div className="grid gap-4">
        <OneTimePassword value={state.oneTime} />
        <div>
          <Button onClick={onDone}>{a("done")}</Button>
        </div>
      </div>
    );
  if (state.done) return null;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <p className="font-mono text-[13px] text-fg">{user.email}</p>
      {kind === "role" ? <RoleChoice user={user} /> : null}
      {kind === "disable" && user.role === "root" ? (
        <Notice kind="warn" title={a("isRoot", { email: user.email })} />
      ) : null}
      {kind === "disable" ? <DisableImpact userId={user.id} /> : null}
      {kind === "disable" || kind === "enable" ? (
        <ScimManagedNotice managedBy={user.managedBy} />
      ) : null}
      {kind === "enable" ? <p className="text-sm text-muted">{a("enableBody")}</p> : null}
      {kind === "reset" && user.role === "root" ? (
        <Notice kind="warn" title={a("isRoot", { email: user.email })} />
      ) : null}
      {kind === "reset" ? (
        <>
          <p className="text-sm text-muted">{a("resetBody")}</p>
          <PasswordChoice idPrefix={`reset-${user.id}`} />
        </>
      ) : null}
      {kind === "askChange" || kind === "clearChange" ? (
        <>
          <input type="hidden" name="required" value={kind === "askChange" ? "true" : "false"} />
          <p className="text-sm text-muted">{t(kind === "askChange" ? "askBody" : "clearBody")}</p>
        </>
      ) : null}
      {kind === "twoFactor" ? (
        <div className="grid gap-1.5">
          <p className="text-sm text-muted">{a("twoFactorBody")}</p>
          <Help id="reset-two-factor" />
        </div>
      ) : null}
      <FieldError id={`${kind}-${user.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {a("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {titles[kind]}
        </Button>
      </DialogActions>
    </form>
  );
};
