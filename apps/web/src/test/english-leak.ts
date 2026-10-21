import type { Locale } from "@/server/domains/identity/models/locale";

/**
 * The English-leak guard of a sweep (feature 130): given what a screen rendered in Portuguese or
 * French, which English messages of the given namespaces still stand there as text? A message
 * counts when it reads differently in the language, is a plain sentence (no placeholders or tags,
 * which are compared in their parts) and appears as a whole text node or attribute value. A
 * component that goes back to written-in English, or shows the wrong language, fails here.
 */
type Tree = { [key: string]: string | Tree };

const read = async (locale: string, namespace: string): Promise<Tree> =>
  (await import(`../../messages/${locale}/${namespace}.json`)).default;

const flat = (value: string | Tree, prefix = ""): Record<string, string> =>
  typeof value === "string"
    ? { [prefix]: value }
    : Object.assign(
        {},
        ...Object.entries(value).map(([key, child]) =>
          flat(child, prefix ? `${prefix}.${key}` : key),
        ),
      );

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

/** The attributes that carry words a person reads (a `value="moderator"` is an identifier). */
const WORDS = /(?:aria-label|title|placeholder|alt|label)="/;

const standsAlone = (html: string, text: string) =>
  html.includes(`>${text}<`) ||
  new RegExp(`${WORDS.source}${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html) ||
  html.includes(`>${text} `) ||
  html.includes(` ${text}<`);

const plain = (text: string) => text.length >= 8 && !/[{<]/.test(text);

const load = async (locale: string, namespaces: string[]) => {
  const out: Record<string, string> = {};
  for (const namespace of namespaces)
    Object.assign(out, flat(await read(locale, namespace), namespace));
  return out;
};

/** The keys (`namespace.path`) of English texts that still stand in `html` rendered in `locale`. */
export const englishLeaks = async (
  namespaces: string[],
  locale: Exclude<Locale, "en">,
  html: string,
): Promise<string[]> => {
  const english = await load("en", namespaces);
  const own = await load(locale, namespaces);
  return Object.entries(english)
    .filter(
      ([key, text]) => plain(text) && text !== own[key] && standsAlone(html, escapeHtml(text)),
    )
    .map(([key]) => key);
};

/** How many of the language's own plain texts the render shows: proof the check can see anything. */
export const ownTextsShown = async (
  namespaces: string[],
  locale: Exclude<Locale, "en">,
  html: string,
): Promise<number> => {
  const own = await load(locale, namespaces);
  return Object.values(own).filter((text) => plain(text) && standsAlone(html, escapeHtml(text)))
    .length;
};
