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

/** The last words of a flag that say its value is a credential (`--password`, `--api-key`). */
const CREDENTIAL_FLAG_WORDS = new Set([
  "password",
  "passwd",
  "pass",
  "passphrase",
  "token",
  "secret",
  "apikey",
  "accesskey",
  "privatekey",
  "secretkey",
  "credential",
  "credentials",
  "authtoken",
  "auth",
  "bearer",
  "pw",
  "pat",
]);

/**
 * Whether a command-line flag takes a credential: `--password`, `--api-key`, `-token`. Split on
 * `-` and `_`, not matched with a pattern that could backtrack (docs/knowledge/codeql-regex.md).
 */
const credentialFlag = (flag: string): boolean => {
  if (!flag.startsWith("-")) return false;
  // `--no-password` turns something off; it takes no value.
  if (flag.toLowerCase().startsWith("--no-")) return false;
  let start = 0;
  while (flag[start] === "-") start += 1;
  const words = flag.slice(start).toLowerCase().split(/[-_]/);
  const last = words.at(-1) ?? "";
  return CREDENTIAL_FLAG_WORDS.has(last) || CREDENTIAL_FLAG_WORDS.has(words.slice(-2).join(""));
};

/** Flags whose next argument is a header (`--header "Name: value"`, curl's `-H`). */
const HEADER_FLAGS = new Set(["--header", "--headers", "-H"]);

/**
 * Whether a name's last word, or last two, name a credential: split at `-`, `_`, `.` and camel case
 * (`apiKey`), with no backtracking pattern (029).
 */
const credentialWords = (name: string): boolean => {
  const words: string[] = [];
  let word = "";
  for (const char of name) {
    const upper = char >= "A" && char <= "Z";
    const last = word.at(-1) ?? "";
    if (char === "-" || char === "_" || char === ".") {
      if (word) words.push(word);
      word = "";
    } else if (upper && last >= "a" && last <= "z") {
      words.push(word);
      word = char;
    } else word += char;
  }
  if (word) words.push(word);
  const last = (words.at(-1) ?? "").toLowerCase();
  const lastTwo = words.slice(-2).join("").toLowerCase();
  return (
    CREDENTIAL_FLAG_WORDS.has(last) ||
    CREDENTIAL_FLAG_WORDS.has(lastTwo) ||
    last === "authorization" ||
    last === "cookie"
  );
};

/** A literal run that reads as a password beside a reference: letters and digits, 12 or more. */
const mixedSecret = (run: string) => run.length >= 12 && /[A-Za-z]/.test(run) && /[0-9]/.test(run);

