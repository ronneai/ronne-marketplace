"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import type { TestSignInResult } from "@/server/domains/identity/actions/identity-providers";
import type { ProviderStatus } from "@/server/domains/identity/models/identity-provider";
import {
  deleteProviderFromForm,
  disableProviderFromForm,
  enableProviderFromForm,
  testConnectionFromForm,
} from "./actions";
import { ProviderStatusBadge } from "./IdentityProvidersPanel";
import type { ConnectionTestState, ProviderFormState } from "./types";

/** Test connection's answer: what was checked, or why it couldn't be. */
export const ConnectionResult = ({ state }: { state: ConnectionTestState }) => {
  const t = useTranslations("admin.settings.providerControls");
  if (state.lines)
    return (
      <Notice
        kind={state.ok ? "info" : "error"}
        title={state.ok ? t("connectionOk") : t("connectionFailed")}
      >
        <ul className="list-disc pl-5">
          {state.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Notice>
    );
  return state.error ? <Notice kind="error" title={state.error} /> : null;
};

/** A *Test sign-in*'s result: the checks, the claims, and what a sign-in would do. */
export const TestResult = ({
  result,
  workspaceNames,
}: {
  result: TestSignInResult;
  workspaceNames: Record<string, string>;
}) => {
  const t = useTranslations("admin.settings.providerControls");
  const roles = useTranslations("common.roles");
  return (
    <Notice
      kind={result.ok ? "info" : "error"}
      title={result.ok ? t("testPassed") : t("testFailed")}
    >
      <div className="grid gap-2">
        <ul className="list-disc pl-5">
          {result.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {result.claims ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t("subject")}</dt>
            <dd className="font-mono break-all">{result.claims.subject}</dd>
            <dt className="text-muted">{t("email")}</dt>
            <dd className="break-all">
              {result.claims.email} {result.claims.emailVerified ? t("verified") : t("notVerified")}
            </dd>
            <dt className="text-muted">{t("name")}</dt>
            <dd>{result.claims.name ?? t("none")}</dd>
            <dt className="text-muted">{t("groups")}</dt>
            <dd className="font-mono break-all">
              {result.claims.groups === null
                ? t("noClaim")
                : result.claims.groups.join(", ") || t("none")}
            </dd>
          </dl>
        ) : null}
        {result.decision ? (
          <p className="text-sm">
            <span className="font-semibold">{t("wouldDo")}</span> {result.decision}
          </p>
        ) : null}
        {result.groupChanges.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {result.groupChanges.map((c) => (
              <li key={`${c.kind}-${c.workspaceId}`}>
                {t(`change.${c.kind}`, {
                  workspace: workspaceNames[c.workspaceId] ?? c.workspaceId,
                  role: c.kind === "add" ? roles(c.role) : "",
                  from: c.kind === "change" ? roles(c.from) : "",
                  to: c.kind === "change" ? roles(c.to) : "",
                })}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted">{t("nothingChanged")}</p>
      </div>
    </Notice>
  );
};

/** Delete's confirm: what deleting does, then Delete provider. */
export const DeleteConfirm = ({
  id,
  name,
  open,
  onClose,
  action,
  pending,
}: {
  id: string;
  name: string;
  open: boolean;
  onClose: () => void;
  action: (form: FormData) => void;
  pending: boolean;
}) => {
  const t = useTranslations("admin.settings.providerControls");
  return (
    <Dialog open={open} onClose={onClose} title={t("deleteTitle", { name })}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm text-fg">{t("deleteBody")}</p>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="destructive" loading={pending}>
            {t("deleteProvider")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

/**
 * The provider's tests and switches (106): Test connection and Test sign-in (in a new tab), their
 * results written out, then Turn on, which needs a passing Test sign-in of this version by the
 * root turning it on; Turn off; and Delete, after a confirm.
 */
export const ProviderControls = ({
  id,
  name,
  status,
  enabled,
  canEnable,
  lastTest,
  workspaceNames,
}: {
  id: string;
  name: string;
  status: ProviderStatus;
  enabled: boolean;
  canEnable: boolean;
  lastTest: TestSignInResult | null;
  workspaceNames: Record<string, string>;
}) => {
  const t = useTranslations("admin.settings.providerControls");
  const [connection, testConnection, testing] = useActionState<ConnectionTestState, FormData>(
    testConnectionFromForm,
    {},
  );
  const [enableState, enable, enabling] = useActionState<ProviderFormState, FormData>(
    enableProviderFromForm,
    {},
  );
  const [disableState, disable, disabling] = useActionState<ProviderFormState, FormData>(
    disableProviderFromForm,
    {},
  );
  const [deleteState, remove, deleting] = useActionState<ProviderFormState, FormData>(
    deleteProviderFromForm,
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const error = enableState.error ?? disableState.error ?? deleteState.error;

  return (
    <section aria-labelledby="provider-controls-title" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="provider-controls-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h3>
        <ProviderStatusBadge status={status} />
      </div>
      {error ? <Notice kind="error" title={error} /> : null}

      <div className="flex flex-wrap gap-2">
        <form action={testConnection}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="secondary" loading={testing}>
            {t("testConnection")}
          </Button>
        </form>
        {/* A plain form, so the browser opens the provider in a new tab (106). */}
        <form
          method="post"
          action={`/api/auth/sso/test/${encodeURIComponent(id)}`}
          target="_blank"
          rel="noopener"
        >
          <Button type="submit" variant="secondary">
            {t("testSignIn")}
          </Button>
        </form>
      </div>

      <ConnectionResult state={connection} />
      {lastTest ? <TestResult result={lastTest} workspaceNames={workspaceNames} /> : null}

      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <form action={disable}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="secondary" loading={disabling}>
              {t("turnOff")}
            </Button>
          </form>
        ) : (
          <form action={enable}>
            <input type="hidden" name="id" value={id} />
            <Button
              type="submit"
              loading={enabling}
              disabledReason={canEnable ? null : t("turnOnReason")}
            >
              {t("turnOn")}
            </Button>
          </form>
        )}
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          {t("delete")}
        </Button>
      </div>
      {!enabled && !canEnable ? <p className="text-sm text-muted">{t("turnOnNeeds")}</p> : null}

      <DeleteConfirm
        id={id}
        name={name}
        open={confirming}
        onClose={() => setConfirming(false)}
        action={remove}
        pending={deleting}
      />
    </section>
  );
};
