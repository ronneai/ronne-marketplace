import { Check, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { rmkCommands } from "@/components/cli-auth/commands";
import { Help } from "@/components/help/Help";
import { docsHref } from "@/components/help/topics";
import { buttonClasses } from "@/components/ui/Button";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { IconButton } from "@/components/ui/IconButton";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Panel } from "@/components/ui/Panel";
import {
  type GettingStarted,
  STEPS,
  type Step,
} from "@/server/domains/onboarding/models/getting-started";
import { GLOBAL_WORKSPACE_NAME } from "@/server/domains/workspaces/models/workspace";
import { confirmInstallFromForm, hideGettingStartedFromForm } from "./actions";
import { StepsDialog } from "./StepsDialog";

const linkClass =
  "touch-hit inline-flex items-center text-sm text-link underline underline-offset-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

const StepRow = ({
  n,
  step,
  state,
  title,
  optional,
  children,
}: {
  n: number;
  step: Step;
  state: GettingStarted;
  title: string;
  optional?: string;
  children: ReactNode;
}) => {
  const t = useTranslations("home.gettingStarted");
  const done = state.done[step];
  const current = state.current === step;
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-panel border p-3 ${current ? "border-accent" : "border-hairline"}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-accent-strong text-on-accent" : "border border-strong text-fg"}`}
      >
        {done ? <Check size={14} /> : n}
      </span>
      <h3 className="flex flex-wrap items-center gap-x-2 self-center text-sm font-semibold text-fg">
        {title}
        {optional ? <span className="text-xs font-normal text-muted">{optional}</span> : null}
        <span className="sr-only">{done ? t("done") : t("todo")}</span>
      </h3>
      <div className="col-span-2 grid gap-2 sm:col-span-1 sm:col-start-2">{children}</div>
    </li>
  );
};

