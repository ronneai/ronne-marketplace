"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldError } from "@/components/ui/Field";
import { signOutFromMenu } from "@/features/account/actions";
import { acceptTermsFromForm } from "./actions";
import type { AcceptTermsState } from "./types";

/**
 * **Accept the updated terms** (190): root's link, a box to tick, **Continue**, and **Sign out**
 * for someone who won't. Both work without JavaScript.
 */
export const AcceptTermsForm = ({
  url,
  version,
  next,
  initial = {},
}: {
  url: string;
  version: string;
  /** Where to go once accepted: the page the person asked for. */
  next: string;
  initial?: AcceptTermsState;
}) => {
  const t = useTranslations("account.terms");
  const [state, action, pending] = useActionState(acceptTermsFromForm, initial);
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm text-fg">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline-offset-2 hover:underline"
          >
            {t("read", { version })}
          </a>
        </p>
        <div className="grid gap-1">
          <Checkbox
            id="accept"
            name="accept"
            required
            aria-invalid={state.error === "unticked" ? true : undefined}
            aria-describedby={state.error ? "accept-error" : undefined}
            label={t("accept")}
          />
          <FieldError id="accept-error">
            {state.error ? t(`errors.${state.error}`) : undefined}
          </FieldError>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>
            {t("continue")}
          </Button>
        </div>
      </form>
      <form action={signOutFromMenu}>
        <button type="submit" className="text-sm text-link underline-offset-2 hover:underline">
          {t("signOut")}
        </button>
      </form>
    </div>
  );
};
