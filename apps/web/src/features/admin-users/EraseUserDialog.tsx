"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, Input, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { eraseUserFromForm } from "./actions";
import { dataHref } from "./DownloadDataDialog";
import type { AdminActionState } from "./types";

export type ErasableUser = { id: string; email: string; name: string; role: "root" | "user" };

/** Whether what root typed is the account's email: any case, spaces around it ignored. */
export const confirmsEmail = (typed: string, email: string): boolean =>
  typed.trim().toLowerCase() === email;

/** What goes, and what stays under the pseudonym, in plain words (103's table). */
const GOES = [
  "Their email, name and picture: the account becomes deleted-user-<id>.",
  "Their password, identity-provider links and two-factor sign-in.",
  "Every session, access token and rmk login approval.",
  "Their SCIM links, so the provider's next create makes a new account.",
  "Their workspace memberships, open requests to join and open scope moves.",
  "Their drafts, which only they could see.",
  "Their IP address on every audit event, and their email in any event's details.",
];
const STAYS = [
  "The items they published and every version, shown as published by deleted-user-<id>.",
  "Their submitted, approved and rejected submissions, and every review comment.",
  "The audit events they appear in, with the pseudonym as who.",
  "Their personal workspace, renamed, when it holds a published item or a submission; otherwise it's deleted.",
];

/**
 * The erase confirmation (103): the account, what goes and what stays, a reminder to give the
 * person what they asked for first, and the account's email typed to enable Erase. It's remounted each time the
 * dialog opens, so no result lingers.
 */
export const EraseUserForm = ({
  user,
  onDone,
  initialState = {},
  initialTyped = "",
}: {
  user: ErasableUser;
  onDone: () => void;
  /** The state to start from and what's typed, for the component tests of each state. */
  initialState?: AdminActionState;
  initialTyped?: string;
}) => {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    eraseUserFromForm,
    initialState,
  );
  const [typed, setTyped] = useState(initialTyped);
  const confirmed = confirmsEmail(typed, user.email);
  const id = `erase-${user.id}`;

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
      <input type="hidden" name="userId" value={user.id} />
      <p className="text-sm text-fg">
        <span className="font-semibold">{user.name}</span>{" "}
        <span className="font-mono text-[13px] text-muted">{user.email}</span>
      </p>
      <Notice kind="warn" title="This can't be undone.">
        Erasing is the end of the account: nothing brings the person back, and the old email is free
        for a new account at once. To stop someone without erasing, disable them instead.{" "}
        <Help id="erase-user" />
      </Notice>
      {user.role === "root" ? (
        <Notice kind="warn" title={`${user.email} is a root.`}>
          Their role goes with the account.
        </Notice>
      ) : null}
      {/* Side by side from `md` up, so the dialog is wide and short rather than narrow and tall. */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="grid content-start gap-1 text-sm">
          <p className="font-semibold text-fg">What goes</p>
          <ul className="list-disc pl-5 text-muted">
            {GOES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-1 text-sm">
          <p className="font-semibold text-fg">What stays, under the pseudonym</p>
          <ul className="list-disc pl-5 text-muted">
            {STAYS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      {/* The reminder and the confirmation side by side from `md` up: shorter, so it fits a laptop. */}
      <div className="grid gap-4 md:grid-cols-2 md:items-end md:gap-6">
        <p className="text-sm text-muted">
          Nothing of theirs can be read back afterwards: if the person asked for what the instance
          holds about them, give it to them first.{" "}
          <a href={dataHref(user.id)} className="underline underline-offset-2 hover:text-fg">
            Download their data
          </a>
          .
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor={id}>Type the account&apos;s email to confirm</Label>
          <Input
            id={id}
            name="confirm"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder={user.email}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
      </div>
      <FieldError id={`${id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" loading={pending} disabled={!confirmed}>
          Erase
        </Button>
      </DialogActions>
    </form>
  );
};

/**
 * Opens the erase dialog, from the button on the user's page (123). Each button owns its dialog.
 * Closing it refreshes the page, which the action itself doesn't (the page would turn into the
 * erased account's before root read the outcome).
 */
export const EraseUserButton = ({ user }: { user: ErasableUser }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
    router.refresh();
  };
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Erase
      </Button>
      <Dialog open={open} onClose={close} title="Erase user" size="xlarge">
        {open ? <EraseUserForm key={round} user={user} onDone={close} /> : null}
      </Dialog>
    </>
  );
};
