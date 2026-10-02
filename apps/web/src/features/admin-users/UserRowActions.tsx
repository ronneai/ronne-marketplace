"use client";

import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, Label, selectClasses } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  changeRoleFromForm,
  disableImpactFor,
  disableUserFromForm,
  enableUserFromForm,
  resetPasswordFromForm,
} from "./actions";
import { OneTimePassword } from "./OneTimePassword";
import { PasswordChoice } from "./PasswordChoice";
import type { AdminActionState } from "./types";

type Role = "root" | "moderator" | "user";
type RowUser = {
  id: string;
  email: string;
  role: Role;
  disabled: boolean;
  /** The signed-in root's own row: read-only here (059). */
  self?: boolean;
};

const ROLES: readonly Role[] = ["user", "moderator", "root"];
type Kind = "role" | "disable" | "enable" | "reset";
type FormAction = (state: AdminActionState, form: FormData) => Promise<AdminActionState>;

const rowButton =
  "rounded-control px-2 py-1 text-xs whitespace-nowrap text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

const TITLES: Record<Kind, string> = {
  role: "Change role",
  disable: "Disable user",
  enable: "Enable user",
  reset: "Reset password",
};

const ACTIONS: Record<Kind, FormAction> = {
  role: changeRoleFromForm,
  disable: disableUserFromForm,
  enable: enableUserFromForm,
  reset: resetPasswordFromForm,
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
const ActionForm = ({ kind, user, onDone }: { kind: Kind; user: RowUser; onDone: () => void }) => {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(ACTIONS[kind], {});

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
      <FieldError id={`${kind}-${user.id}-error`}>{state.error}</FieldError>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {TITLES[kind]}
        </Button>
      </div>
    </form>
  );
};

/**
 * A row's actions: change role, reset password, disable or enable (spec 008), on every row,
 * other roots' included, except your own: another root changes that one (059).
 */
export const UserRowActions = ({ user }: { user: RowUser }) => {
  const [kind, setKind] = useState<Kind | null>(null);
  const [round, setRound] = useState(0);
  if (user.self)
    return (
      <div className="flex justify-end">
        <Help id="own-row" iconOnly />
      </div>
    );

  const open = (next: Kind) => () => setKind(next);
  const close = () => {
    setKind(null);
    setRound((r) => r + 1);
  };

  return (
    <>
      {/* Plain buttons, not a dropdown: the table scrolls sideways, and would clip a menu. */}
      <fieldset
        aria-label={`Actions for ${user.email}`}
        className="m-0 flex min-w-0 justify-end gap-1 border-0 p-0"
      >
        <button type="button" className={rowButton} onClick={open("role")}>
          Change role
        </button>
        <button type="button" className={rowButton} onClick={open("reset")}>
          Reset password
        </button>
        <button
          type="button"
          className={rowButton}
          onClick={open(user.disabled ? "enable" : "disable")}
        >
          {user.disabled ? "Enable" : "Disable"}
        </button>
      </fieldset>
      <Dialog open={kind !== null} onClose={close} title={kind ? TITLES[kind] : ""}>
        {kind ? <ActionForm key={round} kind={kind} user={user} onDone={close} /> : null}
      </Dialog>
    </>
  );
};
