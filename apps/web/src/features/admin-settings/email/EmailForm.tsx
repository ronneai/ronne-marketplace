"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import type { MailTransportKind } from "@/server/domains/mail/models/mail-settings";
import { isMailAddress } from "@/server/domains/mail/models/message";
import type { MailSetupShown } from "@/server/domains/mail/services/mail-setup";
import { saveEmail } from "./actions";
import type { EmailFormState } from "./types";

type Transport = MailTransportKind | "";

// The transports in the order the tab offers them. Listed here, not imported: the settings model
// seals secrets with node:crypto, which has no place in the browser.
const TRANSPORTS: readonly MailTransportKind[] = ["smtp", "ses", "mailgun", "postmark", "resend"];

/** What a secret is typed for (189): a saved one is kept only while this stays the same. */
export const secretTarget = (
  transport: Transport,
  values: { smtpHost: string; domain: string; region: string; sesAccessKeyId: string },
): string => {
  if (transport === "smtp") return values.smtpHost.trim().toLowerCase();
  if (transport === "mailgun") return `${values.domain.trim().toLowerCase()}@${values.region}`;
  if (transport === "ses") return values.sesAccessKeyId.trim();
  return "";
};

const STEPS = ["step1", "step2", "step3"] as const;

/** One text field, its label and hint, marked when the last save refused it. */
const Field = ({
  name,
  label,
  hint,
  value,
  onChange,
  invalid,
  type = "text",
  mono = false,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  type?: "text" | "email" | "password";
  mono?: boolean;
}) => (
  <div className="grid gap-1">
    <Label htmlFor={`mail-${name}`}>{label}</Label>
    <input
      id={`mail-${name}`}
      name={name}
      type={type}
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={hint ? `mail-${name}-hint` : undefined}
      className={`${inputClasses}${mono ? " font-mono" : ""}`}
    />
    {hint ? (
      <p id={`mail-${name}-hint`} className="text-xs text-muted">
        {hint}
      </p>
    ) : null}
  </div>
);

/**
 * Admin › Settings › Email's setup (189): the instance contact, the sender, Reply-To, and the
 * transport with its fields and the preset's steps beside them. A secret is write-only: the page
 * only knows whether one is saved for the transport and target shown, and changing either asks
 * for it again. A plain form, so Save works without JavaScript.
 */
