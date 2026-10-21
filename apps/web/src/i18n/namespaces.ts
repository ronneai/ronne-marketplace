import type common from "../../messages/en/common.json";

/**
 * The message files (feature 129): `messages/<locale>/<namespace>.json`, one file per area of the
 * app, English the source of every text. A new area adds its file in all three languages and a line
 * here; the parity test fails until they all agree.
 */
export const NAMESPACES = ["common"] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** The shape of the messages, taken from the English files, so a wrong key fails the typecheck. */
export type Messages = {
  common: typeof common;
};
