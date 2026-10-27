import { useTranslations } from "next-intl";
import type { Say } from "./types";

/**
 * The setup's server messages in the person's language (feature 132): a `Say` is a key of
 * `admin.setup` and its values; with none, or one that has no words, the text the server wrote
 * is shown as it is (a driver's message, the database check's explanation).
 */
export const useSay = (): ((say: Say | undefined, fallback: string) => string) => {
  const t = useTranslations("admin.setup");
  // The keys come from the server as text, so they can't be checked against the messages' type.
  const words = t as unknown as {
    (key: string, values?: Record<string, string | number | boolean>): string;
    has: (key: string) => boolean;
    raw: (key: string) => unknown;
  };
  return (say, fallback) => {
    if (!say || say.key.split(".").some((part) => part in Object.prototype)) return fallback;
    // A key of one message (not a group of them) that has all the values it needs.
    if (!words.has(say.key) || typeof words.raw(say.key) !== "string") return fallback;
    const text = words(say.key, say.values);
    return text.startsWith("admin.setup.") ? fallback : text;
  };
};
