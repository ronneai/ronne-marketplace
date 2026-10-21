import { getTranslations } from "next-intl/server";

/** An Account page's title (feature 129), in the person's language: `Password · Account · Ronne…`. */
export const accountMetadata =
  (tab: "password" | "security" | "language") => async (): Promise<{ title: string }> => {
    const t = await getTranslations("account.tabs");
    return { title: `${t(tab)} · ${t("label")} · Ronne AI Marketplace` };
  };
