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
 * The helpers of the screens moved to messages (feature 130: the browse screens' fourteen) have
 * only their link here; their words are `help.<id>.question` and `.answer` in the three languages.
 * The others still carry their English words, until their screens move (131, 132): a helper moves
 * by deleting its question and answer here and adding them to `messages/<locale>/help.json`.
 */
export const HELP = {
  scope: {
    question: "What's a scope?",
    answer:
      "The part of an item's name before the item, such as @platform in @platform/code-reviewer, or platform in @acme/platform/code-reviewer. It groups related items. Root and a workspace's admins create scopes, each in a workspace; its workspace's members propose items in it, and review is the gate.",
    href: docsHref("scopes", "what"),
  },
  "item-name": {
    question: "Why does the name include the workspace?",
    answer:
      "A scope's name is unique within its workspace, so two teams can each have a test scope. The full name says which: @workspace/scope/name, or @scope/name in global. That's the name you install and depend on.",
    href: docsHref("scopes", "names"),
  },
  workspace: {
    href: docsHref("workspaces", "what"),
  },
  "rename-workspace": {
    question: "What changes when I rename?",
    answer:
      "Its items take the new name: @acme/team/x becomes @new/team/x. Their old names keep working for installs, lockfiles and dependencies, and rmk moves projects to the new ones; Claude Code shows them as new plugins. Links to the workspace (its page, its join link) and the old name in rmk --workspace or a CI workflow stop working. Its members, scopes and requests stay.",
    href: docsHref("workspaces", "managing"),
  },
  "global-always": {
    question: "Why is global always there?",
    answer:
      "Every user but root is a member of global, the workspace everyone on the instance shares, and nobody leaves it. Their role there can change, and here you add the other workspaces they work in, each with a role.",
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
    question: "Who has to agree?",
    answer:
      "Root, and an admin of global moving into global, move at once after typing the scope's name. An admin of the target workspace, or someone moving into their own personal workspace, moves at once. Anyone else asks, and the target's admins or root answer (root alone for global). A scope with versions not reviewed always asks someone else.",
    href: docsHref("workspaces", "moving"),
  },
  "move-approve": {
    href: docsHref("workspaces", "moving"),
  },
  "personal-workspace": {
    href: docsHref("workspaces", "personal"),
  },
  "personal-review": {
    question: "Why isn't it reviewed?",
    answer:
      "It's in your personal workspace, which only you and root can see or install from, so a second pair of eyes would protect nobody. What you submit there is approved at once, and its versions are marked as not reviewed.",
    href: docsHref("workspaces", "personal"),
  },
  "requests-who": {
    href: docsHref("workspaces", "joining"),
  },
  visibility: {
    question: "Public or private?",
    answer:
      "Everyone signed in sees a public workspace's scopes and items, and can depend on them. A private one's are seen only by its members, in any role, and root; to anyone else they don't exist, and only its own items can depend on them. Root can change it later: turning a workspace private is refused while released items outside depend on its items.",
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
    href: docsHref("admin", "feedback"),
  },
  "install-tick": {
    href: docsHref("overview", "getting-started"),
  },
  name: {
    question: "How should I name it?",
    answer:
      "Say what it does, in lowercase letters, digits and hyphens: code-reviewer, sql-style, github. The name is fixed once it's published.",
    href: docsHref("scopes", "names"),
  },
  type: {
    question: "Which type?",
    answer:
      "Pick what the AI tool should do with it: a skill it loads when needed, a rule it always follows, a hook that runs on an event, an MCP server to connect to. The type can't change later.",
    href: docsHref("items", "types"),
  },
  manifest: {
    question: "What goes in ronne.yaml?",
    answer:
      "What the item is: its name, type, description and keywords, and its type's own settings. The other files are its content. There's no version: the release sets it.",
    href: docsHref("items", "manifest"),
  },
  canvas: {
    question: "What does the canvas change?",
    answer:
      "Only dependencies in ronne.yaml. Positions are kept with your draft and aren't released.",
    href: docsHref("items", "canvas"),
  },
  "submit-together": {
    question: "Why do these go together?",
    answer:
      "The item needs them, directly or through each other, and an item can't be reviewed or released without what it needs. At submit, the drafts of yours it needs go with it; at release, the approved ones it needs that aren't released yet. Either way, all or none.",
    href: docsHref("review", "dependencies"),
  },
  "after-submit": {
    question: "What happens next?",
    answer:
      "A moderator or admin of its workspace, or root, who isn't you reviews it. They approve it, ask for changes, or reject it, and you'll see it in the conversation. Once approved, you can release it.",
    href: docsHref("review", "reviewing"),
  },
  risk: {
    question: "Why is it flagged?",
    answer:
      "Flags show what it can do on a developer's machine: run commands, start servers, change permissions, reach the web. They're worked out from the files, so the author can't hide them. They describe; the reviewer decides.",
    href: docsHref("review", "reviewing"),
  },
  decisions: {
    question: "What do these do?",
    answer:
      "Approve lets it be released. Request changes sends it back to its author to fix and resubmit. Reject closes it. Request changes and reject need a message; approving doesn't, root's override included. They're here and on each row of the review queue; on your own submission they're greyed out. All are recorded.",
    href: docsHref("review", "decisions"),
  },
  bump: {
    question: "Patch, minor or major?",
    answer:
      "Patch for fixes, minor for something new that breaks nobody, major for a change that breaks something for installs, such as a removed option or dependency.",
    href: docsHref("versions", "bump"),
  },
  tag: {
    question: "What's a tag?",
    answer:
      "A name that points to a version. latest is what installs get by default, and only points to stable versions; pre-releases go to next.",
    href: docsHref("versions", "tags"),
  },
  "deprecate-yank": {
    question: "Deprecate or yank?",
    answer:
      "Deprecate warns: the version stays installable and shows your message. Yank stops new installs, for a broken or unsafe version; projects that pin it keep working.",
    href: docsHref("versions", "deprecate-yank"),
  },
  token: {
    question: "What's a token for?",
    answer:
      "It lets rmk and the registry's MCP server read the registry as you, and create drafts in your name: only you see them, and nothing is submitted until you do it here. It can't sign in to this website, and you can revoke it here at any time.",
    href: docsHref("rmk", "tokens"),
  },
  "scim-provider": {
    question: "What does the provider need?",
    answer:
      "The base URL and the token, as a Bearer token. It sends each person's email as userName and an id that never changes as externalId (in Entra, map objectId to it), and pushes the groups this page's mappings name. Deprovisioning disables the account; it never erases it.",
    href: docsHref("authentication", "scim"),
  },
  "scim-managed": {
    question: "Why does SCIM manage this account?",
    answer:
      "The identity provider creates and updates it through SCIM: its next sync sets the name, the email and whether it's enabled back to what the provider says. Change those at the provider. A deprovisioned account stays, disabled.",
    href: docsHref("authentication", "scim"),
  },
  "device-code": {
    question: "What is this code?",
    answer:
      "rmk login --web printed it in a terminal, with this page's address. Approving it gives that terminal a token that acts as you for 90 days, so only approve a code you just asked for yourself; the token then appears under Access tokens, where you can revoke it.",
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
    question: "What do these numbers mean?",
    answer:
      "Each tool's marketplace as last built in full: its size, how many plugins it lists, and how long building it took. Claude Code reads a marketplace of at most 5 MiB, within 10 seconds; past 80% of either, a warning shows here. The git mirror has no size limit.",
    href: docsHref("plugins", "large"),
  },
  support: {
    href: docsHref("items", "types"),
  },
  propose: {
    href: docsHref("changes", "propose"),
  },
  export: {
    question: "Already wrote it in your AI tool?",
    answer:
      "Send it here with rmk export: it reads your skill, agent, command, rule or MCP server from Claude Code, Codex or Cursor, shows you everything it would upload, and creates a private draft here for you to check and submit. Exporting it again updates that draft.",
    href: docsHref("export", "what"),
  },
  "submit-many": {
    question: "Submit several at once?",
    answer:
      "Tick the drafts marked Ready, or Select all ready, then Submit selected: each is checked again and submitted on its own, and you see what happened to each. rmk submit --all does the same from a terminal.",
    href: docsHref("review", "many"),
  },
  "approve-many": {
    question: "Approve several at once?",
    answer:
      "Tick the submissions you can approve, or Select all (the rows on this page), then Approve selected: the ones with risk flags are listed first, and one optional message goes on every approval. Each is approved on its own, as from its page, and you see what happened to each. Request changes and Reject are on each row.",
    href: docsHref("review", "approve-many"),
  },
  withdraw: {
    question: "Archive or delete?",
    answer:
      "Archive takes it out of review and out of your list; you can restore it as a draft later. Delete removes it with its history, and is offered only while no reviewer has commented on it or decided it.",
    href: docsHref("review", "withdraw"),
  },
  archived: {
    question: "What's archived?",
    answer:
      "Submissions you withdrew and kept. Only you see them. Restore one to edit and submit it again, or delete it if no reviewer took part.",
    href: docsHref("review", "withdraw"),
  },
  "queue-decisions": {
    question: "Approve, request changes or reject?",
    answer:
      "Request changes sends it back to its author to fix and resubmit; Reject closes it for good. Both need a reason, which the author sees at the top of their page. Each row has them; approving is on the item's page, or several at once with Approve selected.",
    href: docsHref("review", "decisions"),
  },
  "add-dependency": {
    question: "How do I add one?",
    answer:
      "Type part of its name and pick it from the list: your own items in any state, and others' once they're published. It starts on latest's compatible range; pick another, or an exact version, if you need one. In a markdown file, type @ to do the same.",
    href: docsHref("items", "dependencies"),
  },
  "version-range": {
    question: "Compatible or exact?",
    answer:
      "Compatible writes a range, such as ^1.4.0: installs get the newest 1.x from 1.4.0 on, so the dependency's fixes arrive without a new release of this item. Exactly writes one version, such as 1.4.0, which installs keep after newer releases: pick it when a later version could break this item. Below 1.0 a range is narrower: ^0.2.3 accepts 0.2.3 or a later 0.2.x, never 0.3.",
    href: docsHref("items", "dependencies"),
  },
  "which-bump": {
    question: "Which bump?",
    answer:
      "Suggested for each gives every change proposal the bump its changes suggest; or pick patch, minor or major for all. New items are released as 1.0.0 whatever you pick.",
    href: docsHref("versions", "bump"),
  },
  "release-many": {
    question: "Release several at once?",
    answer:
      "Tick approved ones, or Select all approved (the rows on this page), then Release selected: choose stable or pre-release, the bump and the tag once, and see every version before anything goes out. What's joined by a dependency is released together, all or none, and the approved ones they need are added.",
    href: docsHref("versions", "release-many"),
  },
  "waits-on": {
    question: "What does this wait on?",
    answer:
      "Something it depends on isn't released yet. It can be reviewed and approved meanwhile; it's released once its dependencies are. Blocked means one was rejected or archived: remove it from dependencies, or depend on another item.",
    href: docsHref("review", "dependencies"),
  },
  "dependents-listed": {
    question: "Why are these listed?",
    answer:
      "They depend on this submission and wait for its release. Rejecting it leaves them waiting on nothing, so you can send them back to their authors in the same step, with a message of their own.",
    href: docsHref("review", "dependencies"),
  },
  ready: {
    question: "What blocks submitting?",
    answer:
      "The checks Submit runs: the files are valid, the name is free, every dependency is released or in review, and a change proposal changes something. A draft with none of these left is Ready; open one marked to fix to see what's left.",
    href: docsHref("review", "checks"),
  },
  usage: {
    href: docsHref("usage", "reading"),
  },
  "usage-minimum": {
    question: "Why set a minimum?",
    answer:
      "Item pages show usage as soon as any install or run is reported (0). With a minimum, an item shows its usage only from that many installs plus runs in 30 days, so a handful of events doesn't look like a trend and one team's habits don't show.",
    href: docsHref("usage", "reading"),
  },
  "auth-methods": {
    question: "How do people sign in?",
    answer:
      "With their email and password, and with your company's identity provider once root turns one on. Root can always sign in with a password, so a broken identity provider can't lock everyone out.",
    href: docsHref("authentication", "overview"),
  },
  "provider-values": {
    question: "Where do I find these values?",
    answer:
      "At your identity provider, in the application you register for Ronne: the steps here say where. The Documentation has a guide for each provider, with the claims Ronne reads and the usual mistakes.",
    href: docsHref("authentication", "providers"),
  },
  "redirect-uri": {
    question: "Why this address?",
    answer:
      "After someone signs in, the provider sends them back to this address, and only to an address registered with it. Register it exactly as shown: it's this instance's public address and the provider's id, which is why the id can't change later.",
    href: docsHref("authentication", "providers"),
  },
  "provider-groups": {
    question: "How are groups applied?",
    answer:
      "At every sign-in with this provider, each mapped group the person is in gives at least its role in its workspace, and a role a group gave goes when they leave the group. Memberships set by hand, and root, are never changed.",
    href: docsHref("authentication", "groups"),
  },
  "password-lockout": {
    question: "Can root be locked out?",
    answer:
      "No. Root can always sign in with a password, whatever is chosen here. If a provider breaks, disable-sso on the server turns every provider off and gives everyone their password back.",
    href: docsHref("authentication", "lockout"),
  },
  "backup-codes-once": {
    question: "Why can't I show the codes again?",
    answer:
      "Ronne keeps them encrypted and never shows them after this page, so nobody who later opens your account can read them. Save them now. If you lose them, make ten new ones on this page: the old ones stop working.",
    href: docsHref("account", "two-factor"),
  },
  "lost-phone": {
    question: "Lost your phone?",
    answer:
      "Use one of the backup codes you saved when you turned two-factor on. With none left, ask a root to reset your two-factor in Users; then sign in with your password and set it up again on the new phone.",
    href: docsHref("account", "two-factor"),
  },
  "two-factor-policy": {
    question: "Who must enrol?",
    answer:
      "Under Reviewers and root: root, and the moderators and admins of shared workspaces. Under Everyone: every account with a password. Someone it covers who hasn't set two-factor up is sent to their Account page at their next visit, and can't use anything else until they have. Nobody is signed out. Accounts that sign in through a company identity provider aren't covered.",
    href: docsHref("admin", "settings"),
  },
  "reset-two-factor": {
    question: "When do I reset someone's two-factor?",
    answer:
      "When they've lost their phone and their backup codes. They sign in with their password alone, then set two-factor up again on their Account page, at once if it's required of them. A root who lost theirs and has no other root to ask runs reset-root-password on the server, which resets it too.",
    href: docsHref("admin", "users"),
  },
  retention: {
    question: "What is purged, and when?",
    answer:
      "After the IP retention: the client address on audit events, sessions and rmk login approvals, and the email typed in a failed sign-in. After the sessions retention: expired sessions and finished login approvals are deleted. After the feedback retention: feedback marked handled, counted from then (365 days by default); new feedback is never purged. Audit events themselves are never deleted. A purge runs every six hours, or from rmk-server purge.",
    href: docsHref("privacy", "retention"),
  },
  "erase-user": {
    question: "What does erasing do?",
    answer:
      "The person's email, name, picture, passwords, sign-in links, two-factor, sessions, tokens, memberships, favorites, Getting started choices, the feedback they sent and drafts go, for good. What they did stays under the pseudonym deleted-user-<id>: the items and versions they published, their submitted submissions and review comments, and the audit events, which keep making sense. The old email is free at once. To stop someone without erasing, disable them.",
    href: docsHref("privacy", "erase"),
  },
  notice: {
    question: "Who sees this?",
    answer:
      "Everyone who is signed in, under the header of every page, once you show it. Each person can dismiss it; it comes back for them when you change the message or tone, and not when you only hide and show it. It isn't shown on the sign-in page, and it isn't translated: write it in the language your people read.",
    href: docsHref("admin", "notice"),
  },
  "notice-tone": {
    question: "Information or Warning?",
    answer:
      "Information is for news and context, such as “this is a demo”. Warning is for something that needs care, such as “the demo’s data is reset on Friday” or a maintenance window.",
    href: docsHref("admin", "notice"),
  },
  language: {
    question: "What changes?",
    answer:
      "Ronne's own screens: menus, buttons, messages and the Documentation links. Not what people publish: item names, descriptions and files stay as their authors wrote them, and rmk stays in English. Automatic follows your browser's language, and English when it asks for another.",
    href: docsHref("account", "language"),
  },
  "your-data": {
    question: "What is in the file?",
    answer:
      "Your account (never your password hash or two-factor secret), your sessions, token names, workspaces, requests, scopes, your favorites, the feedback you sent, your Getting started choices, items you published, your submissions and comments, and the audit events you took part in. Other people's emails are replaced. It isn't a backup: files and other people's data aren't in it. You can download it once every 10 minutes.",
    href: docsHref("privacy", "your-data"),
  },
  "download-user-data": {
    question: "When do I download someone's data?",
    answer:
      "When they asked what the instance holds about them and can't sign in to get it themselves (disabled, or two-factor lost), and before erasing them: an erased account has nothing left to give. It's the same file they would get, it counts against their one download every 10 minutes, and it's recorded in the audit log with you as who.",
    href: docsHref("privacy", "your-data"),
  },
  "usage-policy": {
    question: "What does rmk report?",
    answer:
      "Daily counts of installs, removals and runs of the items rmk installed from this instance, by item, version and AI tool. Never who, which project, or what was asked. Off: nothing. People choose: on unless they run rmk telemetry off. Required: always.",
    href: docsHref("usage", "policy"),
  },
  "role-root": {
    question: "What can root do?",
    answer:
      "Everything an admin can, in every workspace, plus manage users, create and delete workspaces, change the instance's settings, read the audit log and approve their own submissions. There can be several roots, and each can change any other root's role or account, but not their own.",
    href: docsHref("roles", "roles"),
  },
  "own-row": {
    question: "Why can't I change my own account here?",
    answer:
      "So nobody locks themselves out by mistake. Change your password in Account; another root can change your role, disable you or reset your password.",
    href: docsHref("install", "root"),
  },
  "audit-summary": {
    question: "How do I read a line?",
    answer:
      "Each line is one event: when, who, the action and a sentence saying what happened. Open it for everything recorded: the target, the IP address, the details and the raw JSON. Its link opens the same event for anyone you share it with.",
    href: docsHref("admin", "audit"),
  },
  "audit-incident": {
    question: "Responding to an incident?",
    answer:
      "Filter by the person or the action and the dates to see what happened. To end everyone's sessions or tokens, or replace the secret that signs sessions, use the server's commands: revoke-access and rotate-secret.",
    href: docsHref("incidents", "incidents"),
  },
  "audit-actor": {
    question: "Who can I search for?",
    answer:
      "Part of an email, in any case. system finds events with no one signed in, such as the setup and the command line.",
    href: docsHref("admin", "audit"),
  },
} as const satisfies Record<string, { question?: string; answer?: string; href: string }>;

export type HelpId = keyof typeof HELP;
/** The helpers whose words are messages. */
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
  const help: { question?: string; answer?: string; href: string } = HELP[id];
  // A helper with its words here is English until it moves; one without them is a message.
  const moved = id as MovedId;
  const question = help.question ?? t(`${moved}.question`);
  const answer = help.answer ?? t(`${moved}.answer`);
  return (
    <HelpTip question={question} href={href ?? help.href} className={className} iconOnly={iconOnly}>
      <p>{answer}</p>
    </HelpTip>
  );
};
