import type { ItemType, RiskFlagKind } from "@ronneai/core";
import type { useTranslations } from "next-intl";

/**
 * The words of this file, as a translator for `item.overview.model` (feature 130): the functions
 * below take it and return text in the person's language, so a component passes its own
 * `useTranslations("item.overview.model")` and a test passes one for the language it checks.
 */
export type Say = ReturnType<typeof useTranslations<"item.overview.model">>;

/** One labelled row of an item's settings on its Overview (044): each value shows on its own line. */
export type SettingRow = { label: string; values: string[] };

type Manifest = Readonly<Record<string, unknown>>;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== ""
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : null;

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((entry) => text(entry) ?? []) : [];

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];

/** The type's settings block, `agent:` for an agent. A bundle has none. */
const blockOf = (manifest: Manifest, type: ItemType) => record(manifest[type]);

/**
 * The file that holds what the item is (manifest spec §2): a skill's entry, an agent's prompt, a
 * rule's, command's or output style's body, a hook's or status line's script. Null for the types
 * whose settings are the whole item, and for a hook that runs an inline command.
 */
export const bodyPathOf = (manifest: Manifest, type: ItemType): string | null => {
  const block = blockOf(manifest, type);
  switch (type) {
    case "skill":
      return text(block.entry) ?? "SKILL.md";
    case "agent":
      return text(block.prompt);
    case "rule":
    case "command":
    case "output-style":
      return text(block.body);
    case "hook":
      return text(record(block.run).script);
    case "statusline":
      return text(block.script);
    default:
      return null;
  }
};

/** Rows without a value are left out, so a type shows only what its manifest sets. */
const rows = (...candidates: [string, string[]][]): SettingRow[] =>
  candidates.flatMap(([label, values]) => (values.length > 0 ? [{ label, values }] : []));

const one = (value: unknown): string[] => {
  const found = text(value);
  return found === null ? [] : [found];
};

/**
 * What the manifest's type block sets, as labelled rows (044's table). Nothing here is a secret:
 * MCP servers list their environment variables' and headers' names only, and the full ronne.yaml
 * is one click away in Files.
 */
export const settingsOf = (manifest: Manifest, type: ItemType, say: Say): SettingRow[] => {
  const block = blockOf(manifest, type);
  switch (type) {
    case "agent":
      return rows([say("label.tools"), texts(block.tools)], [say("label.model"), one(block.model)]);
    case "skill":
      return rows([say("label.entryFile"), [bodyPathOf(manifest, type) ?? "SKILL.md"]]);
    case "rule":
      return rows(
        [say("label.activation"), one(block.activation)],
        [say("label.globs"), texts(block.globs)],
      );
    case "command":
      return rows([
        say("label.arguments"),
        list(block.args).flatMap((arg) => {
          const name = text(arg.name);
          if (!name) return [];
          const description = text(arg.description);
          return [
            say("argument", {
              name,
              optional: String(arg.required !== true),
              hasDescription: String(Boolean(description)),
              description: description ?? "",
            }),
          ];
        }),
      ]);
    case "hook": {
      const run = record(block.run);
      const matcher = Object.entries(record(block.matcher)).flatMap(([key, value]) => {
        const shown = text(value);
        return shown ? [`${key}: ${shown}`] : [];
      });
      const timeout = text(block.timeout);
      return rows(
        [say("label.event"), one(block.event)],
        [say("label.matcher"), matcher],
        [say("label.command"), one(run.command)],
        [say("label.script"), one(run.script)],
        [say("label.timeout"), timeout ? [`${timeout} s`] : []],
      );
    }
    case "statusline":
      return rows([say("label.script"), one(block.script)]);
    case "mcp-server":
      return rows(
        [say("label.transport"), one(block.transport)],
        [say("label.command"), one(block.command)],
        [say("label.arguments"), texts(block.args)],
        [say("label.url"), one(block.url)],
        [
          say("label.env"),
          list(block.env).flatMap((env) => {
            const name = text(env.name);
            if (!name) return [];
            const marks = [
              env.required === true ? say("required") : null,
              env.secret === true ? say("secret") : null,
            ].filter((mark) => mark !== null);
            return [marks.length > 0 ? say("envMarks", { name, marks: marks.join(", ") }) : name];
          }),
        ],
        [say("label.headers"), Object.keys(record(block.headers))],
      );
    case "permission-policy":
      return rows([
        say("label.rules"),
        list(block.rules).flatMap((rule) => {
          const decision = text(rule.decision);
          const tool = text(rule.tool);
          if (!decision || !tool) return [];
          const pattern = text(rule.pattern);
          return [`${decision}: ${tool}${pattern ? ` ${pattern}` : ""}`];
        }),
      ]);
    case "lsp-server":
      return rows(
        [say("label.command"), one(block.command)],
        [say("label.arguments"), texts(block.args)],
        [
          say("label.languages"),
          list(block.languages).flatMap((language) => {
            const id = text(language.id);
            if (!id) return [];
            const extensions = texts(language.extensions);
            return [
              extensions.length > 0
                ? say("withDetail", { name: id, detail: extensions.join(", ") })
                : id,
            ];
          }),
        ],
      );
    default:
      return [];
  }
};

