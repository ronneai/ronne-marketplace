import type { NotificationView } from "@/server/domains/notifications/services/read";

/** What a sentence is told: only strings and numbers (a boolean or null parameter is left out). */
export type SentenceValues = Record<string, string | number>;

/**
 * The values of a notification's sentence, `notifications.<kind>` (139): its parameters, and who
 * did it: their name now, or `system` (the message "The system") when nobody did. The sentence is
 * drawn in the reader's language where it is shown, so a translation fixes old notifications too.
 */
/** What a sentence needs of a notification: its kind, parameters and who did it. */
export type SentenceSource = Pick<NotificationView, "kind" | "params" | "actor">;

export const sentenceValues = (view: SentenceSource, system: string): SentenceValues => ({
  ...Object.fromEntries(
    Object.entries(view.params).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number",
    ),
  ),
  actor: view.actor?.name ?? system,
});

/** The sentence's text as the app's translator gives it: a key and its values. */
export type Translate = (key: string, values: SentenceValues) => string;

/**
 * The notification's sentence, or `fallback` when it can't be worded (139): a row written with a
 * parameter the message needs and lacks, or by a later version. The translator then returns the
 * message's path rather than text, which must never reach the screen.
 */
export const renderSentence = (
  t: Translate,
  view: SentenceSource,
  system: string,
  fallback: string,
): string => {
  try {
    const text = t(view.kind, sentenceValues(view, system));
    return !text || text === view.kind || text === `notifications.${view.kind}` ? fallback : text;
  } catch {
    return fallback;
  }
};
