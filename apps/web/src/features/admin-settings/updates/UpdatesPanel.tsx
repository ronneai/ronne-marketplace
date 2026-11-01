"use client";

import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { useKeptActionState } from "@/components/ui/kept-form";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import {
  isNewerRelease,
  type UpdateCheckSettings,
} from "@/server/domains/settings/models/update-check";
import type { UpdatePlan } from "@/server/runtime";
import { checkNow, saveUpdateCheck } from "./actions";
import type { UpdatesFormState } from "./types";

export type UpdatesView = UpdateCheckSettings & {
  /** The running version. */
  current: string;
  /** The operator turned the check off with `RONNE_UPDATE_CHECK`: root's switch is read-only. */
  offByEnvironment: boolean;
};

/**
 * Admin › Settings › Updates (140): the running version and the latest one seen, how the last check
 * went, Check now, how to update this instance the way it runs, and the switch. Two plain forms, so
 * they work without JavaScript.
 */
export const UpdatesPanel = ({
  settings,
  plans,
  initial = {},
}: {
  settings: UpdatesView;
  /** Every way to update, this instance's first. */
  plans: UpdatePlan[];
  initial?: UpdatesFormState;
}) => {
  const t = useTranslations("admin.updates");
  const check = useKeptActionState(checkNow, initial);
  const save = useKeptActionState(saveUpdateCheck, initial);
  const said = (state: UpdatesFormState) =>
    state !== initial && state.done ? t(`done.${state.done}`) : null;
  useToastWhen(check.state, said(check.state));
  useToastWhen(save.state, said(save.state));

  const off = !settings.enabled || settings.offByEnvironment;
  const newer = isNewerRelease(settings.latest, settings.current);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          {t("title")} <Help id="update-checking" />
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      <section aria-label={t("versions")} className="grid gap-3">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted">{t("running")}</dt>
          <dd className="font-mono text-fg">{settings.current}</dd>
          <dt className="text-muted">{t("latest")}</dt>
          <dd className="text-fg">
            {settings.latest ? (
              <>
                <span className="font-mono">{settings.latest}</span>
                {settings.url ? (
                  <>
                    {" · "}
                    <a
                      href={settings.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-strong underline-offset-2 hover:underline"
                    >
                      {t("notes")}
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              t("notChecked")
            )}
          </dd>
          <dt className="text-muted">{t("lastChecked")}</dt>
          <dd className="text-fg">
            {settings.checkedAt ? <LocalTime value={settings.checkedAt} /> : t("never")}
            {off && settings.checkedAt ? ` · ${t("fromBefore")}` : null}
          </dd>
        </dl>
        {settings.error ? (
          <Notice kind="warn" title={t(`failure.${settings.error}`)} />
        ) : newer ? (
          <Notice kind="info" title={t("newer", { version: settings.latest ?? "" })} />
        ) : settings.latest ? (
          <Notice kind="info" title={t("upToDate")} />
        ) : null}
        <form
          action={check.action}
          onSubmit={check.onSubmit}
          aria-label={t("checkNow")}
          className="flex flex-wrap items-center gap-3"
        >
          <Button type="submit" variant="secondary" loading={check.pending} disabled={off}>
            {t("checkNow")}
          </Button>
          <p className="text-xs text-muted">{off ? t("checkNowOff") : t("checkNowHint")}</p>
        </form>
      </section>

      <section aria-label={t("how")} className="grid gap-3">
        <h3 className="text-sm font-semibold text-fg">{t("how")}</h3>
        <p className="text-sm text-muted">{t("howIntro")}</p>
        {plans.map((plan) => (
          <details
            key={plan.kind}
            open={plan.current}
            className="rounded-control border border-hairline px-3 py-2"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-fg">
              {t(`plans.${plan.kind}.title`)}
              {plan.current ? <Badge tone="accent">{t("thisInstance")}</Badge> : null}
            </summary>
            <div className="mt-3 grid gap-2">
              <p className="text-sm text-muted">{t(`plans.${plan.kind}.text`)}</p>
              <p className="text-xs font-semibold text-fg">{t("backupFirst")}</p>
              <CopyableCommand command={plan.backup} />
              <p className="text-xs font-semibold text-fg">{t("then")}</p>
              {plan.commands.map((command) => (
                <CopyableCommand key={command} command={command} />
              ))}
            </div>
          </details>
        ))}
        <p className="text-xs text-muted">{t("databaseNote")}</p>
      </section>

      <form
        action={save.action}
        onSubmit={save.onSubmit}
        aria-label={t("switchTitle")}
        className="grid gap-2"
      >
        <label
          htmlFor="update-check-enabled"
          className="flex items-center gap-2 text-sm font-semibold text-fg"
        >
          <input
            id="update-check-enabled"
            name="enabled"
            type="checkbox"
            defaultChecked={settings.enabled && !settings.offByEnvironment}
            disabled={settings.offByEnvironment}
            aria-describedby="update-check-hint"
            className="size-4 pointer-coarse:size-6"
          />
          {t("switch")}
        </label>
        <p id="update-check-hint" className="text-xs text-muted">
          {settings.offByEnvironment ? t("setOnServer") : t("switchHint")}
        </p>
        <div>
          <Button type="submit" loading={save.pending} disabled={settings.offByEnvironment}>
            {t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
};
