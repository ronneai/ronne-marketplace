"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { ManageShelf } from "./ManageShelf";

/**
 * Manage on a shelf (feature 125), for whoever may change it: opens the shelf's pins in a dialog,
 * with Move up, Move down and Remove. `label` is the shelf's name: Start here, or the workspace's.
 */
export const ManageButton = ({ shelfKey, label }: { shelfKey: string; label: string }) => {
  const t = useTranslations("shelves");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="text"
        aria-label={t("pin.manageLabel", { shelf: label })}
        onClick={() => setOpen(true)}
      >
        {t("pin.manage")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="large"
        title={t("manage.title", { shelf: label })}
      >
        {open ? <ManageShelf shelfKey={shelfKey} /> : null}
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("pin.done")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
