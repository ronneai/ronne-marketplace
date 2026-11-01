"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError, Label, selectClasses } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/server/domains/identity/models/locale";
import { setLanguageFromForm } from "./actions";
import type { LanguageFormState } from "./types";

/**
 * Account › Language (feature 129): Automatic or one of the languages, each in its own name so
 * someone in the wrong language can find theirs. A plain form, so it works without JavaScript.
 */
export const LanguageForm = ({
  saved = null,
  offered = LOCALES,
  notOffered = null,
  initial = {},
}: {
  /** The language on their profile, or null for automatic. */
  saved?: Locale | null;
  /** The languages root offers (141). */
  offered?: readonly Locale[];
  /** A language on their profile that is not offered now (141): kept, but not in force. */
  notOffered?: Locale | null;
  initial?: LanguageFormState;
}) => {
  const t = useTranslations("account.language");
  const [state, action, pending] = useActionState(setLanguageFromForm, initial);
  // React resets a form once its action is done, so the select shows what was just saved (or, before
  // any save, what the profile holds): keyed, so it is drawn again with the new value.
  const current = state.saved ? (state.saved === "automatic" ? "" : state.saved) : (saved ?? "");
  return (
    <form action={action} className="grid max-w-sm gap-4" noValidate>
      {/* Without JavaScript the page comes back with the result (`initial`): shown here. With it, the
          layout says it as a toast in the new language (138). */}
      {state.saved && state === initial ? (
        <Notice kind="info" title={t("savedTitle")}>
          {state.saved === "automatic" ? t("savedAutomatic") : t("saved")}
        </Notice>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="language">{t("label")}</Label>
        <select
          key={current}
          id="language"
          name="language"
          defaultValue={current}
          aria-invalid={state.error ? true : undefined}
          aria-describedby="language-hint"
          className={selectClasses}
        >
          <option value="">{t("automatic")}</option>
          {offered.map((locale) => (
            <option key={locale} value={locale} lang={locale}>
              {LOCALE_NAMES[locale]}
            </option>
          ))}
        </select>
        <p id="language-hint" className="text-xs text-muted">
          {t("hint")}
        </p>
        {notOffered ? (
          <Notice kind="info" title={t("notOffered", { name: LOCALE_NAMES[notOffered] })} />
        ) : null}
        <FieldError id="language-error">{state.error ? t("invalid") : undefined}</FieldError>
        <div>
          <Help id="language" />
        </div>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
