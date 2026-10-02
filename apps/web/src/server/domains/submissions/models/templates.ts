import type { ItemType } from "@ronneai/core";
import { MANIFEST_PATH } from "./submission";

export type TemplateFile = { path: string; content: string; executable?: boolean };

/** The comment and empty description every template starts with. */
const HEADER = `# ronne.yaml describes the item. The Form view edits it too, and keeps these comments.
`;
const DESCRIPTION = `# One or two sentences: what it does and when to use it. AI tools read this to choose items.
description: ""
`;

const manifest = (itemName: string, type: ItemType, block: string) =>
  `${HEADER}name: "${itemName}"\ntype: ${type}\n${DESCRIPTION}${block}`;

type Template = (itemName: string, name: string) => TemplateFile[];

/**
 * A starter for each type (feature 012): the manifest and the files it names, with comments that
 * explain the fields. Each passes 011's checks except for the empty description (and, for a skill,
 * SKILL.md's matching one), so the editor's first problem asks the author to write it.
 */
const TEMPLATES: Record<ItemType, Template> = {
  skill: (itemName, name) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "skill",
        `skill:
  # The Agent Skills file. Its frontmatter's name and description must match this manifest's.
  entry: SKILL.md
`,
      ),
    },
    {
      path: "SKILL.md",
      content: `---
name: ${name}
description: ""
---

# ${name}

Write the instructions the agent follows when it uses this skill. Put longer reference material in
other files next to this one and link to them.
`,
    },
  ],

  agent: (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "agent",
        `agent:
  # The file with the agent's system prompt.
  prompt: prompt.md
  # Optional: the tools it may use, such as [read, grep, glob, shell], and a model class
  # (default, fast or strong).
`,
      ),
    },
    {
      path: "prompt.md",
      content: `You are a specialised agent. Describe your role, how you work, and what you hand back.
`,
    },
  ],

  rule: (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "rule",
        `rule:
  body: rule.md
  # always: every conversation. glob: files matching globs (add a globs list).
  # model: the AI decides when it applies. manual: only when someone asks for it.
  activation: always
`,
      ),
    },
    {
      path: "rule.md",
      content: `Write the rule as short, direct instructions, one per line.
`,
    },
  ],

  command: (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "command",
        `command:
  # The prompt the command runs. Optional args are listed under args, each with a name.
  body: command.md
`,
      ),
    },
    {
      path: "command.md",
      content: `Describe what the AI should do when someone runs this command.
`,
    },
  ],

  hook: (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "hook",
        `hook:
  # When it runs, such as session.start, prompt.submit, tool.before or tool.after.
  event: tool.after
  # Optional: only for one tool, such as edit or shell.
  # matcher:
  #   tool: edit
  run:
    # A script in this item, or a command instead of script.
    script: hook.sh
  # Seconds before it's stopped (1 to 600).
  timeout: 30
`,
      ),
    },
    {
      path: "hook.sh",
      executable: true,
      content: `#!/bin/sh
# Gets the event as JSON on stdin. Exit 0 when all is well.
cat > /dev/null
`,
    },
  ],

  "mcp-server": (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "mcp-server",
        `mcp-server:
  # stdio starts a local program; http connects to a url (then use url and headers instead).
  transport: stdio
  command: npx
  args: ["-y", "your-mcp-server"]
  # Never write secrets here: declare them, and reference them as \${NAME} in args or headers.
  # env:
  #   - name: API_TOKEN
  #     description: What the token is for.
  #     required: true
  #     secret: true
`,
      ),
    },
  ],

  "permission-policy": (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "permission-policy",
        `permission-policy:
  # Checked in order. decision is allow, ask or deny.
  rules:
    - tool: shell
      pattern: "rm -rf*"
      decision: ask
`,
      ),
    },
  ],

  "output-style": (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "output-style",
        `output-style:
  body: style.md
`,
      ),
    },
    {
      path: "style.md",
      content: `Describe how answers should look: length, tone, and when to show code.
`,
    },
  ],

  statusline: (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "statusline",
        `statusline:
  # Prints one line. It gets the session's status as JSON on stdin.
  script: statusline.sh
`,
      ),
    },
    {
      path: "statusline.sh",
      executable: true,
      content: `#!/bin/sh
cat > /dev/null
printf '%s\\n' "$(basename "$PWD")"
`,
    },
  ],

  "lsp-server": (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "lsp-server",
        `lsp-server:
  # The language server to start. It must already be installed where the item is used.
  command: your-language-server
  args: ["--stdio"]
  languages:
    - id: your-language
      extensions: [".ext"]
`,
      ),
    },
  ],

  bundle: (itemName) => [
    {
      path: MANIFEST_PATH,
      content: manifest(
        itemName,
        "bundle",
        `# The items this bundle installs, each with a version range, such as
# "@scope/name": "^1.0.0".
dependencies: {}
`,
      ),
    },
  ],
};

/** The files a new draft of `type` starts with. */
export const draftTemplate = (type: ItemType, itemName: string): TemplateFile[] =>
  TEMPLATES[type](itemName, itemName.slice(itemName.indexOf("/") + 1));

/**
 * The files New item starts a type with: ronne.yaml and the file it names, such as SKILL.md or
 * prompt.md. They're the item, so the editor never deletes or renames them (owner, 2026-10-01);
 * their contents are edited as usual.
 */
export const startingFiles = (type: ItemType): string[] =>
  (TEMPLATES[type]?.("@scope/name", "name") ?? []).map((file) => file.path);
