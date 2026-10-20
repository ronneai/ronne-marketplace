"use client";

import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";

const rowButton =
  "rounded-control px-2 py-1 text-xs whitespace-nowrap text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** The address of root's download of a person's data (104). */
export const dataHref = (userId: string): string => `/admin/users/${userId}/data`;

type DataUser = { id: string; email: string };

/**
 * What the dialog says: the file is the one they would get from their Account page, it counts as
 * their download for 10 minutes, and the audit log records that root made it. The download is a
 * link, so the browser saves the file.
 */
export const DownloadDataBody = ({ user, onClose }: { user: DataUser; onClose: () => void }) => (
  <div className="grid gap-4">
    <p className="font-mono text-[13px] text-fg">{user.email}</p>
    <p className="text-sm text-muted">
      The JSON file they would get from their Account page: their account, sessions, token names,
      workspaces, items, submissions, comments and audit events, with other people&apos;s emails
      replaced. It counts as their download for the next 10 minutes, and the audit log records that
      you made it. <Help id="download-user-data" />
    </p>
    <DialogActions>
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
      <a href={dataHref(user.id)} className={buttonClasses("primary")}>
        Download
      </a>
    </DialogActions>
  </div>
);

/** Download their data (104): for a person who asked and can't sign in, or before an erasure. */
export const DownloadDataButton = ({ user }: { user: DataUser }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={rowButton} onClick={() => setOpen(true)}>
        Download their data
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Download their data">
        {open ? <DownloadDataBody user={user} onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
};
