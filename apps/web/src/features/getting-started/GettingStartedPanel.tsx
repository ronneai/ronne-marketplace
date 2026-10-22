import { Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { rmkCommands } from "@/components/cli-auth/commands";
import { Help } from "@/components/help/Help";
import { docsHref } from "@/components/help/topics";
import { buttonClasses } from "@/components/ui/Button";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Panel } from "@/components/ui/Panel";
import {
  type GettingStarted,
  STEPS,
  type Step,
} from "@/server/domains/onboarding/models/getting-started";
import { GLOBAL_WORKSPACE_NAME } from "@/server/domains/workspaces/models/workspace";
import { confirmInstallFromForm, hideGettingStartedFromForm } from "./actions";

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

/**
 * Home's Getting started (feature 126): four steps from "I have an account" to "an item is
 * installed", ticked by what exists (tokens, grants, drafts) and by the person's word for the
 * install. `state.panel` says which to draw: the steps, "You're set up", or nothing. The buttons
 * are forms, so they work without JavaScript. No token is ever shown here: only the placeholder
 * `<token>` in the sign-in line.
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
      <section aria-labelledby="getting-started" className="grid grid-cols-1 gap-3">
        <h2 id="getting-started" className="text-lg font-semibold text-fg">
          {t("setUp.title")}
        </h2>
        <Panel className="grid gap-3 text-sm">
          <p className="text-fg">{t("setUp.text")}</p>
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

  return (
    <section aria-labelledby="getting-started" className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="getting-started" className="text-lg font-semibold text-fg">
          {t("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">
            {t("progress", { done: state.count, total: STEPS.length })}
          </p>
          <form action={hideGettingStartedFromForm}>
            <button
              type="submit"
              aria-label={t("hideLabel")}
              className={buttonClasses("secondary")}
            >
              {t("hide")}
            </button>
          </form>
        </div>
      </div>
      <Panel className="grid gap-3">
        {noScope ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg">
            {t("noScope.text")}
            <Link href={`/workspaces/${GLOBAL_WORKSPACE_NAME}`} className={linkClass}>
              {t("noScope.action")}
            </Link>
          </p>
        ) : null}
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
      </Panel>
    </section>
  );
};
