"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { revokeUserTokenFromForm } from "./actions";
import type { AdminActionState } from "./types";

const RevokeForm = ({
  userId,
  id,
  name,
  onDone,
}: {
  userId: string;
  id: string;
  name: string;
  onDone: () => void;
}) => {
  const t = useTranslations("admin.userPage.revokeToken");
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    revokeUserTokenFromForm,
    {},
  );
  // The toast is the layout's (flashToast): this form goes with the row once the page refreshes.
  useEffect(() => {
    if (state.done) onDone();
  }, [state, onDone]);
  if (state.done) return null;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="tokenId" value={id} />
      <p className="text-sm text-muted">
        {t.rich("body", {
          name,
          strong: (chunks) => <strong className="text-fg">{chunks}</strong>,
        })}
      </p>
      <FieldError id={`revoke-token-${id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogActions>
    </form>
  );
};

/** Revoke on a person's token (162): it asks first, then the row shows "revoked". */
export const RevokeUserTokenButton = ({
  userId,
  id,
  name,
}: {
  userId: string;
  id: string;
  name: string;
}) => {
  const t = useTranslations("admin.userPage.revokeToken");
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
        onClick={() => setOpen(true)}
        aria-label={t("aria", { name })}
        className="rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-11"
      >
        {t("button")}
      </button>
      <Dialog open={open} onClose={close} title={t("title")}>
        <RevokeForm key={round} userId={userId} id={id} name={name} onDone={close} />
      </Dialog>
    </>
  );
};
