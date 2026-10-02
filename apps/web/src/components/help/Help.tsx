import type { ReactNode } from "react";
import { HelpTip } from "@/components/ui/HelpTip";
import { docsHref } from "./topics";

/**
 * Every inline helper (feature 033), in one place: the question, a short answer, and the
 * Documentation section it leads to. Pages use `<Help id="scope" />`, so the words stay the same
 * wherever a question comes up, and a test can check every link.
 */
export const HELP = {
  scope: {
    question: "What's a scope?",
    answer:
      "The first part of an item's name, after the @, such as @platform in @platform/code-reviewer. It groups related items. Root creates scopes; anyone may propose items in any of them, because review is the gate.",
    href: docsHref("scopes", "what"),
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
  "after-submit": {
    question: "What happens next?",
    answer:
      "A moderator or root who isn't you reviews it. They approve it, ask for changes, or reject it, and you'll see it in the conversation. Once approved, you can release it.",
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
  contents: {
    question: "What am I looking at?",
    answer:
      "This version's files as released: exactly what rmk install gets, checked against the package's checksum. Overview sums it up: how to install it, what it can do, its main file to read and who reviewed it; Files shows every file, with its source a tab away.",
    href: docsHref("items", "contents"),
  },
  install: {
    question: "How do I install it?",
    answer:
      "Copy the command into a terminal in your project, after rmk login. rmk resolves the version, checks the download, writes the files your AI tool reads, and records them in rmk.lock so teammates get the same. With the registry MCP server set up, you can also ask your AI tool to install it: it shows you the plan first.",
    href: docsHref("rmk", "installing"),
  },
  support: {
    question: "What do these mean?",
    answer:
      "Supported: rmk writes the item where the tool reads it. Partly: the tool takes it through a workaround, and some of it is left out. Turned off: this version's ronne.yaml keeps it away from that tool. Skipped: the tool has no place for this type; rmk warns and installs the rest.",
    href: docsHref("items", "types"),
  },
  propose: {
    question: "What happens when I propose a change?",
    answer:
      "You get a draft of this version, with all its files, to edit and submit. Once reviewed and approved, it's released as the item's next version.",
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
      "Tick the submissions you can approve, or Select all, then Approve selected: the ones with risk flags are listed first, and one optional message goes on every approval. Each is approved on its own, as from its page, and you see what happened to each. Request changes and Reject are on each row.",
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
      "Type part of its name and pick it from the list: published items, yours, and others' in review. It starts on latest; pick another version if you need one. In a markdown file, type @ to do the same.",
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
      "Tick approved ones, or Select all approved, then Release selected: choose stable or pre-release, the bump and the tag once, and see every version before anything goes out. Dependencies go first, and the approved ones they need are added.",
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
    question: "Where do these numbers come from?",
    answer:
      "From rmk, on machines that report to this instance under root's usage policy: installs, removals and runs of this item, by day, version and AI tool. The success rate needs 20 runs whose outcome was reported.",
    href: docsHref("usage", "reading"),
  },
  "usage-minimum": {
    question: "Why set a minimum?",
    answer:
      "Item pages show usage as soon as any install or run is reported (0). With a minimum, an item shows its usage only from that many installs plus runs in 30 days, so a handful of events doesn't look like a trend and one team's habits don't show.",
    href: docsHref("usage", "reading"),
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
      "Everything a moderator can, plus manage users, create scopes, change the instance's settings, read the audit log and approve their own submissions. There can be several roots, and each can change any other root's role or account, but not their own.",
    href: docsHref("roles", "roles"),
  },
  "own-row": {
    question: "Why can't I change my own account here?",
    answer:
      "So nobody locks themselves out by mistake. Change your password in Account; another root can change your role, disable you or reset your password.",
    href: docsHref("install", "root"),
  },
} as const satisfies Record<string, { question: string; answer: string; href: string }>;

export type HelpId = keyof typeof HELP;

export const Help = ({ id, className }: { id: HelpId; className?: string }): ReactNode => {
  const help = HELP[id];
  return (
    <HelpTip question={help.question} href={help.href} className={className}>
      <p>{help.answer}</p>
    </HelpTip>
  );
};
