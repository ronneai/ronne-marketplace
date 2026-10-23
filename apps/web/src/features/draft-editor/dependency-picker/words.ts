import { useTranslations } from "next-intl";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import { type Accepts, acceptsOf, versionChoices } from "./model";

/**
 * The picker's words in the person's language (131): what a range accepts, the version list's
 * groups and rows ("^1.4.0 · 1.4.0 or later 1.x, latest"), and an option's status ("published
 * 1.4.0, yours"). The model says what; this says it.
 */
export const usePickerWords = () => {
  const t = useTranslations("author.picker");
  const waits = useTranslations("author.marks.waits");
  const status = useTranslations("author.status");
  const accepts = (value: Accepts): string =>
    value.kind === "first" || value.kind === "firstExactly"
      ? t(`accepts.${value.kind}`)
      : t(`accepts.${value.kind}`, value);
  return {
    /** What `range` accepts, or null when the picker has no words for it. */
    acceptsText: (range: string): string | null => {
      const value = acceptsOf(range);
      return value ? accepts(value) : null;
    },
    /** The version list, each group and row with its label. */
    versionChoices: (option: DependencyOption) =>
      versionChoices(option).map((group) => ({
        label: t(`groups.${group.id}`),
        choices: group.choices.map((choice) => {
          const words = choice.latest
            ? t("latest", { accepts: accepts(choice.accepts) })
            : accepts(choice.accepts);
          return { label: `${choice.range} · ${words}`, range: choice.range, accepts: words };
        }),
      })),
    /** How an option's status reads in the list, and whether it's the person's own. */
    statusText: (option: DependencyOption): string => {
      const shown =
        option.status === "published"
          ? option.latest
            ? t("published", { version: option.latest })
            : status("published")
          : option.status === "draft"
            ? status("draft")
            : waits(option.status);
      return option.mine ? t("yours", { status: shown }) : shown;
    },
  };
};
