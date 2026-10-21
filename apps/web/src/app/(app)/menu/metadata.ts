import { getTranslations } from "next-intl/server";

/** The Menu page's title, in the person's language (feature 129). */
export const generateMetadata = async () => ({
  title: `${(await getTranslations("shell.menu"))("title")} · Ronne AI Marketplace`,
});
