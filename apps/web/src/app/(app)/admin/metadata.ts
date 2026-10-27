import { getTranslations } from "next-intl/server";
import { pageTitle } from "@/i18n/page-title";

/** The `<title>` of an Admin page (feature 132), in the person's language: `Users · Ronne…`. */
export const adminTitle = (page: "users" | "user" | "audit") => async () => {
  const t = await getTranslations("admin.pages");
  return { title: pageTitle(t(page)) };
};

/** Settings reads `Settings · Admin · Ronne…`, as it always did. */
export const settingsTitle = async () => {
  const t = await getTranslations("admin.pages");
  return { title: pageTitle(t("settings"), t("area")) };
};
