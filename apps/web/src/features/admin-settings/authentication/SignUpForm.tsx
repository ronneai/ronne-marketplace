"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { inputClasses, Label } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import type { SignUpBlocker } from "@/server/domains/settings/exceptions/errors";
import type { SignUpPolicy } from "@/server/domains/settings/models/sign-up-policy";
import type { SignUpReadiness } from "@/server/domains/settings/services/sign-up";
import { saveSignUp } from "./sign-up-actions";
import type { SignUpFormState } from "./sign-up-types";

/** What still blocks sign-up, in the panel's order (the service's own rule, without its imports). */
export const blockersOf = (readiness: SignUpReadiness): SignUpBlocker[] => [
  ...(readiness.mail ? [] : (["mail"] as const)),
  ...(readiness.contact ? [] : (["contact"] as const)),
  ...(readiness.password ? [] : (["password"] as const)),
];

/** Where each blocker is fixed. */
const FIX: Record<SignUpBlocker, string> = {
  mail: "/admin/settings?tab=email",
  contact: "/admin/settings?tab=email",
  password: "/admin/settings?tab=authentication",
};

/** Whether *Ask everyone to accept again* applies: a link, and a version other than the saved one. */
export const versionChanged = (policy: SignUpPolicy, url: string, version: string) =>
  url.trim() !== "" && version.trim() !== "" && version.trim() !== policy.termsVersion;

/**
 * Admin › Settings › Authentication's Self-registration panel (190): whether people may create
 * their own account, from which email domains, waiting for approval or not, the code lifetime, the
 * challenge, and the terms link. The switch is off and can't be turned on until email, the
 * instance contact and password sign-in are ready; it says what's missing and where to fix it.
 */
