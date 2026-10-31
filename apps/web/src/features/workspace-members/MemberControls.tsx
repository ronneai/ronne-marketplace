"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { useToast, useToastWhen } from "@/components/ui/toast";
import type { WorkspaceRole } from "@/server/domains/identity/models/user";
import {
  addMembersFromForm,
  changeMemberRoleFromForm,
  findCandidates,
  removeMemberFromForm,
} from "./actions";
import type { Candidate, MemberActionState } from "./types";

/** The workspace a member control acts in. */
export type MembersWorkspace = { id: string; name: string };

const ROLES = ["user", "moderator", "admin"] as const satisfies readonly WorkspaceRole[];

const RoleOptions = () => {
  const roles = useTranslations("common.roleTitle");
  return (
    <>
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {roles(role)}
        </option>
      ))}
    </>
  );
};

const Hidden = ({ workspace, userId }: { workspace: MembersWorkspace; userId?: string }) => (
  <>
    <input type="hidden" name="workspaceId" value={workspace.id} />
    <input type="hidden" name="workspace" value={workspace.name} />
    {userId ? <input type="hidden" name="userId" value={userId} /> : null}
  </>
);

/**
 * A member's role, saved as soon as another is picked; a refusal is said as an error toast (138), and the select
 * goes back to the stored role. The action is called directly, not as a form's action: React
 * resets a form after its action, which put the select back on another role until a reload.
 */
export const MemberRoleSelect = ({
  workspace,
  member,
}: {
  workspace: MembersWorkspace;
  member: { userId: string; email: string; role: WorkspaceRole };
}) => {
  const t = useTranslations("workspaces.members");
  const [role, setRole] = useState(member.role);
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  useEffect(() => setRole(member.role), [member.role]);
  const change = (next: WorkspaceRole) => {
    setRole(next);
    const form = new FormData();
    form.set("workspaceId", workspace.id);
    form.set("workspace", workspace.name);
    form.set("userId", member.userId);
    form.set("role", next);
    startTransition(async () => {
      const result = await changeMemberRoleFromForm({}, form);
      if (result.error) {
        toast.error(result.error);
        setRole(member.role);
      }
    });
  };
  return (
    <div className="grid gap-1">
      {/* The select fills its box (`selectClasses` has `w-full`): the box sets its width. */}
      <div className="w-32">
        <select
          aria-label={t("roleOf", { email: member.email })}
          value={role}
          disabled={pending}
          onChange={(event) => change(event.target.value as WorkspaceRole)}
          className={selectClasses}
        >
          <RoleOptions />
        </select>
      </div>
    </div>
  );
};

/** Remove, after a confirm; `global`'s members can't be removed, so it isn't offered there. */
export const RemoveMemberButton = ({
  workspace,
  member,
}: {
  workspace: MembersWorkspace;
  member: { userId: string; email: string };
}) => {
  const t = useTranslations("workspaces.members");
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
        aria-label={t("removeAria", { email: member.email })}
        onClick={() => setOpen(true)}
        className="rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {t("remove")}
      </button>
      <Dialog open={open} onClose={close} title={t("removeTitle")}>
        {open ? (
          <RemoveForm key={round} workspace={workspace} member={member} onDone={close} />
        ) : null}
      </Dialog>
    </>
  );
};

const RemoveForm = ({
  workspace,
  member,
  onDone,
}: {
  workspace: MembersWorkspace;
  member: { userId: string; email: string };
  onDone: () => void;
}) => {
  const t = useTranslations("workspaces.members");
  // Once removed, the page refreshes without their row, which takes this dialog with it: the
  // row going is the confirmation.
  const [state, action, pending] = useActionState<MemberActionState, FormData>(
    removeMemberFromForm,
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <Hidden workspace={workspace} userId={member.userId} />
      <p className="text-sm">
        {t.rich("removeBody", {
          email: member.email,
          workspace: workspace.name,
          mono: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </p>
      <FieldError id={`remove-${member.userId}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="destructive" loading={pending}>
          {t("remove")}
        </Button>
      </DialogActions>
    </form>
  );
};

/** Add members: search people not in the workspace yet, pick some, give them one role. */
const AddForm = ({ workspace, onDone }: { workspace: MembersWorkspace; onDone: () => void }) => {
  const t = useTranslations("workspaces.members");
  const [state, action, pending] = useActionState<MemberActionState, FormData>(
    addMembersFromForm,
    {},
  );
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Candidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Candidate[]>([]);
  const latest = useRef("");
  useEffect(() => {
    latest.current = query;
    if (!query.trim()) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => {
      findCandidates(workspace.id, query).then((result) => {
        if (latest.current !== query) return;
        if ("error" in result) setSearchError(result.error);
        else {
          setSearchError(null);
          setFound(result.users);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, workspace.id]);

  useToastWhen(state, state.done, "ok", onDone);
  if (state.done) return null;
  const choices = found.filter((user) => !picked.some((p) => p.id === user.id));
  return (
    <form action={action} className="grid gap-4">
      <Hidden workspace={workspace} />
      <div className="grid gap-1.5">
        <Label htmlFor="member-search">{t("findPeople")}</Label>
        <input
          id="member-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-describedby="member-search-hint"
          className={inputClasses}
        />
        <p id="member-search-hint" className="text-xs text-muted">
          {t("findHint", { workspace: workspace.name })}
        </p>
        {searchError ? <FieldError id="member-search-error">{searchError}</FieldError> : null}
        {choices.length > 0 ? (
          <ul aria-label={t("found")} className="grid gap-1">
            {choices.map((user) => (
              <li key={user.id} className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-mono text-[13px]">{user.email}</span>{" "}
                  <span className="text-muted">{user.name}</span>
                </span>
                <Button
                  variant="secondary"
                  aria-label={t("pickAria", { email: user.email })}
                  onClick={() => setPicked([...picked, user])}
                >
                  {t("pick")}
                </Button>
              </li>
            ))}
          </ul>
        ) : query.trim() && !searchError ? (
          <p className="text-xs text-muted">{t("nobody")}</p>
        ) : null}
      </div>
      {picked.length > 0 ? (
        <ul aria-label={t("toAdd")} className="flex flex-wrap gap-2">
          {picked.map((user) => (
            <li
              key={user.id}
              className="flex min-w-0 items-center gap-1 rounded-control border border-hairline px-2 py-1 font-mono text-[13px]"
            >
              <input type="hidden" name="userId" value={user.id} />
              <span className="min-w-0 truncate">{user.email}</span>
              <button
                type="button"
                aria-label={t("unpickAria", { email: user.email })}
                onClick={() => setPicked(picked.filter((p) => p.id !== user.id))}
                className="rounded-sm px-1 text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="member-role">{t("role")}</Label>
          <Help id="member-roles" />
        </div>
        <select id="member-role" name="role" defaultValue="user" className={selectClasses}>
          <RoleOptions />
        </select>
      </div>
      <FieldError id="add-members-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={pending}
          disabledReason={picked.length === 0 ? t("pickFirst") : null}
        >
          {t("addMembers")}
        </Button>
      </DialogActions>
    </form>
  );
};

export const AddMembersDialog = ({ workspace }: { workspace: MembersWorkspace }) => {
  const t = useTranslations("workspaces.members");
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("addMembers")}</Button>
      <Dialog open={open} onClose={close} title={t("addTitle", { workspace: workspace.name })}>
        {open ? <AddForm key={round} workspace={workspace} onDone={close} /> : null}
      </Dialog>
    </>
  );
};
