"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";

/** The address of root's download of a person's data (104). */
export const dataHref = (userId: string): string => `/admin/users/${userId}/data`;

type DataUser = { id: string; email: string };

/**
 * What the dialog says: the file is the one they would get from their Account page, it counts as
 * their download for 10 minutes, and the audit log records that root made it. The download is a
 * link, so the browser saves the file.
 */
export const DownloadDataBody = ({ user, onClose }: { user: DataUser; onClose: () => void }) => {
  const t = useTranslations("admin.download");
  return (
    <div className="grid gap-4">
      <p className="font-mono text-[13px] text-fg">{user.email}</p>
      <div className="grid gap-1.5">
        <p className="text-sm text-muted">{t("body")}</p>
        <Help id="download-user-data" />
      </div>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t("close")}
        </Button>
        <a href={dataHref(user.id)} className={buttonClasses("primary")}>
          {t("download")}
        </a>
      </DialogActions>
    </div>
  );
};

/** Download their data (104): for a person who asked and can't sign in, or before an erasure. */
export const DownloadDataButton = ({ user }: { user: DataUser }) => {
  const t = useTranslations("admin.download");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("button")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("title")}>
        {open ? <DownloadDataBody user={user} onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
};
