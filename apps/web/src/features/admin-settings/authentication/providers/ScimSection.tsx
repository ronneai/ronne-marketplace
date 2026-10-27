"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import {
  generateScimFromForm,
  revokeScimFromForm,
  turnOffScimFromForm,
  turnOnScimFromForm,
} from "./actions";
import type { ScimActionState } from "./types";

/** A token as the section shows it (dates as ISO strings, from the server). */
export type ScimTokenView = {
  id: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export type ScimSectionProps = {
  id: string;
  name: string;
  preset: string;
  enabledAt: string | null;
  base: string;
  tokens: ScimTokenView[];
};

/** What the provider's SCIM settings need, in its own words where they differ (108): the keys of `admin.settings.scim.steps`. */
const STEPS = {
  entra: ["steps.entra.s1", "steps.entra.s2", "steps.entra.s3", "steps.entra.s4"],
  okta: ["steps.okta.s1", "steps.okta.s2", "steps.okta.s3"],
} as const;
const GENERIC_STEPS = ["steps.generic.s1", "steps.generic.s2", "steps.generic.s3"] as const;

const ConfirmDialog = ({
  open,
  onClose,
  title,
  children,
  id,
  action,
  pending,
  label,
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  id: string;
  action: (form: FormData) => void;
  pending: boolean;
  label: string;
  destructive?: boolean;
}) => {
  const t = useTranslations("admin.settings.scim");
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="text-sm text-fg">{children}</div>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant={destructive ? "destructive" : "primary"} loading={pending}>
            {label}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

/** A new token, shown once (108): copy it to the provider now. */
export const NewToken = ({ state }: { state: ScimActionState }) => {
  const t = useTranslations("admin.settings.scim");
  const previous = state.previousExpiresAt;
  return state.token ? (
    <div className="grid gap-2">
      <Notice kind="warn" title={t("newTokenTitle")}>
        {t("newTokenBody")}
        {previous ? (
          <>
            {" "}
            {t.rich("newTokenPrevious", { date: () => <LocalTime value={new Date(previous)} /> })}
          </>
        ) : null}
      </Notice>
      <CopyableCommand command={state.token} prompt={false} />
    </div>
  ) : null;
};

/**
 * Provisioning (SCIM) on a provider's page (108): off until root turns it on; then the base URL,
 * the one token (Generate, Rotate with a 24-hour overlap, Revoke), when it was last used, and the
 * provider's setup steps. Turning it off stops every request at once and keeps the token.
 */
export const ScimSection = ({ id, name, preset, enabledAt, base, tokens }: ScimSectionProps) => {
  const t = useTranslations("admin.settings.scim");
  const [onState, turnOn, turningOn] = useActionState<ScimActionState, FormData>(
    turnOnScimFromForm,
    {},
  );
  const [offState, turnOff, turningOff] = useActionState<ScimActionState, FormData>(
    turnOffScimFromForm,
    {},
  );
  const [made, generate, generating] = useActionState<ScimActionState, FormData>(
    generateScimFromForm,
    {},
  );
  const [revokeState, revoke, revoking] = useActionState<ScimActionState, FormData>(
    revokeScimFromForm,
    {},
  );
  const [confirm, setConfirm] = useState<"on" | "off" | "rotate" | "revoke" | null>(null);
  const close = () => setConfirm(null);
  const error = onState.error ?? offState.error ?? made.error ?? revokeState.error;
  const current = tokens.find((token) => token.expiresAt === null);
  const previous = tokens.find((token) => token.expiresAt !== null);
  const previousExpiresAt = previous?.expiresAt ?? "";
  const previousLastUsedAt = previous?.lastUsedAt ?? null;
  const steps = preset === "entra" || preset === "okta" ? STEPS[preset] : GENERIC_STEPS;

  return (
    <section aria-labelledby="scim-title" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="scim-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h3>
        <Badge tone={enabledAt ? "accent" : "muted"}>{enabledAt ? t("on") : t("off")}</Badge>
        <Help id="scim-provider" />
      </div>
      <p className="text-sm text-muted">{t("intro", { name })}</p>
      {error ? <Notice kind="error" title={error} /> : null}

      {enabledAt ? (
        <>
          <div className="grid gap-1.5">
            <p className="text-xs font-semibold text-muted">{t("baseUrl")}</p>
            <CopyableCommand command={base} prompt={false} />
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold text-muted">{t("token")}</p>
            {current ? (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">{t("made")}</dt>
                <dd>
                  {t.rich("madeAt", {
                    date: () => <LocalTime value={new Date(current.createdAt)} />,
                    hasBy: String(Boolean(current.createdBy)),
                    by: current.createdBy ?? "",
                  })}
                </dd>
                <dt className="text-muted">{t("lastUsed")}</dt>
                <dd>
                  {current.lastUsedAt ? (
                    <LocalTime value={new Date(current.lastUsedAt)} />
                  ) : (
                    t("never")
                  )}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">{t("noToken")}</p>
            )}
            {previous?.expiresAt ? (
              <p className="text-sm text-muted">
                {t.rich("previous", {
                  date: () => <LocalTime value={new Date(previousExpiresAt)} />,
                  hasUsed: String(Boolean(previousLastUsedAt)),
                  used: () =>
                    previousLastUsedAt ? <LocalTime value={new Date(previousLastUsedAt)} /> : null,
                })}
              </p>
            ) : null}
            <NewToken state={made} />
          </div>

          <div className="flex flex-wrap gap-2">
            {current ? (
              <Button variant="secondary" onClick={() => setConfirm("rotate")}>
                {t("rotate")}
              </Button>
            ) : (
              <form action={generate}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" loading={generating}>
                  {t("generate")}
                </Button>
              </form>
            )}
            {tokens.length > 0 ? (
              <Button variant="destructive" onClick={() => setConfirm("revoke")}>
                {t("revoke")}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setConfirm("off")}>
              {t("turnOff")}
            </Button>
          </div>

          <div className="grid gap-1.5">
            <p className="text-xs font-semibold text-muted">{t("atProvider")}</p>
            <ol className="list-decimal pl-5 text-sm text-fg">
              {steps.map((step) => (
                <li key={step}>{t(step)}</li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        <div>
          <Button onClick={() => setConfirm("on")}>{t("turnOn")}</Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "on"}
        onClose={close}
        title={t("onTitle", { name })}
        id={id}
        action={turnOn}
        pending={turningOn}
        label={t("turnOn")}
      >
        <p>{t("onBody", { name })}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "off"}
        onClose={close}
        title={t("offTitle", { name })}
        id={id}
        action={turnOff}
        pending={turningOff}
        label={t("turnOff")}
        destructive
      >
        <p>{t("offBody", { name })}</p>
      </ConfirmDialog>
      <Dialog open={confirm === "rotate"} onClose={close} title={t("rotateTitle")}>
        <form
          action={(form) => {
            close();
            generate(form);
          }}
          className="grid gap-3"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="rotate" value="yes" />
          <p className="text-sm text-fg">{t("rotateBody")}</p>
          <DialogActions>
            <Button variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={generating}>
              {t("rotate")}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirm === "revoke"}
        onClose={close}
        title={t("revokeTitle")}
        id={id}
        action={revoke}
        pending={revoking}
        label={t("revoke")}
        destructive
      >
        <p>{t("revokeBody", { name })}</p>
      </ConfirmDialog>
    </section>
  );
};
