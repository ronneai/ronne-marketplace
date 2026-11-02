"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, Label, selectClasses } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { useToastWhen } from "@/components/ui/toast";
import type { TokenPolicy } from "@/server/domains/settings/models/token-policy";
import { saveTokenPolicy, shortenTokensFromForm } from "../actions";
import type { SettingsActionState } from "../types";

/** A cap as the form sends it: the days, or `none` (never empty: a missing field is refused). */
const value = (cap: number | null) => (cap === null ? "none" : String(cap));
const CHOICES = ["30", "90", "365", "none"] as const;
/** How long a choice is, for "the same or shorter": no limit is the longest. */
const length = (choice: string) => (choice === "none" ? Number.POSITIVE_INFINITY : Number(choice));

/** The reviewers' choices: the same as everyone's, or shorter (162). */
export const reviewerChoices = (everyone: string) =>
  CHOICES.filter((choice) => length(choice) <= length(everyone));

/** Shorten, and the question it asks first: only when some tokens last longer (162). */
const Shorten = ({ count }: { count: number }) => {
  const t = useTranslations("admin.settings.tokens");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    shortenTokensFromForm,
    {},
  );
  useToastWhen(state, state.done);
  useEffect(() => {
    if (state.done) setOpen(false);
  }, [state]);
  return (
    <div className="grid gap-2 border-t border-hairline pt-4">
      <h3 className="text-sm font-semibold text-fg">{t("shortenTitle")}</h3>
      <p className="text-sm text-muted">{t("past", { count })}</p>
      {count > 0 ? (
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t("shorten")}
          </Button>
          <Dialog open={open} onClose={() => setOpen(false)} title={t("confirmTitle")}>
            <form action={action} className="grid gap-4">
              <p className="text-sm text-muted">{t("confirmBody", { count })}</p>
              <FieldError id="shorten-tokens-error">{state.error}</FieldError>
              <DialogActions>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" loading={pending}>
                  {t("confirm")}
                </Button>
              </DialogActions>
            </form>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Root's longest token lifetimes (162): one for everyone and one for reviewers and root, the same
 * or shorter, then Save, audited. Tokens already made keep their dates until root shortens them.
 */
export const TokenPolicyForm = ({ policy, past }: { policy: TokenPolicy; past: number }) => {
  const t = useTranslations("admin.settings.tokens");
  const { state, action, pending, onSubmit } = useKeptActionState(saveTokenPolicy, {});
  useToastWhen(state, state.done);
  const [everyone, setEveryone] = useState(value(policy.maxDays));
  const [reviewers, setReviewers] = useState(value(policy.reviewersMaxDays));
  const choose = (next: string) => {
    setEveryone(next);
    // The reviewers' cap follows down, never past everyone's.
    if (length(reviewers) > length(next)) setReviewers(next);
  };
  const changed =
    everyone !== value(policy.maxDays) || reviewers !== value(policy.reviewersMaxDays);
  return (
    <div className="grid gap-4">
      <form action={action} onSubmit={onSubmit} aria-label={t("title")} className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
          <p className="text-sm text-muted">{t("hint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="token-max-days">{t("everyone")}</Label>
            <select
              id="token-max-days"
              name="maxDays"
              value={everyone}
              onChange={(event) => choose(event.target.value)}
              className={selectClasses}
            >
              {CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {t(`choices.${choice}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="token-max-days-reviewers">
              {t("reviewers")} <Help id="token-lifetime-reviewers" />
            </Label>
            <select
              id="token-max-days-reviewers"
              name="reviewersMaxDays"
              value={reviewers}
              onChange={(event) => setReviewers(event.target.value)}
              aria-describedby="token-max-days-reviewers-hint"
              className={selectClasses}
            >
              {reviewerChoices(everyone).map((choice) => (
                <option key={choice} value={choice}>
                  {t(`choices.${choice}`)}
                </option>
              ))}
            </select>
            <p id="token-max-days-reviewers-hint" className="text-xs text-muted">
              {t("reviewersHint")}
            </p>
          </div>
        </div>
        <FieldError id="token-policy-error">{state.error}</FieldError>
        <div>
          <Button type="submit" loading={pending} disabled={!changed}>
            {t("save")}
          </Button>
        </div>
      </form>
      <Shorten count={past} />
    </div>
  );
};
