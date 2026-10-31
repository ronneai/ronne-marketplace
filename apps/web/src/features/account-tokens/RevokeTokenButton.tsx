"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { revokeTokenFromForm } from "./actions";
import type { TokenActionState } from "./types";

/**
 * On success the page refreshes, the row shows "revoked", and this button (with its dialog) is no
 * longer rendered, so the updated row is the confirmation.
 */
const RevokeForm = ({ id, name, onDone }: { id: string; name: string; onDone: () => void }) => {
  const t = useTranslations("account.tokens.revoke");
  const [state, action, pending] = useActionState<TokenActionState, FormData>(
    revokeTokenFromForm,
    {},
  );
  // The toast is the layout's: this form goes with the row once the page refreshes (138).
  useEffect(() => {
    if (state.done) onDone();
  }, [state, onDone]);
  if (state.done) return null;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="tokenId" value={id} />
      <p className="text-sm text-muted">
        {t.rich("body", {
          name,
          strong: (chunks) => <strong className="text-fg">{chunks}</strong>,
        })}
      </p>
      <FieldError id={`revoke-${id}-error`}>{state.error}</FieldError>
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

export const RevokeTokenButton = ({ id, name }: { id: string; name: string }) => {
  const t = useTranslations("account.tokens.revoke");
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
        className="rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {t("button")}
      </button>
      <Dialog open={open} onClose={close} title={t("title")}>
        <RevokeForm key={round} id={id} name={name} onDone={close} />
      </Dialog>
    </>
  );
};
