"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/Notice";
import type {
  SkillScanAnalysis,
  SkillScanner,
} from "@/server/domains/settings/models/skill-scan-policy";

/** Root is switching to semantic: the page says where the files will go before Save. */
export const confirmsSemantic = (
  saved: SkillScanAnalysis,
  chosen: SkillScanAnalysis,
  hasProvider: boolean,
): boolean => chosen === "semantic" && saved !== "semantic" && hasProvider;

/** The warning, naming the provider and the host the files will go to (135). */
export const SemanticConfirm = ({
  saved,
  chosen,
  provider,
}: {
  saved: SkillScanAnalysis;
  chosen: SkillScanAnalysis;
  provider: SkillScanner["provider"];
}) => {
  const t = useTranslations("admin.settings.scan");
  if (!provider || !confirmsSemantic(saved, chosen, true)) return null;
  return (
    <Notice
      kind="warn"
      title={t("analysis.warning", { provider: provider.name, host: provider.host })}
    />
  );
};
