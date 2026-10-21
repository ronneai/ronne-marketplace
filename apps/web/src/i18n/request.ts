import { getRequestConfig } from "next-intl/server";
import { requestLocale } from "./server";

/**
 * next-intl's per-request setup (feature 129), without language prefixes in the URL: the language
 * comes from `requestLocale`. The message files join it in the next task.
 */
export default getRequestConfig(async () => {
  return { locale: await requestLocale(), messages: {} };
});
