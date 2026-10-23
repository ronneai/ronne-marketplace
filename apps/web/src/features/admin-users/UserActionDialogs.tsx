"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { FieldError, Label, selectClasses } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
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
type TitledKind = "role" | "disable" | "enable" | "reset" | "twoFactor";
export type Kind = TitledKind | "askChange" | "clearChange";
type FormAction = (state: AdminActionState, form: FormData) => Promise<AdminActionState>;

const TITLES: Record<TitledKind, string> = {
  role: "Change role",
  disable: "Disable user",
  enable: "Enable user",
  reset: "Reset password",
  twoFactor: "Reset two-factor",
};

/** Every dialog's title; the password-change ones are messages (128). */
export const useTitles = (): Record<Kind, string> => {
  const t = useTranslations("admin.passwordChange");
  return { ...TITLES, askChange: t("askTitle"), clearChange: t("clearTitle") };
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

const DisableImpact = ({ userId }: { userId: string }) => {
  const [impact, setImpact] = useState<string>("Counting their sessions and tokens…");
  useEffect(() => {
    disableImpactFor(userId).then((result) =>
      setImpact(
        "error" in result
          ? result.error
          : `This signs them out everywhere (${result.sessions} ${result.sessions === 1 ? "session" : "sessions"}) and revokes ${result.tokens} access ${result.tokens === 1 ? "token" : "tokens"}. They can't sign in until you enable them.`,
      ),
    );
  }, [userId]);
  return <p className="text-sm text-muted">{impact}</p>;
};

/**
 * Before Disable or Enable on an account a provider's SCIM manages (108): its next sync sets it
 * back to what the provider says.
 */
export const ScimManagedNotice = ({ managedBy }: { managedBy?: string }) =>
  managedBy ? (
    <Notice kind="warn" title={`${managedBy} manages this account through SCIM.`}>
      Its next sync sets the account back to what the provider says: change it there too.{" "}
      <Help id="scim-managed" />
    </Notice>
  ) : null;

/** What a role change means, said before it happens; root changes are warnings (059). */
export const RoleChangeNotice = ({ email, from, to }: { email: string; from: Role; to: Role }) => {
  if (to === "root")
    return (
      <Notice kind="warn" title={`Make ${email} root?`}>
        They&apos;ll be able to do everything you can, including changing your role or disabling
        you.
      </Notice>
    );
  if (from === "root")
    return (
      <Notice kind="warn" title={`Remove root from ${email}?`}>
        They&apos;ll lose user admin, scopes, settings and the audit log on their next request.
      </Notice>
    );
  return (
    <p className="text-sm text-muted">
      Change their role from <strong className="text-fg">{from}</strong> to{" "}
      <strong className="text-fg">{to}</strong>.
    </p>
  );
};

const RoleChoice = ({ user }: { user: RowUser }) => {
  const others = ROLES.filter((role) => role !== user.role);
  const [role, setRole] = useState<Role>(others[0] ?? "user");
  const id = `role-${user.id}`;
  return (
    <>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>New role</Label>
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
              {r}
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

  if (state.oneTime || state.done)
    return (
      <div className="grid gap-4">
        {state.oneTime ? (
          <OneTimePassword value={state.oneTime} />
        ) : (
          <Notice kind="info" title={state.done} />
        )}
        <div>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <p className="font-mono text-[13px] text-fg">{user.email}</p>
      {kind === "role" ? <RoleChoice user={user} /> : null}
      {kind === "disable" && user.role === "root" ? (
        <Notice kind="warn" title={`${user.email} is a root.`} />
      ) : null}
      {kind === "disable" ? <DisableImpact userId={user.id} /> : null}
      {kind === "disable" || kind === "enable" ? (
        <ScimManagedNotice managedBy={user.managedBy} />
      ) : null}
      {kind === "enable" ? (
        <p className="text-sm text-muted">
          They can sign in again. Their revoked access tokens stay revoked.
        </p>
      ) : null}
      {kind === "reset" && user.role === "root" ? (
        <Notice kind="warn" title={`${user.email} is a root.`} />
      ) : null}
      {kind === "reset" ? (
        <>
          <p className="text-sm text-muted">
            This signs them out everywhere and revokes their access tokens.
          </p>
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
          <p className="text-sm text-muted">
            For a lost phone and lost backup codes. This turns off their two-factor sign-in and
            signs them out everywhere; they sign in with their password alone, and set it up again
            if it's required of them.
          </p>
          <Help id="reset-two-factor" />
        </div>
      ) : null}
      <FieldError id={`${kind}-${user.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {titles[kind]}
        </Button>
      </DialogActions>
    </form>
  );
};
