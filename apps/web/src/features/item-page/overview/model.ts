import type { ItemType } from "@ronneai/core";

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
export const settingsOf = (manifest: Manifest, type: ItemType): SettingRow[] => {
  const block = blockOf(manifest, type);
  switch (type) {
    case "agent":
      return rows(["Tools", texts(block.tools)], ["Model", one(block.model)]);
    case "skill":
      return rows(["Entry file", [bodyPathOf(manifest, type) ?? "SKILL.md"]]);
    case "rule":
      return rows(["Activation", one(block.activation)], ["Globs", texts(block.globs)]);
    case "command":
      return rows([
        "Arguments",
        list(block.args).flatMap((arg) => {
          const name = text(arg.name);
          if (!name) return [];
          const description = text(arg.description);
          return [
            `${name}${arg.required === true ? "" : " (optional)"}${description ? `: ${description}` : ""}`,
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
        ["Event", one(block.event)],
        ["Matcher", matcher],
        ["Command", one(run.command)],
        ["Script", one(run.script)],
        ["Timeout", timeout ? [`${timeout} s`] : []],
      );
    }
    case "statusline":
      return rows(["Script", one(block.script)]);
    case "mcp-server":
      return rows(
        ["Transport", one(block.transport)],
        ["Command", one(block.command)],
        ["Arguments", texts(block.args)],
        ["URL", one(block.url)],
        [
          "Environment variables",
          list(block.env).flatMap((env) => {
            const name = text(env.name);
            if (!name) return [];
            const marks = [
              env.required === true ? "required" : null,
              env.secret === true ? "secret" : null,
            ].filter((mark) => mark !== null);
            return [marks.length > 0 ? `${name} (${marks.join(", ")})` : name];
          }),
        ],
        ["Headers", Object.keys(record(block.headers))],
      );
    case "permission-policy":
      return rows([
        "Rules",
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
        ["Command", one(block.command)],
        ["Arguments", texts(block.args)],
        [
          "Languages",
          list(block.languages).flatMap((language) => {
            const id = text(language.id);
            if (!id) return [];
            const extensions = texts(language.extensions);
            return [extensions.length > 0 ? `${id} (${extensions.join(", ")})` : id];
          }),
        ],
      );
    default:
      return [];
  }
};
