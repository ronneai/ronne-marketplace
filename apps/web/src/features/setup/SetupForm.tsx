"use client";

import { useActionState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { installAll } from "./actions";
import { DatabaseFields, InstanceFields, RootFields } from "./fields";
import { StepList } from "./StepList";
import { type InstallState, PENDING_STEPS, type SetupPageProps, STEP_NAMES } from "./types";

const signInHref = (email: string) => `/sign-in?email=${encodeURIComponent(email)}`;

/**
 * The whole setup as one form: every question visible, one Install button that runs the three
 * steps in a single request and comes back with the progress list. This is what a browser without
 * JavaScript gets; with it, the wizard hydrates over the same fields.
 */
export const SetupForm = ({ page }: { page: SetupPageProps }) => {
  const initial: InstallState = { steps: { ...PENDING_STEPS }, notices: [], values: page.initial };
  const [state, action, pending] = useActionState(installAll, initial);
  const ran = STEP_NAMES.some((name) => state.steps[name].status !== "pending");

  if (state.done) {
    return (
      <div className="grid gap-4" data-setup="done">
        <StepList steps={state.steps} />
        <Notice kind="info" title="Ronne AI Marketplace is set up">
          Sign in as <code className="font-mono">{state.done.email}</code> to create scopes and
          invite people.
        </Notice>
        <a href={signInHref(state.done.email)} className={buttonClasses("primary")}>
          Sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-6" noValidate>
      {ran ? <StepList steps={state.steps} /> : null}
      {state.error && state.error.code === "already_set_up" ? (
        <Notice kind="error" title={state.error.message}>
          <a href="/sign-in" className="text-link underline underline-offset-2">
            Go to sign-in
          </a>
        </Notice>
      ) : null}
      {state.notices.map((notice) => (
        <Notice key={notice} kind="warn" title={notice} />
      ))}
      <DatabaseFields page={page} values={state.values} error={state.error} />
      <InstanceFields page={page} values={state.values} error={state.error} />
      <RootFields page={page} values={state.values} error={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Install
        </Button>
        <span className="text-xs text-muted">
          Writes the settings, applies the migrations and creates the root account.
        </span>
      </div>
    </form>
  );
};
