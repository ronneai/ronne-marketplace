import { useTranslations } from "next-intl";
import { cn } from "./cn";

/**
 * Something isn't saved (owner, 2026-10-01): an amber dot and words, beside a name. The words, the
 * hint on hover and the classes are props, so any editor can show it the same way.
 */
export const DirtyMark = ({
  label,
  hint,
  className,
}: {
  label?: string;
  hint?: string;
  className?: string;
}) => {
  const t = useTranslations("common.unsaved");
  return (
    <span
      title={hint ?? t("hint")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-warning-text",
        className,
      )}
    >
      <span aria-hidden="true">●</span>
      <span>{label ?? t("mark")}</span>
    </span>
  );
};
