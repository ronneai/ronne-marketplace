"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TextField } from "@/components/ui/Field";
import type { ScanSetupShown } from "@/server/domains/settings/models/skill-scan-policy";

/**
 * The scanner service's addresses (156, decision 7): root's, unless the environment sets them
 * (then the state above says where they are). Saving checks each is the scan service, and refuses
 * one that isn't with the reason. A semantic scan carries the LLM provider's key to the semantic
 * address, which the hint says.
 */
export const ScannerAddress = ({ setup }: { setup: ScanSetupShown }) => {
  const t = useTranslations("admin.settings.scan.address");
  // Controlled, so Test connection's form reset leaves them as typed.
  const [url, setUrl] = useState(setup.serviceFrom === "settings" ? setup.serviceUrl : "");
  const [semantic, setSemantic] = useState(
    setup.serviceFrom === "settings" ? setup.semanticServiceUrl : "",
  );
  if (setup.serviceFrom === "environment") return null;
  return (
    <div className="grid gap-3">
      <TextField
        id="scan-service-url"
        name="serviceUrl"
        label={t("label")}
        hint={t("hint")}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        maxLength={2048}
        placeholder={t("placeholder")}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <TextField
        id="scan-semantic-service-url"
        name="semanticServiceUrl"
        label={t("semanticLabel")}
        hint={t("semanticHint")}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        maxLength={2048}
        placeholder={t("semanticPlaceholder")}
        value={semantic}
        onChange={(event) => setSemantic(event.target.value)}
      />
    </div>
  );
};
