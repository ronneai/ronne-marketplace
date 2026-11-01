"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/Notice";
import { describeServer } from "@/server/setup/server-name";
import {
  installAll,
  installMigrations,
  installRoot,
  installSettings,
  testDatabase,
} from "./actions";
import { CodeField, DatabaseFields, InstanceFields, RootFields } from "./fields";
import { StepList } from "./StepList";
import { useSay } from "./say";
import {
  type InstallState,
  PENDING_STEPS,
  type SetupError,
  type SetupNotice,
  type SetupPageProps,
  type SetupSection,
  type SetupValues,
  STEP_NAMES,
  type StepName,
  type StepOutcome,
  type StepResult,
  type TestResult,
} from "./types";

/** A notice in the language, or as the server wrote it. */
export const Notices = ({ notices }: { notices: readonly SetupNotice[] }) => {
  const say = useSay();
  return notices.map((notice) => (
    <Notice key={notice.text} kind="warn" title={say(notice.say, notice.text)} />
  ));
};

const signInHref = (email: string) => `/sign-in?email=${encodeURIComponent(email)}`;

/** The wizard's pages, in order; the last one is the install itself (their words: `admin.setup.wizard.pages`). */
const PAGES = ["database", "instance", "root", "install"] as const;
const SECTION_PAGE: Record<SetupSection, number> = { code: 0, database: 0, instance: 1, root: 2 };

/**
 * The setup form. Rendered on the server as one form with every question and one Install button,
 * which a browser without JavaScript posts to `installAll` in a single request. Once JavaScript
 * runs, the same form becomes a wizard: one group of questions at a time, "Test connection", and
 * an install that calls the three steps one by one and shows each as it happens.
 */
export const SetupForm = ({
  page,
  onDone,
}: {
  page: SetupPageProps;
  /** Called when the wizard's install has finished (#148). */
  onDone?: () => void;
}) => {
  const initial: InstallState = { steps: { ...PENDING_STEPS }, notices: [], values: page.initial };
  const [state, action, pending] = useActionState(installAll, initial);

  // The wizard exists only once JavaScript runs; the first client render matches the server's.
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);

  if (!enhanced) return <SingleForm page={page} state={state} action={action} pending={pending} />;
  return <Wizard page={page} initial={state} onDone={onDone} />;
};

