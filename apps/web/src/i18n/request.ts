import { getRequestConfig } from "next-intl/server";
import { requestMessages } from "./messages";
import { requestLocale } from "./server";

/**
 * next-intl's per-request setup (feature 129), without language prefixes in the URL: the language
 * comes from `requestLocale`, and the messages from `messages/<locale>/*.json` over the English,
 * bar `mail.json`.
 */
export default getRequestConfig(async () => {
  const locale = await requestLocale();
  // The emails' words (189) stay on the server: no page shows them, so no page carries them.
  const { mail: _emails, ...messages } = await requestMessages(locale);
  return { locale, messages };
});
