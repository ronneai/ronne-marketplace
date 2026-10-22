"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PER_HOUR,
} from "@/server/domains/feedback/models/feedback";
import { sendFeedbackFromForm } from "./actions";
import type { FeedbackFormState } from "./types";

/**
 * The Send feedback form (feature 127), in the sidebar's dialog and on `/feedback`, which is what
 * a phone and a browser without JavaScript get. A kind, a message, and the page they are on (the
 * path only, checked by default). Sent, it says thanks; `onDone` closes the dialog, and the page
 * links back to Home instead.
 */
export const FeedbackForm = ({
  page,
  onDone,
  initial = {},
}: {
  /** The path of the page they were on, or null when there is none to offer. */
  page: string | null;
  onDone?: () => void;
  initial?: FeedbackFormState;
}) => {
  const t = useTranslations("feedback");
  const [state, action, pending] = useActionState(sendFeedbackFromForm, initial);
  const [length, setLength] = useState([...(initial.message ?? "")].length);

  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title={t("thanks")} />
        <div>
          {onDone ? (
            <Button onClick={onDone}>{t("done")}</Button>
          ) : (
            <Link href="/" className="text-sm text-link hover:underline">
              {t("backHome")}
            </Link>
          )}
        </div>
      </div>
    );

  const error = state.error
    ? t(`errors.${state.error}`, { max: FEEDBACK_MESSAGE_MAX, limit: FEEDBACK_PER_HOUR })
    : undefined;
  const kindError = state.error === "kind_required" ? error : undefined;
  const messageError =
    state.error === "message_required" || state.error === "message_too_long" ? error : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error === "rate_limited" ? <Notice kind="error" title={error} /> : null}
      <fieldset
        className="grid min-w-0 gap-2 border-0 p-0"
        aria-describedby={kindError ? "feedback-kind-error" : undefined}
      >
        <legend className="mb-1.5 text-sm font-semibold text-fg">{t("kind.legend")}</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded-control border border-strong px-3 text-sm text-fg has-[:checked]:border-fg has-[:checked]:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={state.kind === kind}
                className="accent-[var(--color-accent)]"
              />
              {t(`kind.${kind}`)}
            </label>
          ))}
        </div>
        <FieldError id="feedback-kind-error">{kindError}</FieldError>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="feedback-message">{t("message.label")}</Label>
        <textarea
          id="feedback-message"
          name="message"
          rows={7}
          defaultValue={state.message ?? ""}
          onChange={(event) => setLength([...event.target.value].length)}
          aria-invalid={messageError ? true : undefined}
          aria-describedby={`feedback-message-count${messageError ? " feedback-message-error" : ""}`}
          className={`${inputClasses} h-auto py-2`}
        />
        <p
          id="feedback-message-count"
          className={`text-xs ${length > FEEDBACK_MESSAGE_MAX ? "text-error-text" : "text-muted"}`}
        >
          {t("message.count", { count: length, max: FEEDBACK_MESSAGE_MAX })}
        </p>
        <FieldError id="feedback-message-error">{messageError}</FieldError>
      </div>
      {page ? (
        <div className="grid gap-1">
          <label className="flex items-start gap-2 text-sm text-fg">
            <input
              type="checkbox"
              name="includePage"
              defaultChecked={state.includePage ?? true}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span>{t("page.include")}</span>
          </label>
          <input type="hidden" name="page" value={page} />
          <p className="pl-6 font-mono text-xs break-all text-muted">{page}</p>
        </div>
      ) : null}
      <DialogActions>
        {onDone ? (
          <Button variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        ) : null}
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogActions>
    </form>
  );
};
