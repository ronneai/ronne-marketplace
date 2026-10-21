"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Checkbox, FieldError, Label, selectClasses, TextField } from "@/components/ui/Field";
import { createTokenFromForm } from "./actions";
import { CreatedTokenPanel } from "./CreatedTokenPanel";
import type { TokenActionState } from "./types";

const CreateTokenForm = ({ onDone }: { onDone: () => void }) => {
  const t = useTranslations("account.tokens.create");
  const [state, action, pending] = useActionState<TokenActionState, FormData>(
    createTokenFromForm,
    {},
  );
  const [lifetime, setLifetime] = useState("90");
  if (state.created)
    return (
      <div className="grid gap-4">
        <CreatedTokenPanel value={state.created} />
        <div>
          <Button onClick={onDone}>{t("done")}</Button>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4">
      <TextField
        id="token-name"
        name="name"
        label={t("name")}
        hint={t("nameHint")}
        required
        maxLength={100}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="token-lifetime">{t("expiresAfter")}</Label>
        <select
          id="token-lifetime"
          name="lifetime"
          value={lifetime}
          onChange={(event) => setLifetime(event.target.value)}
          className={selectClasses}
        >
          <option value="30">{t("days30")}</option>
          <option value="90">{t("days90")}</option>
          <option value="365">{t("days365")}</option>
          <option value="none">{t("none")}</option>
        </select>
      </div>
      {lifetime === "none" ? (
        <Checkbox id="token-no-expiry" name="confirmNoExpiry" label={t("confirm")} />
      ) : null}
      <FieldError id="token-error">{state.error}</FieldError>
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

/** "Create token" and its dialog. Each opening starts a fresh form, so a shown token never lingers. */
export const CreateTokenDialog = () => {
  const t = useTranslations("account.tokens.create");
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("button")}</Button>
      <Dialog open={open} onClose={close} title={t("title")}>
        <CreateTokenForm key={round} onDone={close} />
      </Dialog>
    </>
  );
};