const SingleForm = ({
  page,
  state,
  action,
  pending,
}: {
  page: SetupPageProps;
  state: InstallState;
  action: (form: FormData) => void;
  pending: boolean;
}) => {
  const t = useTranslations("admin.setup.wizard");
  const ran = STEP_NAMES.some((name) => state.steps[name].status !== "pending");
  return (
    <form action={action} className="grid gap-6" noValidate>
      {ran ? <StepList steps={state.steps} /> : null}
      <AlreadySetUp error={state.error} />
      <Notices notices={state.notices} />
      <CodeField page={page} error={state.error} />
      <DatabaseFields page={page} values={state.values} error={state.error} />
      <InstanceFields page={page} values={state.values} error={state.error} />
      <RootFields page={page} values={state.values} error={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {t("install")}
        </Button>
        <span className="text-xs text-muted">{t("installHint")}</span>
      </div>
    </form>
  );
};

export const AlreadySetUp = ({ error }: { error?: SetupError }) => {
  const t = useTranslations("admin.setup.wizard");
  const say = useSay();
  if (error?.code !== "already_set_up") return null;
  return (
    <Notice kind="error" title={say(error.say, error.message)}>
      <a href="/sign-in" className="text-link underline underline-offset-2">
        {t("goToSignIn")}
      </a>
    </Notice>
  );
};

const Wizard = ({
  page,
  initial,
  onDone,
}: {
  page: SetupPageProps;
  initial: InstallState;
  onDone?: () => void;
}) => {
  const t = useTranslations("admin.setup.wizard");
  const form = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState(0);
  const [kind, setKind] = useState<SetupValues["kind"]>(initial.values.kind);
  const [steps, setSteps] = useState<Record<StepName, StepResult>>(initial.steps);
  const [notices, setNotices] = useState<SetupNotice[]>(initial.notices);
  const [error, setError] = useState<SetupError | undefined>(initial.error);
  const [test, setTest] = useState<TestResult | undefined>();
  const [done, setDone] = useState<{ email: string } | undefined>(initial.done);
  const [busy, startTransition] = useTransition();
  const values = { ...initial.values, kind };

  const data = () => new FormData(form.current ?? undefined);

  const runTest = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await testDatabase(data());
      setTest(result);
      if (!result.ok) setError(result.error);
    });

  // Runs the steps that aren't done yet, one by one. A failure goes back to the questions it's
  // about; retrying from there resumes here. A database or instance problem means the settings
  // must be written again, so those start over; a root problem keeps the first two.
  const install = () =>
    startTransition(async () => {
      const submitted = data();
      setCurrent(3);
      setError(undefined);
      let progress = { ...steps };
      const show = (next: Record<StepName, StepResult>) => {
        progress = next;
        setSteps(next);
      };
      const order: [StepName, () => Promise<StepOutcome>][] = [
        ["settings", () => installSettings(submitted)],
        ["migrations", () => installMigrations(submitted)],
        ["root", () => installRoot(submitted)],
      ];
      for (const [name, step] of order) {
        if (progress[name].status === "done") continue;
        show({ ...progress, [name]: { status: "running" } });
        const outcome = await step();
        if (outcome.ok) {
          show({
            ...progress,
            [name]: { status: "done", detail: outcome.detail, say: outcome.say },
          });
          if (outcome.notices.length > 0) setNotices((all) => [...all, ...outcome.notices]);
          if (name === "root" && outcome.email) {
            setDone({ email: outcome.email });
            onDone?.();
          }
          continue;
        }
        show({
          ...progress,
          [name]: { status: "failed", detail: outcome.error.message, say: outcome.error.say },
        });
        setError(outcome.error);
        if (outcome.error.code !== "already_set_up") {
          setCurrent(SECTION_PAGE[outcome.error.section]);
          if (outcome.error.section !== "root") setSteps({ ...PENDING_STEPS });
        }
        return;
      }
    });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (current < 2) setCurrent(current + 1);
    else if (current === 2 || !done) install();
  };

  const failed = STEP_NAMES.some((name) => steps[name].status === "failed");
  const ran = STEP_NAMES.some((name) => steps[name].status !== "pending");

  return (
    <form ref={form} onSubmit={submit} className="grid gap-6" noValidate data-setup="wizard">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t("stepsLabel")}>
        {PAGES.map((page, index) => (
          <li
            key={page}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              index === current ? "font-semibold text-fg" : "text-muted",
            )}
          >
            <span className="tabular-nums">{index + 1}</span>
            {t(`pages.${page}`)}
          </li>
        ))}
      </ol>

      <div hidden={current !== 0} className="grid gap-4">
        <CodeField page={page} error={error} />
        <DatabaseFields page={page} values={values} error={error} onKindChange={setKind} />
        {test?.ok ? (
          <Notice kind="info" title={t("connected", { server: describeServer(test) })}>
            {test.warning}
          </Notice>
        ) : null}
        <div>
          <Button type="button" variant="secondary" onClick={runTest} loading={busy}>
            {t("testConnection")}
          </Button>
        </div>
      </div>
      <div hidden={current !== 1}>
        <InstanceFields page={page} values={values} error={error} />
      </div>
      <div hidden={current !== 2}>
        <RootFields page={page} values={values} error={error} />
      </div>
      <div hidden={current !== 3} className="grid gap-4" data-setup={done ? "done" : "install"}>
        <StepList steps={steps} />
        <AlreadySetUp error={error} />
        <Notices notices={notices} />
        {done ? (
          <>
            <Notice kind="info" title={t("doneTitle")}>
              {t.rich("doneBody", {
                email: done.email,
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </Notice>
            <a
              href={signInHref(done.email)}
              className={cn(buttonClasses("primary"), "justify-self-start")}
            >
              {t("signIn")}
            </a>
          </>
        ) : null}
      </div>

      {done ? null : (
        <div className="flex flex-wrap items-center gap-3">
          {current > 0 && current < 3 ? (
            <Button type="button" variant="secondary" onClick={() => setCurrent(current - 1)}>
              {t("back")}
            </Button>
          ) : null}
          {current < 2 ? <Button type="submit">{t("next")}</Button> : null}
          {current === 2 ? (
            <Button type="submit" loading={busy}>
              {ran && failed ? t("retry") : t("install")}
            </Button>
          ) : null}
          {current === 3 && failed && !busy ? (
            <Button type="button" onClick={install}>
              {t("retry")}
            </Button>
          ) : null}
          {current === 2 ? <span className="text-xs text-muted">{t("installHint")}</span> : null}
        </div>
      )}
    </form>
  );
};
