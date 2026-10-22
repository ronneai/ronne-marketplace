"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/**
 * The Getting started banner's steps (feature 126): a button, and the dialog it opens with every
 * step, its commands and its buttons. The steps are drawn on the server and handed in as
 * `children`, so the forms inside are the same plain forms. `label` is the button's words.
 */
export const StepsDialog = ({
  label,
  variant = "text",
  children,
}: {
  label: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) => {
  const t = useTranslations("home.gettingStarted");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="large" title={t("title")}>
        {children}
      </Dialog>
    </>
  );
};
