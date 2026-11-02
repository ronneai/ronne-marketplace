"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Checkbox, FieldError, Label, selectClasses, TextField } from "@/components/ui/Field";
import { createTokenFromForm } from "./actions";
import { CreatedTokenPanel } from "./CreatedTokenPanel";
import type { TokenActionState } from "./types";

/** The lifetimes the dialog offers, as their form values: only those within the person's cap (162). */
export const lifetimeChoices = (maxDays: number | null): string[] => [
  ...[30, 90, 365].filter((days) => maxDays === null || days <= maxDays).map(String),
  ...(maxDays === null ? ["none"] : []),
];

/** 90 days, as before 162, or the longest allowed when that's shorter. */
export const defaultLifetime = (maxDays: number | null): string =>
  maxDays === null || maxDays >= 90 ? "90" : String(maxDays);

const LABELS = { "30": "days30", "90": "days90", "365": "days365", none: "none" } as const;

const CreateTokenForm = ({ onDone, maxDays }: { onDone: () => void; maxDays: number | null }) => {
  const t = useTranslations("account.tokens.create");
  const [state, action, pending] = useActionState<TokenActionState, FormData>(
    createTokenFromForm,
    {},
  );
  const [lifetime, setLifetime] = useState(defaultLifetime(maxDays));
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
          aria-describedby={maxDays === null ? undefined : "token-lifetime-cap"}
        >
          {lifetimeChoices(maxDays).map((value) => (
            <option key={value} value={value}>
              {t(LABELS[value as keyof typeof LABELS])}
            </option>
          ))}
        </select>
        {maxDays === null ? null : (
          <p id="token-lifetime-cap" className="text-xs text-muted">
            {t("capHint", { days: maxDays })}
          </p>
        )}
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

/**
 * "Create token" and its dialog. Each opening starts a fresh form, so a shown token never lingers.
 * `maxDays` is root's longest lifetime for this person (162), null for no limit.
 */
export const CreateTokenDialog = ({ maxDays = null }: { maxDays?: number | null }) => {
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
        <CreateTokenForm key={round} onDone={close} maxDays={maxDays} />
      </Dialog>
    </>
  );
};
