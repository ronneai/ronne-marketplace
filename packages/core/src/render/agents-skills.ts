import {
  type Frontmatter,
  fileText,
  frontmatterMarkdown,
  record,
  trimTrailingNewlines,
} from "./helpers.js";
import { agentsSkillEntry } from "./skill-frontmatter.js";
import type { Change, RenderInput, RenderWarning } from "./types.js";

/**
 * The cross-tool skills folder, `.agents/skills/<n>/` (024, 025): Codex and Cursor both read it, so
 * their renderers write it through these helpers, byte for byte the same, and `rmk` records one
 * entry with both targets. The same path in both scopes, relative to the project or the home folder.
 */
export const AGENTS_SKILLS = ".agents/skills";

/**
 * A `skill` item's folder as it is, with its entry file renamed to `SKILL.md` and without the
 * `agent` and `context` keys Codex and Cursor don't read (097), saying so when there were some.
 */
export const skillFolder = (
  item: RenderInput,
  n: string,
  entry: string,
): { changes: Change[]; warnings: RenderWarning[] } => {
  let dropped = false;
  const change: Change = {
    kind: "dir",
    path: `${AGENTS_SKILLS}/${n}`,
    files: item.files.map((file) => {
      if (file.path !== entry)
        return { path: file.path, content: file.bytes, executable: file.executable };
      const kept = agentsSkillEntry(file.bytes);
      dropped = kept.dropped;
      return { path: "SKILL.md", content: kept.bytes, executable: file.executable };
    }),
  };
  return {
    changes: [change],
    warnings: dropped
      ? [
          {
            code: "unsupported_field",
            message: `${item.name} names the agent that runs it; Codex and Cursor don't choose an agent for a skill, so it runs in the current one.`,
          },
        ]
      : [],
  };
};

/** A skill written from another type, such as a rule or a command. */
export const writtenSkill = (
  item: RenderInput,
  n: string,
  front: Frontmatter,
  body: string,
): Change => ({
  kind: "dir",
  path: `${AGENTS_SKILLS}/${n}`,
  files: [{ path: "SKILL.md", content: frontmatterMarkdown(item, [["name", n], ...front], body) }],
});

/**
 * A command as a skill people run as `/<n>`. Neither tool passes arguments to skills, so `{{name}}`
 * placeholders stay as written and a note after the body tells the model what each one is.
 */
export const commandSkill = (
  item: RenderInput,
  n: string,
  block: Record<string, unknown>,
): { change: Change; warnings: RenderWarning[] } => {
  const args = (Array.isArray(block.args) ? block.args : []).map(record);
  let body = trimTrailingNewlines(fileText(item.files, block.body));
  if (args.length)
    body += `\n\n## Arguments\n\nWhere this text says \`{{name}}\`, use what the person gave with the command, or ask them:\n\n${args
      .map(
        (arg) =>
          `- \`${String(arg.name ?? "")}\`${arg.required ? "" : " (optional)"}${
            typeof arg.description === "string" ? `: ${arg.description}` : ""
          }`,
      )
      .join("\n")}\n`;
  return {
    change: writtenSkill(
      item,
      n,
      [
        ["description", String(item.manifest.description ?? "")],
        ["disable-model-invocation", true],
      ],
      body,
    ),
    warnings: args.length
      ? [
          {
            code: "unsupported_field",
            message: `Skills don't take arguments, so ${item.name}'s placeholders stay in its text, with a note saying what each one is.`,
          },
        ]
      : [],
  };
};