export const EmailForm = ({
  setup,
  initial = {},
}: {
  setup: MailSetupShown;
  initial?: EmailFormState;
}) => {
  const t = useTranslations("admin.settings.email");
  const { state, action, pending, onSubmit } = useKeptActionState(saveEmail, initial);
  const fresh = state !== initial;
  useToastWhen(state, fresh && state.done ? t(`done.${state.done}`) : null);
  const [v, setV] = useState({
    transport: setup.transport as Transport,
    contact: setup.contact,
    fromAddress: setup.fromAddress,
    fromName: setup.fromName,
    replyTo: setup.replyTo,
    smtpHost: setup.smtpHost,
    smtpPort: setup.smtpPort,
    smtpTls: setup.smtpTls || "starttls",
    smtpUser: setup.smtpUser,
    region: setup.region,
    domain: setup.domain,
    sesAccessKeyId: setup.sesAccessKeyId,
    secret: "",
  });
  const [replacing, setReplacing] = useState(false);
  const set = (field: keyof typeof v) => (value: string) =>
    setV((now) => {
      const next = { ...now, [field]: value };
      // Reply-To starts as the contact while that's an address and Reply-To wasn't typed apart.
      if (field === "contact" && (now.replyTo === "" || now.replyTo === now.contact))
        next.replyTo = isMailAddress(value.trim())
          ? value.trim()
          : now.replyTo === now.contact
            ? ""
            : now.replyTo;
      return next;
    });
  const invalid = (field: string) => state.field === field;
  const transport = v.transport;
  const kept =
    setup.secretSaved &&
    transport === setup.transport &&
    secretTarget(transport, v) === secretTarget(setup.transport as Transport, setup);
  const typing = !kept || replacing;
  const secretLabel =
    transport === "smtp"
      ? t("smtp.password")
      : transport === "ses"
        ? t("ses.secret")
        : transport === "postmark"
          ? t("postmark.token")
          : t("apiKey");
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
          <Help id="email-setup" />
        </div>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            name="contact"
            label={t("contact.label")}
            hint={t("contact.hint")}
            value={v.contact}
            onChange={set("contact")}
            invalid={invalid("contact")}
          />
        </div>
        <Field
          name="fromAddress"
          type="email"
          label={t("fromAddress.label")}
          hint={
            <>
              {t("fromAddress.hint")} <Help id="email-domain" />
            </>
          }
          value={v.fromAddress}
          onChange={set("fromAddress")}
          invalid={invalid("fromAddress")}
        />
        <Field
          name="fromName"
          label={t("fromName.label")}
          hint={t("fromName.hint")}
          value={v.fromName}
          onChange={set("fromName")}
          invalid={invalid("fromName")}
        />
        <Field
          name="replyTo"
          type="email"
          label={t("replyTo.label")}
          hint={t("replyTo.hint")}
          value={v.replyTo}
          onChange={set("replyTo")}
          invalid={invalid("replyTo")}
        />
      </div>

      <div className="grid max-w-sm gap-1">
        <Label htmlFor="mail-transport">{t("transport.label")}</Label>
        <select
          id="mail-transport"
          name="transport"
          value={transport}
          onChange={(event) => {
            set("transport")(event.target.value);
            setReplacing(false);
          }}
          aria-invalid={invalid("transport") || undefined}
          className={selectClasses}
        >
          <option value="">{t("transport.choose")}</option>
          {TRANSPORTS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`transport.${kind}`)}
            </option>
          ))}
        </select>
      </div>

      {transport ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="grid content-start gap-4">
            {transport === "smtp" ? (
              <>
                <Field
                  name="smtpHost"
                  label={t("smtp.host")}
                  hint={
                    setup.relayHosts.length > 0
                      ? t("smtp.relays", { hosts: setup.relayHosts.join(", ") })
                      : t("smtp.hostHint")
                  }
                  value={v.smtpHost}
                  onChange={set("smtpHost")}
                  invalid={invalid("smtpHost")}
                  mono
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor="mail-smtpTls">{t("smtp.tls")}</Label>
                    <select
                      id="mail-smtpTls"
                      name="smtpTls"
                      value={v.smtpTls}
                      onChange={(event) => set("smtpTls")(event.target.value)}
                      aria-invalid={invalid("smtpTls") || undefined}
                      className={selectClasses}
                    >
                      {(["starttls", "tls", "none"] as const).map((tls) => (
                        <option key={tls} value={tls}>
                          {t(`smtp.tlsOptions.${tls}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    name="smtpPort"
                    label={t("smtp.port")}
                    hint={t("smtp.portHint")}
                    value={v.smtpPort}
                    onChange={set("smtpPort")}
                    invalid={invalid("smtpPort")}
                    mono
                  />
                </div>
                <Field
                  name="smtpUser"
                  label={t("smtp.user")}
                  hint={t("smtp.userHint")}
                  value={v.smtpUser}
                  onChange={set("smtpUser")}
                  invalid={invalid("smtpUser") || invalid("secretWithoutUser")}
                  mono
                />
              </>
            ) : null}
            {transport === "ses" ? (
              <>
                <Field
                  name="region"
                  label={t("ses.region")}
                  hint={t("ses.regionHint")}
                  value={v.region}
                  onChange={set("region")}
                  invalid={invalid("region")}
                  mono
                />
                <Field
                  name="sesAccessKeyId"
                  label={t("ses.accessKeyId")}
                  value={v.sesAccessKeyId}
                  onChange={set("sesAccessKeyId")}
                  invalid={invalid("sesAccessKeyId")}
                  mono
                />
              </>
            ) : null}
            {transport === "mailgun" ? (
              <>
                <div className="grid max-w-xs gap-1">
                  <Label htmlFor="mail-region">{t("mailgun.region")}</Label>
                  <select
                    id="mail-region"
                    name="region"
                    value={v.region || "us"}
                    onChange={(event) => set("region")(event.target.value)}
                    aria-invalid={invalid("region") || undefined}
                    className={selectClasses}
                  >
                    {(["us", "eu"] as const).map((region) => (
                      <option key={region} value={region}>
                        {t(`mailgun.regions.${region}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  name="domain"
                  label={t("mailgun.domain")}
                  hint={t("mailgun.domainHint")}
                  value={v.domain}
                  onChange={set("domain")}
                  invalid={invalid("domain")}
                  mono
                />
              </>
            ) : null}

            <div className="grid gap-1">
              {typing ? (
                <Field
                  name="secret"
                  type="password"
                  label={secretLabel}
                  hint={kept ? t("secret.replaceHint") : t("secret.hint")}
                  value={v.secret}
                  onChange={set("secret")}
                  invalid={invalid("secret") || invalid("secretInvalid") || invalid("noAuthSecret")}
                  mono
                />
              ) : (
                <>
                  <span className="text-sm font-semibold text-fg">{secretLabel}</span>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-fg">
                    <span>{t("secret.saved")}</span>
                    <Button variant="text" onClick={() => setReplacing(true)}>
                      {t("secret.replace")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted">{t("secret.moves")}</p>
                </>
              )}
              {setup.secretProblem === "unreadable" && transport === setup.transport ? (
                <Notice kind="warn" title={t("secret.unreadable")} />
              ) : null}
            </div>
          </div>
          <aside
            aria-label={t("steps.title")}
            className="grid content-start gap-2 rounded-panel border border-line p-4"
          >
            <h3 className="text-sm font-semibold text-fg">{t("steps.title")}</h3>
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted">
              {STEPS.map((step) => (
                <li key={step}>{t(`steps.${transport}.${step}`)}</li>
              ))}
            </ol>
          </aside>
        </div>
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
