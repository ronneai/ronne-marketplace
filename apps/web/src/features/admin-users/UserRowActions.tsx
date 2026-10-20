"use client";

import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Dialog } from "@/components/ui/Dialog";
import { DownloadDataButton } from "./DownloadDataDialog";
import { EraseUserButton } from "./EraseUserDialog";
import { ActionForm, type Kind, type RowUser, TITLES } from "./UserActionDialogs";

const rowButton =
  "rounded-control px-2 py-1 text-xs whitespace-nowrap text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * A row's actions: change role, reset password, reset two-factor when it's on (105), disable or
 * enable (spec 008), download their data (104), erase (103), on every row,
 * other roots' included, except your own: another root changes that one (059). An erased row
 * keeps only the greyed download of their data, since nothing can change it again.
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
  if (user.erased)
    return (
      <div className="flex justify-end">
        <button
          type="button"
          className={`${rowButton} cursor-not-allowed opacity-50`}
          disabled
          title="This account was erased: there's nothing of theirs to download."
          aria-label={`Download the data of ${user.email}: erased`}
        >
          Download their data (erased)
        </button>
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
        {user.twoFactor ? (
          <button type="button" className={rowButton} onClick={open("twoFactor")}>
            Reset two-factor
          </button>
        ) : null}
        <button
          type="button"
          className={rowButton}
          onClick={open(user.disabled ? "enable" : "disable")}
        >
          {user.disabled ? "Enable" : "Disable"}
        </button>
        <DownloadDataButton user={user} />
        <EraseUserButton
          user={{ id: user.id, email: user.email, name: user.name ?? user.email, role: user.role }}
        />
      </fieldset>
      <Dialog open={kind !== null} onClose={close} title={kind ? TITLES[kind] : ""}>
        {kind ? <ActionForm key={round} kind={kind} user={user} onDone={close} /> : null}
      </Dialog>
    </>
  );
};
