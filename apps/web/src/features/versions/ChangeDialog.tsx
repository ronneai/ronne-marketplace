"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import type { ItemRef } from "@/server/domains/items/actions/versions";
import { changeVersions, type VersionChange } from "./actions";

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
}: {
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
                const result = await changeVersions(itemRef, change(values));
                if (!result.ok) return setError(result.error);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {children}
            {fields?.(values, setValues)}
            <FieldError id="change-error">{error}</FieldError>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={destructive ? "destructive" : "primary"}
                loading={pending}
              >
                {confirm}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
};
