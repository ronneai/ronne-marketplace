import type { Manifest } from "../../manifest.js";
import { secretLike } from "../../package-checks.js";
import { fitDescription, toItemName } from "../text.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";
import { checkedName, result } from "./shared.js";

/**
 * A Claude Code MCP server (`mcpServers.<n>` in `.mcp.json` or `~/.claude.json`) as an item
 * (native-readers.md §8). This is where tokens live, so the reader is strict: no value of `env` is
 * ever put in the item, a literal credential in a header, an argument or the address is replaced
 * by a `${VAR}` the item declares, and a value it can't clean stops the item.
 */

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const KEPT = ["type", "command", "args", "env", "url", "headers"];
/** Names that say a variable or a header carries a credential. */
const CREDENTIAL_NAME = /auth|token|key|secret|passw|credential|cookie|session|\bpat\b|_pat$/i;
/** A token run: where a credential starts and ends inside a longer value. */
const TOKEN_RUN = /[A-Za-z0-9_.+-]{8,}/g;

export const mcpServerName = (key: string): string => toItemName(key);

type Taken = { name: string; where: string };

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `${VAR:-default}` as `${VAR}`: the default isn't uploaded, since it may be a literal credential.
 * A loop with indexOf, not a regex: a pattern for this runs in quadratic time on crafted input
 * (docs/knowledge/codeql-regex.md).
 */
const withoutDefaults = (value: string, where: string, warnings: ReadWarning[]) => {
  let out = "";
  let from = 0;
  for (;;) {
    const start = value.indexOf("${", from);
    if (start === -1) break;
    const close = value.indexOf("}", start + 2);
    if (close === -1) break;
    const inner = value.slice(start + 2, close);
    const colon = inner.indexOf(":-");
    const name = colon === -1 ? "" : inner.slice(0, colon);
    if (!VAR_NAME.test(name)) {
      out += value.slice(from, start + 2);
      from = start + 2;
      continue;
    }
    warnings.push({
      code: "field_dropped",
      message: `The default in \${${name}:-…} (${where}) was left out: it may be a literal credential. The installed item needs ${name} set.`,
    });
    out += `${value.slice(from, start)}\${${name}}`;
    from = close + 1;
  }
  return out + value.slice(from);
};

