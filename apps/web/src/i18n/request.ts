import { getRequestConfig } from "next-intl/server";
import { requestMessages } from "./messages";
import { requestLocale } from "./server";

/**
 * next-intl's per-request setup (feature 129), without language prefixes in the URL: the language
 * comes from `requestLocale`, and the messages from `messages/<locale>/*.json` over the English.
 */
export default getRequestConfig(async () => {
  const locale = await requestLocale();
  return { locale, messages: await requestMessages(locale) };
});
