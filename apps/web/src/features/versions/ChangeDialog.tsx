"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast";
import type { ItemRef } from "@/server/domains/items/actions/versions";
import { changeVersions, type VersionChange } from "./actions";

/** What is said when each change went through (138): `common.done.<key>`. */
const DONE = {
  move_tag: "tagMoved",
  remove_tag: "tagRemoved",
  deprecate: "deprecated",
  undeprecate: "undeprecated",
  yank: "yanked",
  unyank: "unyanked",
} as const satisfies Record<VersionChange["kind"], string>;

/**
 * A button that opens a dialog, runs one version change, and refreshes the page (feature 016).
 * `fields` renders the dialog's inputs; `change` turns their values into the change to run.
 */
export const ChangeDialog = <V extends Record<string, string>>({
  itemRef,
  label,
  title,
  confirm,
  destructive = false,
  initial,
  fields,
  change,
  children,
  defaultOpen = false,
}: {
  /** Opened at once, without its button being pressed. */
  defaultOpen?: boolean;
  itemRef: ItemRef;
  label: string;
  title: string;
  confirm: string;
  destructive?: boolean;
  initial: V;
  fields?: (values: V, set: (values: V) => void) => ReactNode;
  change: (values: V) => VersionChange;
  children?: ReactNode;
}) => {
  const t = useTranslations("author.versions");
  const said = useTranslations("common.done");
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setValues(initial);
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {open ? (
        <Dialog open onClose={() => setOpen(false)} title={title}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              start(async () => {
                const next = change(values);
                const result = await changeVersions(itemRef, next);
                if (!result.ok) return setError(result.error);
                toast.ok(said(DONE[next.kind]));
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {children}
            {fields?.(values, setValues)}
            <FieldError id="change-error">{error}</FieldError>
            <DialogActions>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                variant={destructive ? "destructive" : "primary"}
                loading={pending}
              >
                {confirm}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      ) : null}
    </>
  );
};
