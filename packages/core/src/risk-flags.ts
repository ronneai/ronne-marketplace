import type { Manifest } from "./manifest.js";
import type { PackageFile } from "./package-file.js";

export type RiskFlagKind =
  | "hook"
  | "mcp_server"
  | "permission_policy"
  | "status_or_lsp"
  | "executable"
  | "shell_script"
  | "network";

/** Something an item can do on a developer's machine, with where it's said (feature 014). */
export type RiskFlag = {
  kind: RiskFlagKind;
  /** One plain sentence; `backticked` parts are code. */
  message: string;
  file?: string;
  line?: number;
  /** A permission policy rule that allows something: it widens what the agent may do. */
  widening?: boolean;
};

const MANIFEST = "ronne.yaml";
const decoder = new TextDecoder("utf-8", { fatal: true });

const textOf = (file: PackageFile | undefined): string | null => {
  if (!file) return null;
  try {
    return decoder.decode(file.bytes);
  } catch {
    return null;
  }
};

/** The first line of `text` that contains `needle`, 1-based. */
const lineOf = (text: string | null, needle: string): number | undefined => {
  if (!text || !needle) return undefined;
  const index = text.split(/\r?\n/).findIndex((line) => line.includes(needle));
  return index === -1 ? undefined : index + 1;
};

const block = (manifest: Manifest, key: string): Record<string, unknown> => {
  const value = manifest[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const commandLine = (command: string, args: unknown) => [command, ...strings(args)].join(" ");

const SHELL_EXTENSIONS = /\.(sh|bash|zsh)$/i;
const SHELL_SHEBANG = /^#!.*\b(ba|z)?sh\b/;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>)\]}]+/g;

/**
 * What an item can do on a developer's machine (MVP §12), from its manifest and files: hooks, MCP
 * servers, permission policies, status lines and language servers, executable files, shell scripts
 * and network addresses. Flags describe; they never block, and authors can't set them. The review
 * page (014), the catalogue (018) and `rmk info` show the same list.
 */
export const riskFlags = (manifest: Manifest, files: readonly PackageFile[]): RiskFlag[] => {
  const flags: RiskFlag[] = [];
  const manifestText = textOf(files.find((file) => file.path === MANIFEST));
  const at = (needle: string | undefined) =>
    needle ? { file: MANIFEST, line: lineOf(manifestText, needle) } : { file: MANIFEST };
  const type = manifest.type;

  if (type === "hook") {
    const hook = block(manifest, "hook");
    const run = (hook.run ?? {}) as Record<string, unknown>;
    const event = str(hook.event) ?? "an event";
    const tool = str((hook.matcher as Record<string, unknown> | undefined)?.tool);
    const on = `\`${event}\`${tool ? ` for \`${tool}\`` : ""}`;
    const command = str(run.command);
    const script = str(run.script);
    flags.push({
      kind: "hook",
      message: command
        ? `The hook runs \`${command}\` on ${on}.`
        : `The hook runs the script \`${script ?? "?"}\` on ${on}.`,
      ...at(command ?? script),
    });
  }

  if (type === "mcp-server") {
    const server = block(manifest, "mcp-server");
    const command = str(server.command);
    const url = str(server.url);
    flags.push({
      kind: "mcp_server",
      message:
        server.transport === "http" || (!command && url)
          ? `The MCP server connects to \`${url ?? "?"}\`.`
          : `The MCP server starts \`${commandLine(command ?? "?", server.args)}\`.`,
      ...at(command ?? url),
    });
  }

  if (type === "permission-policy") {
    const rules = block(manifest, "permission-policy").rules;
    const list = Array.isArray(rules) ? (rules as Record<string, unknown>[]) : [];
    // Rules that allow come first: they widen what the agent may do.
    const ordered = [
      ...list.filter((rule) => rule.decision === "allow"),
      ...list.filter((rule) => rule.decision !== "allow"),
    ];
    for (const rule of ordered) {
      const tool = str(rule.tool) ?? "?";
      const pattern = str(rule.pattern);
      const what = `\`${tool}\`${pattern ? ` \`${pattern}\`` : ""}`;
      const decision = str(rule.decision) ?? "?";
      flags.push({
        kind: "permission_policy",
        message:
          decision === "allow"
            ? `The policy allows ${what} without asking.`
            : `The policy ${decision === "deny" ? "denies" : "asks before"} ${what}.`,
        widening: decision === "allow",
        ...at(pattern ?? tool),
      });
    }
  }

  if (type === "statusline") {
    const script = str(block(manifest, "statusline").script);
    flags.push({
      kind: "status_or_lsp",
      message: `The status line runs the script \`${script ?? "?"}\`.`,
      ...at(script),
    });
  }

  if (type === "lsp-server") {
    const server = block(manifest, "lsp-server");
    const command = str(server.command);
    flags.push({
      kind: "status_or_lsp",
      message: `The language server starts \`${commandLine(command ?? "?", server.args)}\`.`,
      ...at(command),
    });
  }

  const hosts = new Map<string, { file: string; line: number }>();
  for (const file of files) {
    const text = textOf(file);
    const shell = SHELL_EXTENSIONS.test(file.path) || (text !== null && SHELL_SHEBANG.test(text));
    if (file.executable)
      flags.push({
        kind: "executable",
        message: `\`${file.path}\` is ${shell ? "an executable shell script" : "executable"}.`,
        file: file.path,
      });
    else if (shell)
      flags.push({
        kind: "shell_script",
        message: `\`${file.path}\` is a shell script.`,
        file: file.path,
      });
    if (text === null) continue;
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries())
      for (const match of line.matchAll(URL_PATTERN)) {
        let host: string;
        try {
          host = new URL(match[0]).host;
        } catch {
          continue;
        }
        if (host && !hosts.has(host)) hosts.set(host, { file: file.path, line: index + 1 });
      }
  }
  for (const [host, where] of hosts)
    flags.push({ kind: "network", message: `It mentions \`${host}\`.`, ...where });

  return flags;
};