const Ring = ({ done, total }: { done: number; total: number }) => {
  const t = useTranslations("home.gettingStarted");
  const radius = 15.9155;
  const length = 2 * Math.PI * radius;
  return (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          className="stroke-hairline"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(length * done) / total} ${length}`}
          className="stroke-chart"
        />
      </svg>
      <span className="tabular-nums absolute text-xs font-semibold text-fg">
        {t("ring", { done, total })}
      </span>
    </span>
  );
};

/**
 * Home's Getting started (feature 126): a slim banner with the progress, the next step and its one
 * button, and a dialog with every step ("See all steps"). Four steps from "I have an account" to
 * "an item is installed", ticked by what exists (tokens, grants, drafts) and by the person's word
 * for the install. `state.panel` says which to draw: the banner, "You're set up", or nothing. Hide
 * and "I've installed one" are forms, so they work without JavaScript; the dialog needs it, the
 * banner's own buttons don't. No token is ever shown here: only the placeholder `<token>` in the
 * sign-in line.
 */
export const GettingStartedPanel = ({
  state,
  registry,
  noScope = false,
}: {
  state: GettingStarted;
  /** This instance's public URL, for the sign-in lines. */
  registry?: string;
  /** Root only: the instance has no scope yet. */
  noScope?: boolean;
}) => {
  const t = useTranslations("home.gettingStarted");
  if (state.panel === null) return null;
  const commands = rmkCommands(registry);

  if (state.panel === "setUp")
    return (
      <section aria-labelledby="getting-started">
        <Panel tone="teal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            aria-hidden="true"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-on-accent"
          >
            <Check size={20} />
          </span>
          <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
            <h2 id="getting-started" className="text-sm font-semibold text-fg">
              {t("setUp.title")}
            </h2>
            <p className="text-sm text-muted">{t("setUp.text")}</p>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <NewTabLink href={docsHref("overview")} className={linkClass}>
              {t("setUp.docs")}
            </NewTabLink>
            <Link href="/submissions/new" className={linkClass}>
              {t("setUp.new")}
            </Link>
          </p>
        </Panel>
      </section>
    );

  const current = state.current ?? "draft";
  const stepTitle = t(`steps.${current}.title`);
  const steps = (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t("dialogHint")}</p>
        <p className="text-sm font-semibold text-fg">
          {t("progress", { done: state.count, total: STEPS.length })}
        </p>
      </div>
      <ol className="grid gap-3">
        <StepRow n={1} step="token" state={state} title={t("steps.token.title")}>
          <p className="text-sm text-muted">{t("steps.token.text")}</p>
          <p>
            <Link href="/account/tokens" className={linkClass}>
              {t("steps.token.action")}
            </Link>
          </p>
        </StepRow>
        <StepRow n={2} step="connect" state={state} title={t("steps.connect.title")}>
          <p className="text-sm text-muted">{t("steps.connect.text")}</p>
          {state.done.token ? null : (
            <>
              <p className="text-xs font-semibold text-muted">{t("steps.connect.install")}</p>
              <CopyableCommand command={commands.install} wrap />
            </>
          )}
          <p className="text-xs font-semibold text-muted">{t("steps.connect.web")}</p>
          <CopyableCommand command={commands.loginWeb} wrap />
          <p className="text-xs font-semibold text-muted">{t("steps.connect.token")}</p>
          <CopyableCommand command={commands.loginToken} wrap />
        </StepRow>
        <StepRow n={3} step="install" state={state} title={t("steps.install.title")}>
          <p className="text-sm text-muted">{t("steps.install.text")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/catalogue" className={linkClass}>
              {t("steps.install.browse")}
            </Link>
            {state.done.install ? null : (
              <>
                <form action={confirmInstallFromForm}>
                  <button type="submit" className={buttonClasses("secondary")}>
                    {t("steps.install.confirm")}
                  </button>
                </form>
                <Help id="install-tick" />
              </>
            )}
          </div>
        </StepRow>
        <StepRow
          n={4}
          step="draft"
          state={state}
          title={t("steps.draft.title")}
          optional={t("optional")}
        >
          <p className="text-sm text-muted">{t("steps.draft.text")}</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/submissions/new" className={linkClass}>
              {t("steps.draft.new")}
            </Link>
            <NewTabLink href={docsHref("export", "what")} className={linkClass}>
              {t("steps.draft.export")}
            </NewTabLink>
          </p>
        </StepRow>
      </ol>
    </div>
  );

  return (
    <section aria-labelledby="getting-started" className="grid gap-2">
      <Panel tone="teal" className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Ring done={state.count} total={STEPS.length} />
        <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
          <h2 id="getting-started" className="text-sm font-semibold text-fg">
            {t("title")}
            <span className="font-normal text-muted">
              {" · "}
              {t("progress", { done: state.count, total: STEPS.length })}
            </span>
          </h2>
          <p className="text-sm text-fg">{t("next", { step: stepTitle })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {current === "token" ? (
            <Link href="/account/tokens" className={buttonClasses("primary")}>
              {t("steps.token.action")}
            </Link>
          ) : null}
          {current === "install" ? (
            <>
              <Link href="/catalogue" className={buttonClasses("secondary")}>
                {t("steps.install.browse")}
              </Link>
              <form action={confirmInstallFromForm}>
                <button type="submit" className={buttonClasses("primary")}>
                  {t("steps.install.confirm")}
                </button>
              </form>
            </>
          ) : null}
          {current === "draft" ? (
            <Link href="/submissions/new" className={buttonClasses("primary")}>
              {t("steps.draft.new")}
            </Link>
          ) : null}
          <StepsDialog
            label={current === "connect" ? t("showCommands") : t("seeAll")}
            variant={current === "connect" ? "primary" : "text"}
          >
            {steps}
          </StepsDialog>
          <form action={hideGettingStartedFromForm}>
            <IconButton label={t("hideLabel")} type="submit">
              <X size={16} aria-hidden="true" />
            </IconButton>
          </form>
        </div>
      </Panel>
      {noScope ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm text-fg">
          {t("noScope.text")}
          <Link href={`/workspaces/${GLOBAL_WORKSPACE_NAME}`} className={linkClass}>
            {t("noScope.action")}
          </Link>
        </p>
      ) : null}
    </section>
  );
};