type Taken = { name: string; where: string };

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A value that is one variable reference and nothing else. */
const REFERENCE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

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
  // Names handed out so far, and the next suffix to try: a set and a counter, so naming many
  // variables stays linear (029).
  const takenNames = new Set<string>();
  let suffix = 1;
  const newVariable = (from: string) => {
    let name = suffix === 1 ? `${prefix}_TOKEN` : `${prefix}_TOKEN_${suffix}`;
    while (env.has(name) || takenNames.has(name)) {
      suffix += 1;
      name = `${prefix}_TOKEN_${suffix}`;
    }
    suffix += 1;
    takenNames.add(name);
    taken.push({ name, where: from });
    return name;
  };

  /**
   * A value with every credential it can find replaced by a new `${VAR}`: whole when the name says
   * it's a credential (keeping a scheme such as `Bearer`), else each token run that looks like one.
   */
  const cleaned = (raw: string, from: string, credentialName: boolean, mixed = false): string => {
    let text = withoutDefaults(raw, from, warnings);
    const literal = text.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, "").trim();
    // A credential's value is a reference, alone or after a scheme (`Bearer ${TOKEN}`). Anything
    // else holds a literal, even beside a reference (`s3cret${X}`), so it's replaced whole (029).
    if (credentialName && literal) {
      const scheme = /^(Bearer|Basic|Token|token|bearer)\s+(\S+)$/.exec(text);
      if (scheme) {
        if (!REFERENCE.test(scheme[2] ?? "")) text = `${scheme[1]} \${${newVariable(from)}}`;
      } else text = `\${${newVariable(from)}}`;
    }
    // A literal that reads as a password beside a reference (`hunter2hunter2${X}`) in a header or
    // an argument is taken out too, though it's too short to look random (029).
    const beside = mixed && text.includes("${");
    text = text.replace(TOKEN_RUN, (run: string, offset: number, whole: string) => {
      // A variable's own name, inside `${…}`, is never a literal.
      const named = whole.slice(Math.max(0, offset - 2), offset) === "${";
      return secretLike(run) || (beside && !named && mixedSecret(run))
        ? `\${${newVariable(from)}}`
        : run;
    });
    if (secretLike(text))
      throw new ReadError(
        "secret",
        `${from} holds what looks like a credential that can't be told apart from the text around it. Move it into an environment variable, reference it as \${NAME}, and export again.`,
      );
    return text;
  };

  /**
   * A header's value: a credential header's by the whole-value rule, whatever it holds; another
   * header's that is an address (`Referer: https://user:pass@host`) by the address rules; the rest
   * by the header rules (029).
   */
  const headerValue = (value: string, from: string, credential: boolean): string =>
    !credential && (value.includes("://") || value.startsWith("//"))
      ? cleanedUrls(value, from)
      : cleaned(value, from, credential, true);

  /** Each address in a value that holds several (`https://a/x,https://user:pass@h/y`). */
  const cleanedUrls = (value: string, from: string): string => {
    if (value.indexOf("//") === value.lastIndexOf("//")) return cleanedUrl(value, from);
    return value
      .split(/([,;|\s]+)/)
      .map((part) =>
        part.includes("://") || part.startsWith("//") ? cleanedUrl(part, from) : part,
      )
      .join("");
  };

  /**
   * `NAME=value` where NAME is one word whose last part names a credential (`API_KEY`, `apiKey`,
   * `X-Api-Key`, `_TOKEN`, `db.password`, `STRIPE_KEY`), or null; `author=jane` and `sort_key=name`
   * aren't.
   */
  const variablePair = (text: string): string | null => {
    const eq = text.indexOf("=");
    if (eq <= 0) return null;
    const name = text.slice(0, eq);
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) return null;
    // An environment-style `…_KEY` is a key (`STRIPE_KEY`); a lowercase `sort_key` isn't.
    return credentialWords(name) || (ENV_NAME.test(name) && name.endsWith("_KEY")) ? name : null;
  };

  /**
   * `Name: value` as a header, cleaned by the header rules with its spacing kept, or null when it
   * isn't one. It is one after `--header` or `-H` (`flagged`); with no such flag, only when its
   * name reads as a credential header (`Authorization`, `X-Api-Key`, `Cookie`), so `localhost:5432`
   * and `author:jane` aren't (029).
   */
  const isHeaderArg = (text: string, flagged: boolean): boolean => {
    const colon = text.indexOf(":");
    if (colon <= 0) return false;
    const name = text.slice(0, colon);
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return false;
    const headerLike = name.includes("-") || /^(authorization|cookie)$/i.test(name);
    return flagged || (CREDENTIAL_NAME.test(name) && headerLike);
  };
  const headerArg = (text: string, from: string, flagged: boolean): string | null => {
    if (!isHeaderArg(text, flagged)) return null;
    const colon = text.indexOf(":");
    const credential = CREDENTIAL_NAME.test(text.slice(0, colon));
    const value = text.slice(colon + 1);
    const space = value.length - value.trimStart().length;
    const trimmed = value.trim();
    const kept = headerValue(trimmed, from, credential);
    return `${text.slice(0, colon + 1 + space)}${kept}`;
  };

  /** A value given to a credential flag: kept when it's a reference, replaced otherwise. */
  const flagValue = (value: string, from: string) =>
    REFERENCE.test(value) ? value : `\${${newVariable(from)}}`;

  /**
   * Arguments, each through `cleaned`, after a credential flag's value is taken out:
   * `--password=hunter2` and `--token hunter2` both become a declared variable (029).
   */
  const cleanedArgs = (args: unknown[]): string[] => {
    const out = args.map(String);
    const done = new Set<number>();
    for (let i = 0; i < out.length; i++) {
      const arg = out[i] ?? "";
      const from = `${where}.args[${i}]`;
      const equals = arg.indexOf("=");
      const flag = equals > 0 && arg.startsWith("-") ? arg.slice(0, equals) : "";
      const value = flag ? arg.slice(equals + 1) : arg;
      const afterHeaderFlag = HEADER_FLAGS.has(out[i - 1] ?? "");
      // Each branch cleans once: cleaning a value may declare a variable.
      if (flag && HEADER_FLAGS.has(flag) && isHeaderArg(value, true)) {
        // `--header=Name: value`, one argument.
        out[i] = `${flag}=${headerArg(value, from, true) ?? value}`;
        done.add(i);
      } else if (flag && credentialFlag(flag)) {
        // `--password=…`.
        out[i] = `${flag}=${flagValue(value, from)}`;
        done.add(i);
      } else if (value.split(",").some((part) => variablePair(part) !== null)) {
        // A variable passed on (`-e API_KEY=…`, `X-Api-Key=…`, `--build-arg=API_KEY=…`), or
        // several in one list (`--set a=1,api.key=…`): a word that names a credential, then `=`.
        const pairs = value
          .split(",")
          .map((part) => {
            const first = part.indexOf("=");
            // A bare address, whose query may hold `=` (`https://user:pass@h/?a=b`), isn't split.
            const bare =
              part.startsWith("//") ||
              part.slice(0, first === -1 ? part.length : first).includes("://");
            const eq = bare ? -1 : first;
            if (!bare && variablePair(part) !== null)
              return `${part.slice(0, eq + 1)}${flagValue(part.slice(eq + 1), from)}`;
            // Another part keeps the address rule (`u=https://user:pass@host`).
            const tail = eq > 0 ? part.slice(eq + 1) : part;
            if (!tail.includes("://") && !tail.startsWith("//")) return part;
            return eq > 0
              ? `${part.slice(0, eq + 1)}${cleanedUrl(tail, from)}`
              : cleanedUrl(part, from);
          })
          .join(",");
        out[i] = flag ? `${flag}=${pairs}` : pairs;
        done.add(i);
      } else if (!flag && isHeaderArg(arg, afterHeaderFlag)) {
        // A header passed on, before the address rule: a credential header holding an address is
        // still cleaned whole.
        out[i] = headerArg(arg, from, afterHeaderFlag) ?? arg;
        done.add(i);
      } else if (value.includes("://") || value.startsWith("//")) {
        // A connection string or an address, alone or as a flag's value (`postgresql://user:pass@
        // host/db`, `--url=https://…`, `--dsn=//user:pass@host`).
        out[i] = flag ? `${flag}=${cleanedUrls(value, from)}` : cleanedUrls(value, from);
        done.add(i);
      } else {
        const next = out[i + 1];
        // A value after a credential flag, unless it's another flag or reads as a file path.
        if (
          credentialFlag(arg) &&
          next !== undefined &&
          !next.startsWith("-") &&
          !next.includes("/") &&
          !/\.[A-Za-z]{1,5}$/.test(next)
        ) {
          out[i + 1] = flagValue(next, `${where}.args[${i + 1}]`);
          done.add(i + 1);
          i += 1;
        }
      }
    }
    return out.map((arg, i) => (done.has(i) ? arg : cleaned(arg, `${where}.args[${i}]`, false)));
  };

  /**
   * An address with its userinfo password and credential-named query values taken out
   * (`https://admin:pass@host/?api_key=…`), then through `cleaned` (029). String work, no URL
   * parser: a `${VAR}` in it must stay as written.
   */
  const cleanedUrl = (raw: string, from: string): string => {
    let url = raw;
    const scheme = url.indexOf("://");
    const hostStart = scheme !== -1 ? scheme + 3 : url.startsWith("//") ? 2 : -1;
    if (hostStart !== -1) {
      let hostEnd = url.length;
      for (const stop of ["/", "?", "#"]) {
        const at = url.indexOf(stop, hostStart);
        if (at !== -1 && at < hostEnd) hostEnd = at;
      }
      const authority = url.slice(hostStart, hostEnd);
      const at = authority.lastIndexOf("@");
      if (at !== -1) {
        const userinfo = authority.slice(0, at);
        const lower = userinfo.toLowerCase();
        // `user:password`, with the colon as is or encoded (`%3A`).
        const plain = userinfo.indexOf(":");
        const encoded = lower.indexOf("%3a");
        const colon = plain !== -1 ? plain : encoded;
        const width = plain !== -1 ? 1 : 3;
        let kept = userinfo;
        if (colon !== -1) {
          const password = userinfo.slice(colon + width);
          if (password && !REFERENCE.test(password))
            kept = `${userinfo.slice(0, colon + width)}\${${newVariable(from)}}`;
        } else if (!REFERENCE.test(userinfo) && (mixedSecret(userinfo) || secretLike(userinfo)))
          // A token as the user (`https://ghp_…@host`).
          kept = `\${${newVariable(from)}}`;
        if (kept !== userinfo)
          url = `${url.slice(0, hostStart)}${kept}${authority.slice(at)}${url.slice(hostEnd)}`;
      }
    }
    /** `name=value` pairs after `?` or `#`, a credential-named value taken out. */
    const params = (text: string) =>
      text
        .split("&")
        .map((param) => {
          const equals = param.indexOf("=");
          if (equals <= 0) return param;
          const raw = param.slice(0, equals);
          let name = raw;
          try {
            name = decodeURIComponent(raw);
          } catch {
            // Not percent-encoded as it should be: read as written.
          }
          const value = param.slice(equals + 1);
          return CREDENTIAL_NAME.test(name) && value && !REFERENCE.test(value)
            ? `${raw}=\${${newVariable(from)}}`
            : param;
        })
        .join("&");
    const hash = url.indexOf("#");
    const query = url.indexOf("?");
    const fragment = hash === -1 ? "" : `#${params(url.slice(hash + 1))}`;
    const beforeHash = hash === -1 ? url : url.slice(0, hash);
    url =
      query !== -1 && (hash === -1 || query < hash)
        ? `${beforeHash.slice(0, query + 1)}${params(beforeHash.slice(query + 1))}${fragment}`
        : `${beforeHash}${fragment}`;
    return cleaned(url, from, false);
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
    if (Array.isArray(config.args)) block.args = cleanedArgs(config.args);
  } else {
    if (typeof config.url !== "string" || !config.url)
      throw new ReadError("manifest_invalid", `The MCP server ${key} has no url.`);
    block.url = cleanedUrl(config.url, `${where}.url`);
    if (config.headers && typeof config.headers === "object") {
      const headers: Record<string, string> = {};
      for (const [header, value] of Object.entries(config.headers as Record<string, unknown>))
        headers[header] = headerValue(
          String(value),
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
