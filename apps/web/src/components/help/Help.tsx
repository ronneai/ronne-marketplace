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
      "Approve lets it be released. Request changes sends it back to its author to fix and resubmit. Reject closes it. Each needs a message except approve, and all are recorded.",
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
      "It lets rmk and the registry's MCP server read the registry as you: search, read items and download them. It can't sign in to this website, and you can revoke it here at any time.",
    href: docsHref("rmk", "tokens"),
  },
  install: {
    question: "How do I install it?",
    answer:
      "Copy the command into a terminal in your project, after rmk login. rmk resolves the version, checks the download, writes the files your AI tool reads, and records them in rmk.lock so teammates get the same.",
    href: docsHref("rmk", "installing"),
  },
  "claude-code": {
    question: "Where does this go in my AI tool?",
    answer:
      "rmk writes each type where the tool reads it. Claude Code: skills under .claude/skills/, agents under .claude/agents/, rules under .claude/rules/, hooks and permissions in .claude/settings.json, MCP servers in .mcp.json. Codex: skills and commands under .agents/skills/, agents under .codex/agents/, rules in AGENTS.md, hooks in .codex/hooks.json, MCP servers in .codex/config.toml. Settings entries are tracked, so your own edits stay.",
    href: docsHref("rmk", "tools"),
  },
  propose: {
    question: "What happens when I propose a change?",
    answer:
      "You get a draft of this version, with all its files, to edit and submit. Once reviewed and approved, it's released as the item's next version.",
    href: docsHref("changes", "propose"),
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
