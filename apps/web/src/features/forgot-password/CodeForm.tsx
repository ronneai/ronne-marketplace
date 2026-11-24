"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeInput";
import { Notice } from "@/components/ui/Notice";
import { resetCodeFromForm, startAgainFromForm } from "./actions";
import type { ResetStepState } from "./types";

/**
 * The code page's forms (194): the six boxes (157, one field without JavaScript), then **Send a
 * new code** and **Use another address**, which both start again on the request page: the flow
 * keeps no address, and a new request ends the code before.
 */
export const CodeForm = ({ initial = {} }: { initial?: ResetStepState }) => {
  const t = useTranslations("auth.forgot.code");
  const [state, action, pending] = useActionState(resetCodeFromForm, initial);
  // Wrong: the box says so. Anything else ends this code: a notice, and a new one is asked for.
  const boxError = state.error === "wrong" ? t("errors.wrong") : undefined;
  return (
    <div className="grid gap-4">
      {state.error && state.error !== "wrong" ? (
        <Notice kind="error" title={t(`errors.${state.error}`)} />
      ) : null}
      <form action={action} className="grid gap-4" noValidate>
        <CodeInput
          id="code"
          name="code"
          label={t("label")}
          resetKey={state}
          autoFocus
          error={boxError}
        />
        <Button type="submit" loading={pending} className="w-full">
          {t("submit")}
        </Button>
      </form>
      <form
        action={startAgainFromForm}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <Button type="submit" variant="secondary">
          {t("resend")}
        </Button>
        <button type="submit" className="text-sm text-link underline-offset-2 hover:underline">
          {t("another")}
        </button>
      </form>
    </div>
  );
};
