"use client";

import { useTranslations } from "next-intl";
import { type MouseEvent, type ReactNode, useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label, Select, TextField } from "@/components/ui/Field";
import { useToastWhen } from "@/components/ui/toast";
import type {
  ScanSetupShown,
  SkillScanner,
} from "@/server/domains/settings/models/skill-scan-policy";
import { testScanConnection } from "../actions";
import type { SettingsActionState } from "../types";
import { KeyField, type KeyMode, keyModeAfter } from "./KeyField";

/**
 * The LLM provider for semantic scans (136): the environment's, shown as set on the server, or
 * root's provider, model, endpoint and key. The key is write-only: the page only ever knows
 * whether one is stored, and its field starts empty. Test connection sends the form as it is.
 */
export const ProviderFields = ({
  setup,
  provider,
  chosen,
  onChoose,
  onEdit,
  beside,
}: {
  setup: ScanSetupShown;
  /** The provider in use, for the environment's: its name and host, never a key. */
  provider: SkillScanner["provider"];
  chosen: string;
  onChoose: (name: string) => void;
  /** Remove and Replace change what Save sends without a field's change event. */
  onEdit: () => void;
  /** Shown beside the provider's choice on wider screens: the timeout (owner, 2026-10-28). */
  beside?: ReactNode;
}) => {
  const t = useTranslations("admin.settings.scan.provider");
  const [testState, testAction, testing] = useActionState<SettingsActionState, FormData>(
    testScanConnection,
    {},
  );
  // The test's answer is a line to read once: a toast (138); its error stays under the button.
  useToastWhen(testState, testState.done);
  const { stored } = setup;
  // As the form's Save: sent in a transition with JavaScript, so the form isn't reset; without
  // it, the button's formAction posts the form.
  const [, startTransition] = useTransition();
  const test = (event: MouseEvent<HTMLButtonElement>) => {
    const form = event.currentTarget.form;
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    startTransition(() => testAction(data));
  };
  const keyStored = stored.key !== "none" && chosen === stored.provider;
  const [keyMode, setKeyMode] = useState<KeyMode>(keyStored ? "stored" : "typing");
  // Controlled: React resets a form's uncontrolled fields when one of its actions finishes, and
  // Test connection is one. The form remounts this after a save (its `key`), clearing the key.
  const [model, setModel] = useState(stored.model ?? "");
  const [endpoint, setEndpoint] = useState(stored.endpoint ?? "");
  const [key, setKey] = useState("");

  if (setup.providerFrom === "environment")
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted">
          {provider
            ? t("fromServer", { provider: provider.name, host: provider.host })
            : t("fromServerIncomplete")}
        </p>
        {beside ? <div className="sm:max-w-xs">{beside}</div> : null}
      </div>
    );

  const info = setup.providers.find((p) => p.name === chosen);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        <div className="grid gap-1.5">
          <Label htmlFor="scan-provider">{t("label")}</Label>
          <Select
            id="scan-provider"
            name="provider"
            value={chosen}
            onChange={(event) => {
              onChoose(event.target.value);
              setKeyMode("typing");
            }}
          >
            <option value="">{t("none")}</option>
            {setup.providers.map((p) => (
              <option key={p.name} value={p.name}>
                {t(`names.${p.name}` as "names.openai")}
              </option>
            ))}
          </Select>
        </div>
        {beside}
      </div>
      {info ? (
        <>
          {/* Model, endpoint and key side by side on wider screens (owner, 2026-10-28). */}
          <div className="grid gap-3 md:grid-cols-3 md:items-start">
            <TextField
              id="scan-model"
              name="model"
              label={t("model")}
              hint={t("modelHint")}
              maxLength={128}
              autoComplete="off"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            {info.hasEndpoint ? (
              <TextField
                id="scan-endpoint"
                name="endpoint"
                label={t("endpoint")}
                hint={t("endpointHint")}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                required={info.needsEndpoint}
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
              />
            ) : null}
            {info.takesKey ? (
              <KeyField
                mode={keyMode}
                stored={keyStored ? stored.key : "none"}
                value={key}
                onType={setKey}
                onClick={(click) => {
                  setKeyMode(keyModeAfter(keyMode, click));
                  onEdit();
                }}
              />
            ) : null}
          </div>
          <div className="grid gap-2">
            <div>
              <Button
                type="submit"
                variant="secondary"
                formAction={testAction}
                formNoValidate
                onClick={test}
                loading={testing}
              >
                {testing ? t("test.testing") : t("test.button")}
              </Button>
            </div>
            <FieldError id="scan-test-error">{testState.error}</FieldError>
          </div>
        </>
      ) : null}
    </div>
  );
};
