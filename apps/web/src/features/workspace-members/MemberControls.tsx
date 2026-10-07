"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
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

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  user: "User",
  moderator: "Moderator",
  admin: "Admin",
};

const RoleOptions = () => (
  <>
    {(Object.keys(ROLE_LABELS) as WorkspaceRole[]).map((role) => (
      <option key={role} value={role}>
        {ROLE_LABELS[role]}
      </option>
    ))}
  </>
);

const Hidden = ({ workspace, userId }: { workspace: MembersWorkspace; userId?: string }) => (
  <>
    <input type="hidden" name="workspaceId" value={workspace.id} />
    <input type="hidden" name="workspace" value={workspace.name} />
    {userId ? <input type="hidden" name="userId" value={userId} /> : null}
  </>
);

/**
 * A member's role, saved as soon as another is picked; a refusal shows under it, and the select
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
  const [role, setRole] = useState(member.role);
  const [error, setError] = useState<string | undefined>();
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
      setError(result.error);
      if (result.error) setRole(member.role);
    });
  };
  const errorId = `member-role-${member.userId}-error`;
  return (
    <div className="grid gap-1">
      <select
        aria-label={`Role of ${member.email}`}
        value={role}
        disabled={pending}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => change(event.target.value as WorkspaceRole)}
        className={`${selectClasses} w-32`}
      >
        <RoleOptions />
      </select>
      <FieldError id={errorId}>{error}</FieldError>
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
        aria-label={`Remove ${member.email}`}
        onClick={() => setOpen(true)}
        className="rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        Remove
      </button>
      <Dialog open={open} onClose={close} title="Remove member">
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
        Remove <span className="font-mono">{member.email}</span> from{" "}
        <span className="font-mono">{workspace.name}</span>? They stop proposing and reviewing
        there; what they already submitted stays.
      </p>
      <FieldError id={`remove-${member.userId}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" loading={pending}>
          Remove
        </Button>
      </DialogActions>
    </form>
  );
};

/** Add members: search people not in the workspace yet, pick some, give them one role. */
const AddForm = ({ workspace, onDone }: { workspace: MembersWorkspace; onDone: () => void }) => {
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

  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title={state.done} />
        <div>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  const choices = found.filter((user) => !picked.some((p) => p.id === user.id));
  return (
    <form action={action} className="grid gap-4">
      <Hidden workspace={workspace} />
      <div className="grid gap-1.5">
        <Label htmlFor="member-search">Find people</Label>
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
          By email or name. People already in {workspace.name}, root and disabled users aren't
          listed.
        </p>
        {searchError ? <FieldError id="member-search-error">{searchError}</FieldError> : null}
        {choices.length > 0 ? (
          <ul aria-label="People found" className="grid gap-1">
            {choices.map((user) => (
              <li key={user.id} className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-mono text-[13px]">{user.email}</span>{" "}
                  <span className="text-muted">{user.name}</span>
                </span>
                <Button
                  variant="secondary"
                  aria-label={`Pick ${user.email}`}
                  onClick={() => setPicked([...picked, user])}
                >
                  Pick
                </Button>
              </li>
            ))}
          </ul>
        ) : query.trim() && !searchError ? (
          <p className="text-xs text-muted">Nobody to add matches that yet.</p>
        ) : null}
      </div>
      {picked.length > 0 ? (
        <ul aria-label="To add" className="flex flex-wrap gap-2">
          {picked.map((user) => (
            <li
              key={user.id}
              className="flex min-w-0 items-center gap-1 rounded-control border border-hairline px-2 py-1 font-mono text-[13px]"
            >
              <input type="hidden" name="userId" value={user.id} />
              <span className="min-w-0 truncate">{user.email}</span>
              <button
                type="button"
                aria-label={`Unpick ${user.email}`}
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
          <Label htmlFor="member-role">Role</Label>
          <Help id="member-roles" />
        </div>
        <select id="member-role" name="role" defaultValue="user" className={selectClasses}>
          <RoleOptions />
        </select>
      </div>
      <FieldError id="add-members-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={pending}
          disabledReason={picked.length === 0 ? "Pick someone first." : null}
        >
          Add members
        </Button>
      </DialogActions>
    </form>
  );
};

export const AddMembersDialog = ({ workspace }: { workspace: MembersWorkspace }) => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add members</Button>
      <Dialog open={open} onClose={close} title={`Add members to ${workspace.name}`}>
        {open ? <AddForm key={round} workspace={workspace} onDone={close} /> : null}
      </Dialog>
    </>
  );
};