export const SignUpForm = ({
  policy,
  readiness,
  initial = {},
}: {
  policy: SignUpPolicy;
  readiness: SignUpReadiness;
  initial?: SignUpFormState;
}) => {
  const t = useTranslations("admin.settings.signUp");
  const { state, action, pending, onSubmit } = useKeptActionState(saveSignUp, initial);
  const fresh = state !== initial;
  useToastWhen(state, fresh && state.done ? t(`done.${state.done}`) : null);
  const blockers = blockersOf(readiness);
  const [enabled, setEnabled] = useState(policy.enabled);
  const [mode, setMode] = useState<"any" | "list">(policy.domains === "any" ? "any" : "list");
  const [throwaway, setThrowaway] = useState(policy.blockThrowaway);
  const [termsUrl, setTermsUrl] = useState(policy.termsUrl);
  const [termsVersion, setTermsVersion] = useState(policy.termsVersion);
  const invalid = (field: string) => state.field === field || undefined;
  const ready = blockers.length === 0;
  return (
    <form
      action={action}
      onSubmit={onSubmit}
      aria-label={t("title")}
      className="grid gap-5"
      noValidate
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
          <Help id="self-registration" />
        </div>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      {blockers.length > 0 ? (
        <Notice
          kind={policy.enabled ? "warn" : "info"}
          title={t(policy.enabled ? "closedTitle" : "blockedTitle")}
        >
          <ul className="grid list-disc gap-1 pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>
                {t(`blockers.${blocker}`)}{" "}
                <a href={FIX[blocker]} className="text-link underline">
                  {t(`fix.${blocker}`)}
                </a>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <label htmlFor="sign-up-enabled" className="flex items-start gap-2 text-sm text-fg">
        <input
          id="sign-up-enabled"
          name="enabled"
          type="checkbox"
          checked={enabled}
          disabled={!ready && !enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 size-4 accent-(--accent)"
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">{t("enabled")}</span>
          <span className="text-muted">{t("enabledHint")}</span>
        </span>
      </label>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("domains.legend")}</legend>
        {(["any", "list"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm text-fg">
            <input
              type="radio"
              name="domainsMode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="size-4 accent-(--accent)"
            />
            {t(`domains.${value}`)}
          </label>
        ))}
        {mode === "list" ? (
          <div className="grid gap-1 pl-6">
            <Label htmlFor="sign-up-domains">{t("domains.listLabel")}</Label>
            <textarea
              id="sign-up-domains"
              name="domains"
              rows={3}
              defaultValue={policy.domains === "any" ? "" : policy.domains.join("\n")}
              aria-invalid={invalid("domains")}
              aria-describedby="sign-up-domains-hint"
              spellCheck={false}
              className={`${inputClasses} font-mono`}
            />
            <p id="sign-up-domains-hint" className="text-xs text-muted">
              {t("domains.listHint")}
            </p>
          </div>
        ) : (
          <label
            htmlFor="sign-up-throwaway"
            className="flex items-start gap-2 pl-6 text-sm text-fg"
          >
            <input
              id="sign-up-throwaway"
              name="blockThrowaway"
              type="checkbox"
              checked={throwaway}
              onChange={(event) => setThrowaway(event.target.checked)}
              className="mt-0.5 size-4 accent-(--accent)"
            />
            <span className="grid gap-0.5">
              <span>{t("throwaway")}</span>
              <span className="text-xs text-muted">{t("throwawayHint")}</span>
            </span>
          </label>
        )}
        {/* With a list the throwaway setting is kept as last set, for when Any domain comes back. */}
        {mode === "list" && throwaway ? (
          <input type="hidden" name="blockThrowaway" value="on" />
        ) : null}
      </fieldset>

      <label htmlFor="sign-up-approval" className="flex items-start gap-2 text-sm text-fg">
        <input
          id="sign-up-approval"
          name="approval"
          type="checkbox"
          defaultChecked={policy.approval}
          className="mt-0.5 size-4 accent-(--accent)"
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">{t("approval")}</span>
          <span className="text-muted">{t("approvalHint")}</span>
        </span>
      </label>

      <div className="grid max-w-xs gap-1">
        <Label htmlFor="sign-up-minutes">{t("minutes")}</Label>
        <input
          id="sign-up-minutes"
          name="codeMinutes"
          type="number"
          min={5}
          max={60}
          step={1}
          defaultValue={policy.codeMinutes}
          aria-invalid={invalid("codeMinutes")}
          aria-describedby="sign-up-minutes-hint"
          className={inputClasses}
        />
        <p id="sign-up-minutes-hint" className="text-xs text-muted">
          {t("minutesHint")}
        </p>
      </div>

      <label htmlFor="sign-up-challenge" className="flex items-start gap-2 text-sm text-fg">
        <input
          id="sign-up-challenge"
          name="challenge"
          type="checkbox"
          defaultChecked={policy.challenge}
          className="mt-0.5 size-4 accent-(--accent)"
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">{t("challenge")}</span>
          <span className="text-muted">{t("challengeHint")}</span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="grid gap-1">
          <Label htmlFor="sign-up-terms-url">{t("termsUrl")}</Label>
          <input
            id="sign-up-terms-url"
            name="termsUrl"
            type="url"
            value={termsUrl}
            onChange={(event) => setTermsUrl(event.target.value)}
            aria-invalid={invalid("termsUrl")}
            aria-describedby="sign-up-terms-hint"
            spellCheck={false}
            className={inputClasses}
          />
          <p id="sign-up-terms-hint" className="text-xs text-muted">
            {t("termsHint")}
          </p>
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="sign-up-terms-version">{t("termsVersion")}</Label>
          <input
            id="sign-up-terms-version"
            name="termsVersion"
            value={termsVersion}
            onChange={(event) => setTermsVersion(event.target.value)}
            aria-invalid={invalid("termsVersion")}
            spellCheck={false}
            className={`${inputClasses} font-mono`}
          />
        </div>
      </div>
      {versionChanged(policy, termsUrl, termsVersion) ? (
        <label htmlFor="sign-up-ask-again" className="flex items-start gap-2 text-sm text-fg">
          <input
            id="sign-up-ask-again"
            name="askAgain"
            type="checkbox"
            className="mt-0.5 size-4 accent-(--accent)"
          />
          <span className="grid gap-0.5">
            <span className="font-semibold">{t("askAgain")}</span>
            <span className="text-muted">{t("askAgainHint")}</span>
          </span>
        </label>
      ) : null}

      {state.error ? <Notice kind="error" title={state.error} /> : null}
      {!fresh && state.done ? <Notice kind="info" title={t(`done.${state.done}`)} /> : null}
      <div>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
