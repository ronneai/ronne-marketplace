"use client";

import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type {
  SkillScanAnalysis,
  SkillScanSettings,
} from "@/server/domains/settings/models/skill-scan-policy";
import { saveSkillScanPolicy } from "../actions";
import type { SettingsActionState } from "../types";
import { SemanticConfirm } from "./SemanticConfirm";

const ANALYSES: readonly SkillScanAnalysis[] = ["static", "semantic"];

/**
 * The scanner's last error, a short code Ronne wrote (`timeout`, `exit 2`), as the message's
 * values: `reason` picks the words, `code` is the exit code; anything else is shown as written.
 */
export const reasonOf = (error: string): { reason: string; code: string; error: string } => {
  const exit = /^exit (-?\d+)$/.exec(error);
  if (exit) return { reason: "exit", code: exit[1] ?? "", error };
  return { reason: error.replaceAll(" ", "_"), code: "", error };
};

/**
 * The security scan (135): whether the scanner is set up on the server, what it said last, then
 * the switch, the item types and the analysis, and Save. The command and the provider are the
 * operator's (environment or settings file): the page only shows them.
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
  const unchanged =
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
    <form action={action} aria-label={t("title")} className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
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
          const off = choice === "semantic" && !scanner.provider && policy.analysis !== "semantic";
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
