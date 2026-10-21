"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { NoticeBanner } from "@/features/notice/NoticeBanner";
import {
  type Notice as InstanceNotice,
  isNoticeTone,
  NOTICE_LINK_HREF_MAX,
  NOTICE_LINK_LABEL_MAX,
  NOTICE_MESSAGE_MAX,
} from "@/server/domains/settings/models/notice-policy";
import { saveNotice } from "./actions";
import type { NoticeFormState } from "./types";

type Changed = { at: Date; byName: string | null } | null;

/**
 * Admin › Settings › Notice (124): root's message, optional link, tone and whether it is shown, a
 * preview drawn from what is typed, and who changed it last. Plain form fields, so Save works
 * without JavaScript (the preview then shows what is saved).
 */
export const NoticeForm = ({
  notice,
  changed,
  initial = {},
}: {
  notice: Pick<InstanceNotice, "message" | "link" | "tone" | "shown">;
  changed: Changed;
  initial?: NoticeFormState;
}) => {
  const t = useTranslations("admin.notice");
  const [state, action, pending] = useActionState(saveNotice, initial);
  const [message, setMessage] = useState(notice.message);
  const [linkLabel, setLinkLabel] = useState(notice.link?.label ?? "");
  const [linkHref, setLinkHref] = useState(notice.link?.href ?? "");
  const [tone, setTone] = useState<string>(notice.tone);
  const [shown, setShown] = useState(notice.shown);
  const errors = state.errors ?? {};
  const words = message.trim();
  const previewLink =
    linkLabel.trim() && linkHref.trim() ? { label: linkLabel.trim(), href: linkHref.trim() } : null;
  return (
    <form action={action} aria-label={t("title")} className="grid gap-4" noValidate>
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          {t("title")} <Help id="notice" />
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notice-message">{t("message")}</Label>
        <textarea
          id="notice-message"
          name="message"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "notice-message-error" : "notice-message-hint"}
          className={`${inputClasses} h-auto py-2`}
        />
        <p id="notice-message-hint" className="text-xs text-muted">
          {t("messageHint", { used: [...message].length, max: NOTICE_MESSAGE_MAX })}
        </p>
        <FieldError id="notice-message-error">
          {errors.message ? t(`errors.${errors.message}`, { max: NOTICE_MESSAGE_MAX }) : undefined}
        </FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="notice-link-label">{t("linkLabel")}</Label>
          <input
            id="notice-link-label"
            name="linkLabel"
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
            aria-invalid={errors.linkLabel ? true : undefined}
            aria-describedby="notice-link-label-error"
            className={inputClasses}
          />
          <FieldError id="notice-link-label-error">
            {errors.linkLabel
              ? t(`errors.${errors.linkLabel}`, { max: NOTICE_LINK_LABEL_MAX })
              : undefined}
          </FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notice-link-href">{t("linkHref")}</Label>
          <input
            id="notice-link-href"
            name="linkHref"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={NOTICE_LINK_HREF_MAX}
            value={linkHref}
            onChange={(event) => setLinkHref(event.target.value)}
            aria-invalid={errors.linkHref ? true : undefined}
            aria-describedby={errors.linkHref ? "notice-link-href-error" : "notice-link-hint"}
            className={inputClasses}
          />
          <FieldError id="notice-link-href-error">
            {errors.linkHref ? t(`errors.${errors.linkHref}`) : undefined}
          </FieldError>
        </div>
      </div>
      <p id="notice-link-hint" className="-mt-2 text-xs text-muted">
        {t("linkHint")}
      </p>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="notice-tone">{t("tone")}</Label>
        <select
          id="notice-tone"
          name="tone"
          value={tone}
          onChange={(event) => setTone(event.target.value)}
          aria-invalid={errors.tone ? true : undefined}
          aria-describedby="notice-tone-hint"
          className={selectClasses}
        >
          <option value="info">{t("toneInfo")}</option>
          <option value="warning">{t("toneWarning")}</option>
        </select>
        <p id="notice-tone-hint" className="text-xs text-muted">
          {t("toneHint")}
        </p>
        <div>
          <Help id="notice-tone" />
        </div>
        <FieldError id="notice-tone-error">
          {errors.tone ? t(`errors.${errors.tone}`) : undefined}
        </FieldError>
      </div>
      <div className="grid gap-1">
        <label
          htmlFor="notice-shown"
          className="flex items-center gap-2 text-sm font-semibold text-fg"
        >
          <input
            id="notice-shown"
            name="shown"
            type="checkbox"
            checked={shown}
            onChange={(event) => setShown(event.target.checked)}
            aria-describedby="notice-shown-hint"
            className="size-4 pointer-coarse:size-6"
          />
          {t("shown")}
        </label>
        <p id="notice-shown-hint" className="text-xs text-muted">
          {t("shownHint")}
        </p>
      </div>
      <section aria-label={t("preview")} className="grid gap-1.5">
        <h3 className="text-sm font-semibold text-fg">{t("preview")}</h3>
        {words ? (
          <NoticeBanner
            notice={{ message: words, link: previewLink, tone: isNoticeTone(tone) ? tone : "info" }}
          />
        ) : (
          <p className="text-sm text-muted">{t("previewEmpty")}</p>
        )}
        {words && !shown ? <p className="text-xs text-muted">{t("previewHidden")}</p> : null}
      </section>
      {state.done ? <Notice kind="info" title={t(state.done)} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
        <p className="text-xs text-muted">
          {changed ? (
            <>
              {t("lastChanged", { name: changed.byName ?? "—" })}
              {" · "}
              <LocalTime value={changed.at} />
            </>
          ) : (
            t("neverChanged")
          )}
        </p>
      </div>
    </form>
  );
};
