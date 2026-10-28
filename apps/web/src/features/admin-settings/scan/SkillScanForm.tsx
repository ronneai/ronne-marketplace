"use client";

import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import { useTranslations } from "next-intl";
import { type FormEvent, useActionState, useEffect, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { reasonOf } from "@/components/scan/reason";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type {
  SkillScanAnalysis,
  SkillScanSettings,
} from "@/server/domains/settings/models/skill-scan-policy";
import { saveSkillScanPolicy } from "../actions";
import type { SettingsActionState } from "../types";
import { ProviderFields } from "./ProviderFields";
import { ScannerCommand } from "./ScannerCommand";
import { SemanticConfirm } from "./SemanticConfirm";
import { TimeoutField } from "./TimeoutField";

/** The fields of the scanner's setup (136): a change to any of them is something to save. */
const SETUP_FIELDS = new Set(["command", "provider", "model", "endpoint", "key", "timeout"]);

const ANALYSES: readonly SkillScanAnalysis[] = ["static", "semantic"];

/**
 * The security scan (135, 136): whether the scanner is set up, what it said last, the command
 * from the operator's list, the provider with its write-only key, the timeout, then the switch,
 * the item types and the analysis, and one Save. What the environment sets is shown, read-only.
 */
export const SkillScanForm = ({ settings }: { settings: SkillScanSettings }) => {
  const t = useTranslations("admin.settings.scan");
  const typeName = useTranslations("types.name");
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    saveSkillScanPolicy,
    {},
  );
  const { policy, scanner } = settings;
  const [enabled, setEnabled] = useState(policy.enabled);
  const [types, setTypes] = useState<readonly ItemType[]>(policy.types);
  const [analysis, setAnalysis] = useState<SkillScanAnalysis>(policy.analysis);
  const setup = scanner.setup;
  // With JavaScript, Save sends the form in a transition: React then leaves the fields as they
  // are, where a form action would reset them (a controlled select would show its first option
  // while the form still held another). Without JavaScript, the form's action posts as usual.
  const [, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
  // Each save that went through gives the provider's fields a fresh start: the typed key goes.
  const [saves, setSaves] = useState(0);
  useEffect(() => {
    if (state.done) setSaves((n) => n + 1);
  }, [state]);
  const [chosenProvider, setChosenProvider] = useState(setup?.stored.provider ?? "");
  const [setupChanged, setSetupChanged] = useState(false);
  const unchanged =
    !setupChanged &&
    enabled === policy.enabled &&
    analysis === policy.analysis &&
    types.join(",") === policy.types.join(",");
  const toggle = (type: ItemType) =>
    setTypes(
      types.includes(type)
        ? types.filter((t) => t !== type)
        : ITEM_TYPES.filter((t) => t === type || types.includes(t)),
    );
  return (
    <form
      action={action}
      onSubmit={submit}
      aria-label={t("title")}
      className="grid gap-4"
      onChange={(event) => {
        // A field's change bubbles up here: the target is the field, not the form.
        const { name } = event.target as EventTarget & { name?: string };
        if (name && SETUP_FIELDS.has(name)) setSetupChanged(true);
      }}
    >
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          {t("title")} <Help id="scan-settings" />
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      {scanner.configured ? (
        <Notice kind="info" title={t("scanner.configured")}>
          {settings.lastVersion ? (
            <p>{t("scanner.lastVersion", { version: settings.lastVersion })}</p>
          ) : null}
        </Notice>
      ) : (
        <Notice kind="warn" title={t("scanner.missing.title")}>
          <p>{t("scanner.missing.body")}</p>
        </Notice>
      )}
      {settings.lastError ? (
        <Notice kind="warn" title={t("scanner.lastError", reasonOf(settings.lastError))} />
      ) : null}
      {settings.runsStatic ? <Notice kind="warn" title={t("analysis.runsStatic")} /> : null}

      {setup ? (
        <>
          <section className="grid gap-2" aria-labelledby="scan-command-title">
            <h3 id="scan-command-title" className="text-sm font-semibold text-fg">
              {t("command.title")}
            </h3>
            <ScannerCommand key={`${setup.chosenCommand}`} setup={setup} />
          </section>
          <section className="grid gap-2" aria-labelledby="scan-provider-title">
            <h3 id="scan-provider-title" className="text-sm font-semibold text-fg">
              {t("provider.title")}
            </h3>
            <p className="text-sm text-muted">{t("provider.hint")}</p>
            <ProviderFields
              // A new instance once a save changes what's stored: the typed key goes.
              key={`${setup.stored.provider}|${setup.stored.endpoint}|${setup.stored.key}|${saves}`}
              setup={setup}
              provider={scanner.provider}
              chosen={chosenProvider}
              onChoose={(name) => {
                setChosenProvider(name);
                setSetupChanged(true);
              }}
              onEdit={() => setSetupChanged(true)}
              beside={
                <TimeoutField key={`${setup.timeoutFrom}${setup.timeoutSeconds}`} setup={setup} />
              }
            />
          </section>
        </>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          disabled={!scanner.configured && !enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 size-4 accent-(--accent)"
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">{t("enabled.label")}</span>
          <span className="text-muted">{t("enabled.hint")}</span>
        </span>
      </label>

      <fieldset className="grid gap-2" aria-describedby="scan-types-hint">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("types.title")}</legend>
        <p id="scan-types-hint" className="text-sm text-muted">
          {t("types.hint")}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ITEM_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name="types"
                value={type}
                checked={types.includes(type)}
                onChange={() => toggle(type)}
                className="size-4 accent-(--accent)"
              />
              {typeName(type)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("analysis.title")}</legend>
        {ANALYSES.map((choice) => {
          // Off without a provider, unless it's what's saved: then root can still go back to it.
          // A provider root picks in this form counts: the save sets it up before the analysis.
          const off =
            choice === "semantic" &&
            !scanner.provider &&
            !(setup?.providerFrom !== "environment" && chosenProvider) &&
            policy.analysis !== "semantic";
          return (
            <label key={choice} className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="analysis"
                value={choice}
                checked={analysis === choice}
                disabled={off}
                onChange={() => setAnalysis(choice)}
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{t(`analysis.${choice}.label`)}</span>
                <span className="text-muted">
                  {choice === "semantic" && scanner.provider
                    ? scanner.provider.model
                      ? t("analysis.semantic.sends", {
                          provider: scanner.provider.name,
                          model: scanner.provider.model,
                          host: scanner.provider.host,
                        })
                      : t("analysis.semantic.sendsNoModel", {
                          provider: scanner.provider.name,
                          host: scanner.provider.host,
                        })
                    : t(`analysis.${choice}.hint`)}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <SemanticConfirm saved={policy.analysis} chosen={analysis} provider={scanner.provider} />

      <FieldError id="scan-error">{state.error}</FieldError>
      {state.done ? <Notice kind="info" title={state.done} /> : null}
      <div>
        <Button type="submit" disabled={pending || unchanged || types.length === 0}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
