"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ActionForm, type Kind, type RowUser, TITLES } from "./UserActionDialogs";

const LABELS: Record<Kind, string> = {
  role: "Change role",
  reset: "Reset password",
  twoFactor: "Reset two-factor",
  disable: "Disable",
  enable: "Enable",
};

/**
 * One of a user's actions, as a button on their page (123) that opens the dialog it opens from the
 * list's rows: the same form, the same server action. Each button owns its dialog, and it is
 * remounted when it opens, so no result lingers.
 */
export const UserActionButton = ({
  kind,
  user,
  children,
}: {
  kind: Kind;
  user: RowUser;
  children?: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {children ?? LABELS[kind]}
      </Button>
      <Dialog open={open} onClose={close} title={TITLES[kind]}>
        {open ? <ActionForm key={round} kind={kind} user={user} onDone={close} /> : null}
      </Dialog>
    </>
  );
};

/** What an erased account's page offers: the greyed download, as its row did (103, 104). */
export const ErasedDownloadButton = ({ email }: { email: string }) => (
  <Button
    variant="secondary"
    disabledReason="This account was erased: there's nothing of theirs to download."
    aria-label={`Download the data of ${email}: erased`}
  >
    Download their data (erased)
  </Button>
);
