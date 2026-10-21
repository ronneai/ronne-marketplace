import type account from "../../messages/en/account.json";
import type admin from "../../messages/en/admin.json";
import type auth from "../../messages/en/auth.json";
import type catalogue from "../../messages/en/catalogue.json";
import type common from "../../messages/en/common.json";
import type errors from "../../messages/en/errors.json";
import type home from "../../messages/en/home.json";
import type item from "../../messages/en/item.json";
import type shell from "../../messages/en/shell.json";
import type types from "../../messages/en/types.json";

/**
 * The message files (feature 129): `messages/<locale>/<namespace>.json`, one file per area of the
 * app, English the source of every text. A new area adds its file in all three languages and a line
 * here; the parity test fails until they all agree.
 */
export const NAMESPACES = [
  "common",
  "shell",
  "account",
  "auth",
  "errors",
  "admin",
  "home",
  "types",
  "catalogue",
  "item",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** The shape of the messages, taken from the English files, so a wrong key fails the typecheck. */
export type Messages = {
  common: typeof common;
  shell: typeof shell;
  account: typeof account;
  auth: typeof auth;
  errors: typeof errors;
  admin: typeof admin;
  home: typeof home;
  types: typeof types;
  catalogue: typeof catalogue;
  item: typeof item;
};
