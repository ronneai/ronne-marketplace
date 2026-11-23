import { record, section } from "../render/helpers.js";
import type { Change } from "../render/types.js";
import { jsonFile, moved, type Part, type Placement, type PluginAdapter } from "./adapter.js";

/**
 * Gemini CLI extensions (029, checked 2026-11-22 against geminicli.com/docs extensions reference and
 * the CLI 0.70.0's source): `gemini-extension.json` with `name` (lowercase and `-`), `version`,
 * `description` and `mcpServers`; `commands/`, `skills/`, `agents/`, `hooks/hooks.json` (the
 * settings file's `hooks` shape, its strings filled in with `${extensionPath}`), and `GEMINI.md`,
 * which Gemini CLI reads as the extension's context by default, with the rules' sections. Permission
 * policies stay out: the renderer writes them in the home folder only.
 */
const FOLDERS: [string, string][] = [
  [".agents/skills/", "skills/"],
  [".gemini/commands/", "commands/"],
  [".gemini/agents/", "agents/"],
  [".gemini/hooks/", "hooks/"],
];

/** A hook script's path as the renderer runs it at project scope, and as an extension does. */
const SCRIPT_FROM = "$GEMINI_PROJECT_DIR/";
const SCRIPT_TO = '"${extensionPath}"/';

/** A hook command run from the extension instead of the project's `.gemini/`. */
const fromExtension = (command: string): string => {
  if (!command.startsWith(SCRIPT_FROM)) return command;
  const rest = command.slice(SCRIPT_FROM.length);
  if (rest.startsWith(".gemini/hooks/"))
    return `${SCRIPT_TO}hooks/${rest.slice(".gemini/hooks/".length)}`;
  if (rest.startsWith("'.gemini/hooks/"))
    return `${SCRIPT_TO}'hooks/${rest.slice("'.gemini/hooks/".length)}`;
  return command;
};

/** `scope.name` as Gemini CLI takes an extension's name: `scope-name`. */
export const geminiExtensionName = (name: string) => name.replaceAll(".", "-");

const place = (change: Change): Placement => {
  if (change.kind === "section" && change.path === "GEMINI.md")
    return [{ kind: "section", path: "GEMINI.md", key: change.key, text: change.text }];
  const files = moved(change, FOLDERS);
  if (files) return files;
  if (change.kind === "json-array-item" && change.path === ".gemini/settings.json") {
    const [hooks, event] = change.key;
    if (hooks === "hooks" && event) {
      const item = record(change.item);
      const handlers = Array.isArray(item.hooks) ? item.hooks : [];
      const entry = {
        ...item,
        hooks: handlers.map((hook) => {
          const handler = record(hook);
          return typeof handler.command === "string"
            ? { ...handler, command: fromExtension(handler.command) }
            : handler;
        }),
      };
      return [{ kind: "hook", event, entry } as Part];
    }
  }
  if (
    change.kind === "json-key" &&
    change.path === ".gemini/settings.json" &&
    change.key[0] === "mcpServers" &&
    change.key[1]
  )
    return [{ kind: "mcp", name: change.key[1], server: change.value }];
  return { leftOut: `Gemini CLI extensions have no place for ${change.path}` };
};

export const geminiAdapter: PluginAdapter = {
  tool: "gemini",
  toolName: "Gemini CLI",
  place,
  manifest: (item, name, mcp) =>
    jsonFile("gemini-extension.json", {
      name: geminiExtensionName(name),
      version: item.version,
      description: String(item.manifest.description ?? ""),
      ...(mcp && Object.keys(mcp).length ? { mcpServers: mcp } : {}),
    }),
  mcpInManifest: true,
  hooksFile: (hooks) => jsonFile("hooks/hooks.json", { hooks }),
  mcpFile: (servers) => jsonFile("gemini-extension.json", { mcpServers: servers }),
  sectionFile: (path, sections) => ({
    path,
    bytes: new TextEncoder().encode(sections.map((s) => section(s.key, s.text)).join("\n")),
  }),
};