export const readMcpServer = (
  key: string,
  value: unknown,
  options: {
    itemName: string;
    description?: string;
    /** How the source names the server, for warnings: `mcpServers.<key>` by default. */
    where?: string;
  },
): ReadResult => {
  const { name: short } = checkedName(options.itemName);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReadError("manifest_invalid", `The MCP server ${key} isn't an object.`);
  const config = value as Record<string, unknown>;
  const where = options.where ?? `mcpServers.${key}`;
  const warnings: ReadWarning[] = [];

  const type = config.type ?? "stdio";
  const transport =
    type === "stdio" ? "stdio" : type === "http" || type === "streamable-http" ? "http" : null;
  if (!transport)
    throw new ReadError(
      "unsupported_transport",
      `${key} uses the ${String(type)} transport, which Ronne's MCP servers don't have (only stdio and http).`,
    );

  // A valid item name is a-z, 0-9 and inner hyphens; a variable can't start with a digit.
  const upper = short.toUpperCase().replace(/-/g, "_");
  const prefix = /^[0-9]/.test(upper) ? `MCP_${upper}` : upper;
  const env = new Map<string, { secret: boolean }>();
  const taken: Taken[] = [];
  const newVariable = (from: string) => {
    let name = `${prefix}_TOKEN`;
    for (let n = 2; env.has(name) || taken.some((t) => t.name === name); n += 1)
      name = `${prefix}_TOKEN_${n}`;
    taken.push({ name, where: from });
    return name;
  };

  /**
   * A value with every credential it can find replaced by a new `${VAR}`: whole when the name says
   * it's a credential (keeping a scheme such as `Bearer`), else each token run that looks like one.
   */
  const cleaned = (raw: string, from: string, credentialName: boolean): string => {
    let text = withoutDefaults(raw, from, warnings);
    const literal = text.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, "").trim();
    if (credentialName && literal) {
      const scheme = /^(Bearer|Basic|Token|token|bearer)\s+(\S+)$/.exec(text);
      if (scheme && !/\$\{/.test(scheme[2] ?? "")) text = `${scheme[1]} \${${newVariable(from)}}`;
      else if (!/\$\{/.test(text)) text = `\${${newVariable(from)}}`;
    }
    text = text.replace(TOKEN_RUN, (run) => (secretLike(run) ? `\${${newVariable(from)}}` : run));
    if (secretLike(text))
      throw new ReadError(
        "secret",
        `${from} holds what looks like a credential that can't be told apart from the text around it. Move it into an environment variable, reference it as \${NAME}, and export again.`,
      );
    return text;
  };

  // env: the names only. A value is read here, on the machine, only to tell whether it's secret.
  const rawEnv = config.env && typeof config.env === "object" ? config.env : {};
  for (const [name, envValue] of Object.entries(rawEnv as Record<string, unknown>)) {
    if (!ENV_NAME.test(name)) {
      warnings.push({
        code: "field_dropped",
        message: `The variable ${name} was left out: a variable's name is capital letters, digits and _.`,
      });
      continue;
    }
    const text = typeof envValue === "string" ? envValue : "";
    const reference = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}$/.exec(text)?.[1];
    if (reference && reference !== name)
      warnings.push({
        code: "field_dropped",
        message: `${name} takes its value from ${reference} here; installed from Ronne, the item expects ${name} itself to be set.`,
      });
    env.set(name, {
      secret:
        CREDENTIAL_NAME.test(name) || (!reference && text !== "" && secretLike(text) !== null),
    });
  }

  const block: Record<string, unknown> = { transport };
  if (transport === "stdio") {
    if (typeof config.command !== "string" || !config.command)
      throw new ReadError("manifest_invalid", `The MCP server ${key} has no command.`);
    block.command = cleaned(config.command, `${where}.command`, false);
    if (Array.isArray(config.args))
      block.args = config.args.map((arg, i) => cleaned(String(arg), `${where}.args[${i}]`, false));
  } else {
    if (typeof config.url !== "string" || !config.url)
      throw new ReadError("manifest_invalid", `The MCP server ${key} has no url.`);
    block.url = cleaned(config.url, `${where}.url`, false);
    if (config.headers && typeof config.headers === "object") {
      const headers: Record<string, string> = {};
      for (const [header, headerValue] of Object.entries(config.headers as Record<string, unknown>))
        headers[header] = cleaned(
          String(headerValue),
          `${where}.headers.${header}`,
          CREDENTIAL_NAME.test(header),
        );
      block.headers = headers;
    }
  }

  for (const { name, where: from } of taken) {
    env.set(name, { secret: true });
    warnings.push({
      code: "secret_replaced",
      message: `A credential in ${from} was taken out and replaced by \${${name}}; the item declares ${name}, and whoever installs it sets it. The value isn't uploaded.`,
    });
  }
  if (env.size > 0)
    block.env = [...env].map(([name, { secret }]) => ({
      name,
      required: true,
      ...(secret ? { secret: true } : {}),
    }));

  for (const dropped of Object.keys(config).filter((k) => !KEPT.includes(k)))
    warnings.push({
      code: "field_dropped",
      message: `${where}'s \`${dropped}\` was left out: an MCP server in Ronne has no such setting.`,
    });

  const manifest: Manifest = { name: options.itemName, type: "mcp-server" };
  if (options.description?.trim()) {
    const fitted = fitDescription(options.description);
    manifest.description = fitted.text;
    if (fitted.cut)
      warnings.push({
        code: "description_cut",
        message: "The description is longer than 300 characters, so it was cut short.",
        file: "ronne.yaml",
      });
  }
  manifest["mcp-server"] = block;
  // An MCP server has no description on disk: one is only ever given (040, 053).
  return result(manifest, [], warnings, [], "given");
};
