import { getTranslations } from "next-intl/server";

/** What a class name looks like: capitalised letters and digits, at most 80 of them. */
const CLASS_NAME = /^[A-Z][A-Za-z0-9]{0,79}$/;

/** The values an error carries that its message may use: `limit`, `tokenName`, `permission`… */
const valuesOf = (error: Error): Record<string, string | number | boolean> => {
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(error))
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      values[key] = value;
  return values;
};

/**
 * What to show for a domain error (feature 129). The services throw errors with English messages
 * made for people (the API gives them as they are); the web app shows the language's own words
 * when `errors.<ClassName>` exists, with the error's fields as the message's values, and the
 * English message otherwise: a new error never shows an empty or raw-key message, only English
 * until someone translates it. Each screen moved to messages brings the errors it can show.
 */
export const errorText = async (error: Error): Promise<string> => {
  // A class name starts with a capital: `toString`, `constructor` and `__proto__` are never keys.
  if (!CLASS_NAME.test(error.name)) return error.message;
  // The key is the error's class name, which TypeScript can't know, so the lookup is dynamic.
  const t = (await getTranslations("errors")) as unknown as {
    (key: string, values?: Record<string, string | number | boolean>): string;
    has(key: string): boolean;
  };
  if (!t.has(error.name)) return error.message;
  // next-intl answers a message it can't fill (a value missing or not plain, an error built by
  // hand) with its key, `errors.<ClassName>`: that is never shown, the error's own words are.
  const text = t(error.name, valuesOf(error));
  return text === `errors.${error.name}` ? error.message : text;
};
