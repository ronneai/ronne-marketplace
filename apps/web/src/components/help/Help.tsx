import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HelpTip } from "@/components/ui/HelpTip";
import type { Messages } from "@/i18n/namespaces";
import { docsHref } from "./topics";

/**
 * Every inline helper (feature 033), in one place: the question, a short answer, and the
 * Documentation section it leads to. Pages use `<Help id="scope" />`, so the words stay the same
 * wherever a question comes up, and a test can check every link.
 *
 * Every helper's words are messages (feature 130: the browse screens' fourteen; 131: the authoring
 * and review screens' 27; 132: the admin and setup screens' 32): only its link is here, and the
 * words are `help.<id>.question` and `.answer` in the three languages.
 */
export const HELP = {
  scope: {
    href: docsHref("scopes", "what"),
  },
  "item-name": {
    href: docsHref("scopes", "names"),
  },
  workspace: {
    href: docsHref("workspaces", "what"),
  },
  "rename-workspace": {
    href: docsHref("workspaces", "managing"),
  },
  "global-always": {
    href: docsHref("workspaces", "global"),
  },
  "member-roles": {
    href: docsHref("roles", "permissions"),
  },
  "current-workspace": {
    href: docsHref("workspaces", "current"),
  },
  join: {
    href: docsHref("workspaces", "joining"),
  },
  "move-who": {
    href: docsHref("workspaces", "moving"),
  },
  "move-approve": {
    href: docsHref("workspaces", "moving"),
  },
  "item-move-who": {
    href: docsHref("scopes", "moving-items"),
  },
  "item-move-approve": {
    href: docsHref("scopes", "moving-items"),
  },
  "item-history": {
    href: docsHref("items", "history"),
  },
  "personal-workspace": {
    href: docsHref("workspaces", "personal"),
  },
  "personal-review": {
    href: docsHref("workspaces", "personal"),
  },
  "requests-who": {
    href: docsHref("workspaces", "joining"),
  },
  visibility: {
    href: docsHref("workspaces", "visibility"),
  },
  "private-item": {
    href: docsHref("workspaces", "visibility"),
  },
  favorites: {
    href: docsHref("overview", "path"),
  },
  pins: {
    href: docsHref("workspaces", "pins"),
  },
  "feedback-who": {
    href: docsHref("feedback", "feedback"),
  },
  "install-tick": {
    href: docsHref("overview", "getting-started"),
  },
  name: {
    href: docsHref("scopes", "names"),
  },
  type: {
    href: docsHref("items", "types"),
  },
  manifest: {
    href: docsHref("items", "manifest"),
  },
  canvas: {
    href: docsHref("items", "canvas"),
  },
  "submit-together": {
    href: docsHref("review", "dependencies"),
  },
  "after-submit": {
    href: docsHref("review", "reviewing"),
  },
  risk: {
    href: docsHref("review", "reviewing"),
  },
  decisions: {
    href: docsHref("review", "decisions"),
  },
  bump: {
    href: docsHref("versions", "bump"),
  },
  tag: {
    href: docsHref("versions", "tags"),
  },
  "deprecate-yank": {
    href: docsHref("versions", "deprecate-yank"),
  },
  token: {
    href: docsHref("rmk", "tokens"),
  },
  "scim-provider": {
    href: docsHref("scim", "scim"),
  },
  "scim-managed": {
    href: docsHref("scim", "scim"),
  },
  "device-code": {
    href: docsHref("rmk", "web"),
  },
  contents: {
    href: docsHref("items", "contents"),
  },
  install: {
    href: docsHref("rmk", "installing"),
  },
  plugin: {
    href: docsHref("plugins", "claude-code"),
  },
  "plugin-feeds": {
    href: docsHref("plugins", "large"),
  },
  support: {
    href: docsHref("items", "types"),
  },
  propose: {
    href: docsHref("changes", "propose"),
  },
  export: {
    href: docsHref("export", "what"),
  },
  "submit-many": {
    href: docsHref("review", "many"),
  },
  "approve-many": {
    href: docsHref("review", "approve-many"),
  },
  withdraw: {
    href: docsHref("review", "withdraw"),
  },
  archived: {
    href: docsHref("review", "withdraw"),
  },
  "queue-decisions": {
    href: docsHref("review", "decisions"),
  },
  "add-dependency": {
    href: docsHref("items", "dependencies"),
  },
  "version-range": {
    href: docsHref("items", "dependencies"),
  },
  "which-bump": {
    href: docsHref("versions", "bump"),
  },
  "release-many": {
    href: docsHref("versions", "release-many"),
  },
  "waits-on": {
    href: docsHref("review", "dependencies"),
  },
  "dependents-listed": {
    href: docsHref("review", "dependencies"),
  },
  ready: {
    href: docsHref("review", "checks"),
  },
  usage: {
    href: docsHref("usage", "reading"),
  },
  "usage-minimum": {
    href: docsHref("usage", "reading"),
  },
  "auth-methods": {
    href: docsHref("authentication", "overview"),
  },
  "provider-values": {
    href: docsHref("authentication", "providers"),
  },
  "redirect-uri": {
    href: docsHref("authentication", "providers"),
  },
  "provider-groups": {
    href: docsHref("authentication", "groups"),
  },
  "password-lockout": {
    href: docsHref("password-sign-in", "lockout"),
  },
  "backup-codes-once": {
    href: docsHref("account", "two-factor"),
  },
  "lost-phone": {
    href: docsHref("account", "two-factor"),
  },
  "two-factor-policy": {
    href: docsHref("settings", "settings"),
  },
  "reset-two-factor": {
    href: docsHref("admin", "users"),
  },
  retention: {
    href: docsHref("privacy", "retention"),
  },
  "erase-user": {
    href: docsHref("privacy", "erase"),
  },
  notice: {
    href: docsHref("notice", "notice"),
  },
  "notice-tone": {
    href: docsHref("notice", "notice"),
  },
  language: {
    href: docsHref("account", "language"),
  },
  "your-data": {
    href: docsHref("privacy", "your-data"),
  },
  "download-user-data": {
    href: docsHref("privacy", "your-data"),
  },
  "usage-policy": {
    href: docsHref("usage", "policy"),
  },
  "role-root": {
    href: docsHref("roles", "roles"),
  },
  "password-change": {
    href: docsHref("admin", "users"),
  },
  "own-row": {
    href: docsHref("install", "root"),
  },
  "audit-summary": {
    href: docsHref("audit", "audit"),
  },
  "audit-incident": {
    href: docsHref("incidents", "incidents"),
  },
  "audit-actor": {
    href: docsHref("audit", "audit"),
  },
} as const satisfies Record<string, { href: string }>;

export type HelpId = keyof typeof HELP;
/** Every helper's words are messages: `help.<id>.question` and `.answer`. */
type MovedId = keyof Messages["help"];

export const Help = ({
  id,
  className,
  iconOnly,
  href,
}: {
  id: HelpId;
  className?: string;
  /** Only the icon; the question is still read out (HelpTip). */
  iconOnly?: boolean;
  /** A more precise section than the helper's own, made with `docsHref` (a preset's guide). */
  href?: string;
}): ReactNode => {
  const t = useTranslations("help");
  const help: { href: string } = HELP[id];
  const moved = id as MovedId;
  return (
    <HelpTip
      question={t(`${moved}.question`)}
      href={href ?? help.href}
      className={className}
      iconOnly={iconOnly}
    >
      <p>{t(`${moved}.answer`)}</p>
    </HelpTip>
  );
};