/** One rule of a permission policy, for the Overview's table (044). */
export type PolicyRule = { decision: string; tool: string; pattern: string | null };

/** A permission policy's rules, in order; rules without a decision or a tool are left out. */
export const policyRulesOf = (manifest: Manifest): PolicyRule[] =>
  list(record(manifest["permission-policy"]).rules).flatMap((rule) => {
    const decision = text(rule.decision);
    const tool = text(rule.tool);
    return decision && tool ? [{ decision, tool, pattern: text(rule.pattern) }] : [];
  });

/** What the risk flags (014) say, once per kind, in the order they first appear. */
export const riskLabelsOf = (flags: readonly { kind: RiskFlagKind }[], say: Say): string[] => [
  ...new Set(flags.map((flag) => say(`risk.${flag.kind}`))),
];

const BODY_ROLES = [
  "agent",
  "skill",
  "rule",
  "command",
  "output-style",
  "hook",
  "statusline",
] as const satisfies readonly ItemType[];

/** What the main file is for, as the Overview's card names it (045). */
export const bodyRoleOf = (type: ItemType, say: Say): string | null => {
  const role = BODY_ROLES.find((candidate) => candidate === type);
  return role ? say(`role.${role}`) : null;
};

/**
 * The limits an item's own manifest sets (045), as sentences with `code` in backticks: an agent's
 * tool list, a rule's activation, a hook's matcher, a permission policy's `deny` and `ask` rules.
 */
export const guardrailsOf = (manifest: Manifest, type: ItemType, say: Say): string[] => {
  const block = blockOf(manifest, type);
  switch (type) {
    case "agent": {
      const tools = texts(block.tools);
      return tools.length > 0
        ? [say("guard.tools", { tools: tools.map((tool) => `\`${tool}\``).join(", ") })]
        : [];
    }
    case "rule": {
      const globs = texts(block.globs);
      if (block.activation === "glob" && globs.length > 0)
        return [say("guard.globs", { globs: globs.map((g) => `\`${g}\``).join(", ") })];
      if (block.activation === "manual") return [say("guard.manual")];
      return [];
    }
    case "hook": {
      const tool = text(record(block.matcher).tool);
      return tool ? [say("guard.hookTool", { tool })] : [];
    }
    case "permission-policy":
      return policyRulesOf(manifest).flatMap((rule) => {
        const what = `\`${rule.tool}${rule.pattern ? ` ${rule.pattern}` : ""}\``;
        return rule.decision === "deny"
          ? [say("guard.blocks", { what })]
          : rule.decision === "ask"
            ? [say("guard.asks", { what })]
            : [];
      });
    default:
      return [];
  }
};
