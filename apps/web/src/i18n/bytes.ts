import { useTranslations } from "next-intl";

const MB = 1024 * 1024;

/**
 * A size as `@ronneai/core`'s `formatBytes` rounds it ("13 KB", "1.5 MB"), with the number and the
 * unit in the person's language (131): "1,5 MB" in Portuguese, "1,5 Mo" in French.
 */
export const useBytes = () => {
  const t = useTranslations("common.bytes");
  return (bytes: number): string =>
    bytes >= MB
      ? t("mb", { size: Number((bytes / MB).toFixed(bytes % MB ? 1 : 0)) })
      : t("kb", { size: Math.ceil(bytes / 1024) });
};
