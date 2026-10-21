import { logger } from "@/server/log";
import { type Catalogue, mergeWithFallback, missingKeys } from "./catalogue";
import type { Locale } from "./locale";
import { type Messages, NAMESPACES, type Namespace } from "./namespaces";

/** Reads one message file. The default imports it, so the bundler includes every file. */
export type Reader = (locale: Locale, namespace: Namespace) => Promise<Catalogue>;

const readFile: Reader = async (locale, namespace) =>
  (await import(`../../messages/${locale}/${namespace}.json`)).default;

const log = logger.child({ domain: "i18n" });
const warned = new Set<string>();

/**
 * The messages for a language (feature 129): its files over the English ones, so a message that
 * isn't translated yet shows in English, never as a key. Each such gap is logged once per process
 * and language; CI fails on one (the parity test), so it only happens on a build that skipped it.
 */
export const loadMessages = async (locale: Locale, read: Reader = readFile): Promise<Messages> => {
  const messages: Record<string, Catalogue> = {};
  for (const namespace of NAMESPACES) {
    const english = await read("en", namespace);
    if (locale === "en") {
      messages[namespace] = english;
      continue;
    }
    const own = await read(locale, namespace);
    const missing = missingKeys(english, own);
    if (missing.length > 0 && !warned.has(`${locale}/${namespace}`)) {
      warned.add(`${locale}/${namespace}`);
      log.warn("Messages missing in this language, showing English", {
        locale,
        namespace,
        count: missing.length,
        keys: missing.slice(0, 20),
      });
    }
    messages[namespace] = mergeWithFallback(english, own);
  }
  return messages as unknown as Messages;
};

const cache = new Map<Locale, Promise<Messages>>();

/** The same, kept per language for the life of a production server; development re-reads. */
export const requestMessages = (locale: Locale): Promise<Messages> => {
  if (process.env.NODE_ENV !== "production") return loadMessages(locale);
  let messages = cache.get(locale);
  if (!messages) {
    messages = loadMessages(locale);
    cache.set(locale, messages);
  }
  return messages;
};
