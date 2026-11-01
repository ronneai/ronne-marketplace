"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, selectClasses } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import {
  isLocale,
  LOCALE_NAMES,
  LOCALES,
  type Locale,
} from "@/server/domains/identity/models/locale";
import { choosing, type LanguagePolicy } from "@/server/domains/settings/models/language-policy";
import { saveLanguages } from "./actions";
import type { LanguagesFormState } from "./types";

/**
 * Admin › Settings › Languages (141): the language everyone starts in, whether people may choose
 * their own, and which languages are offered while they may. The default's box is ticked and
 * locked, so the default is always offered; with nothing else ticked, choosing reads as off and
 * the form says so. A plain form, so Save works without JavaScript.
 */
export const LanguagesForm = ({
  policy,
  initial = {},
}: {
  policy: LanguagePolicy;
  initial?: LanguagesFormState;
}) => {
  const t = useTranslations("admin.languages");
  const { state, action, pending, onSubmit } = useKeptActionState(saveLanguages, initial);
  const fresh = state !== initial;
  useToastWhen(state, fresh && state.done ? t(`done.${state.done}`) : null);
  const [fallback, setFallback] = useState<Locale>(policy.default);
  const [choice, setChoice] = useState(policy.choice);
  const [offered, setOffered] = useState<Locale[]>(policy.offered);
  const toggle = (locale: Locale, on: boolean) =>
    setOffered((now) =>
      on ? [...new Set([...now, locale])] : now.filter((one) => one !== locale),
    );
  const current = { default: fallback, choice, offered: [...new Set([...offered, fallback])] };
  const readsAsOff = choice && !choosing({ ...current, offered: current.offered });
  return (
    <form
      action={action}
      onSubmit={onSubmit}
      aria-label={t("title")}
      className="grid gap-4"
      noValidate
    >
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="language-default">{t("default")}</Label>
        <select
          id="language-default"
          name="default"
          value={fallback}
          onChange={(event) => isLocale(event.target.value) && setFallback(event.target.value)}
          aria-describedby="language-default-hint"
          className={selectClasses}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_NAMES[locale]}
            </option>
          ))}
        </select>
        <p id="language-default-hint" className="text-xs text-muted">
          {t("defaultHint")}
        </p>
      </div>
      <div className="grid gap-1">
        <label
          htmlFor="language-choice"
          className="flex items-center gap-2 text-sm font-semibold text-fg"
        >
          <input
            id="language-choice"
            name="choice"
            type="checkbox"
            checked={choice}
            onChange={(event) => setChoice(event.target.checked)}
            aria-describedby="language-choice-hint"
            className="size-4 pointer-coarse:size-6"
          />
          {t("choice")}
        </label>
        <p id="language-choice-hint" className="text-xs text-muted">
          {t("choiceHint")}
        </p>
      </div>
      <fieldset hidden={!choice} className="grid gap-2" aria-describedby="language-offered-hint">
        <legend className="text-sm font-semibold text-fg">{t("offered")}</legend>
        <p id="language-offered-hint" className="text-xs text-muted">
          {t("offeredHint")}
        </p>
        {LOCALES.map((locale) => {
          const locked = locale === fallback;
          return (
            <label key={locale} className="flex items-center gap-2 text-sm text-fg">
              <input
                name="offered"
                type="checkbox"
                value={locale}
                checked={locked || offered.includes(locale)}
                disabled={locked}
                onChange={(event) => toggle(locale, event.target.checked)}
                className="size-4 pointer-coarse:size-6"
              />
              {LOCALE_NAMES[locale]}
              {locked ? <span className="text-xs text-muted">{t("locked")}</span> : null}
            </label>
          );
        })}
        {/* The locked box is not sent by the browser: the default travels on its own. */}
        <input type="hidden" name="offered" value={fallback} />
      </fieldset>
      {readsAsOff ? (
        <Notice kind="info" title={t("readsAsOff", { name: LOCALE_NAMES[fallback] })} />
      ) : null}
      {fresh && state.error ? <Notice kind="error" title={state.error} /> : null}
      {!fresh && state.done ? <Notice kind="info" title={t(`done.${state.done}`)} /> : null}
      <div>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
