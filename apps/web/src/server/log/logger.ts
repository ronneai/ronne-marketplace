// The server's logger (feature 100): one JSON object per line on stdout, with the time, the level, a
// fixed message, the request it belongs to and the event's fields, secrets redacted (redact.ts). Or,
// with LOG_FORMAT=text (`pnpm dev`), the same for a person reading a terminal. Logging never throws
// and never blocks: a line that can't be written whole is written as little as it can be.

import { hooks } from "../telemetry/hooks";
import { currentRequest } from "./context";
import { EVENTS, type EventName, LOG_LEVELS, type LogLevel } from "./events";
import { writeTo } from "./output";
import { cleanFields, cleanText, newLine, TOO_BIG } from "./redact";

export type LogFormat = "json" | "text";
type Fields = Record<string, unknown>;

export type Logger = {
  debug: (msg: string, fields?: Fields) => void;
  info: (msg: string, fields?: Fields) => void;
  warn: (msg: string, fields?: Fields) => void;
  error: (msg: string, fields?: Fields) => void;
  /** An event from events.ts, at its level unless `level` says otherwise. */
  event: (name: EventName, fields?: Fields, level?: LogLevel) => void;
  /** A logger whose lines carry these fields too, such as `{ domain: "submissions" }`. */
  child: (bindings: Fields) => Logger;
};

export type LoggerOptions = {
  level: LogLevel;
  format: LogFormat;
  /** Writes one line, newline included. stdout by default. */
  write?: (line: string) => void;
  now?: () => Date;
  /** Colours in the text format (stdout is a terminal). */
  colour?: boolean;
};

const rank = (level: LogLevel) => LOG_LEVELS.indexOf(level);

/** A domain or a user id in the head: a string or a number, nothing bigger. */
const isName = (value: unknown): value is string | number =>
  (typeof value === "string" && value !== "") ||
  (typeof value === "number" && Number.isFinite(value));

/** The most a line written holds, in characters: past it, its fields become `"[too big]"`. */
export const MAX_LINE = 131_072;

/** The fields every line may carry, in the order a JSON line shows them. */
const RESERVED = [
  "time",
  "level",
  "msg",
  "domain",
  "event",
  "requestId",
  "userId",
  "traceId",
  "spanId",
];

const COLOURS: Record<LogLevel, string> = {
  debug: "\u001b[90m",
  info: "\u001b[36m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
};
const RESET = "\u001b[0m";

/**
 * A character that could break a text line, drive the terminal, reorder what it shows or hide in
 * it, by Unicode's own categories: controls (`Cc`: C0, DEL, C1), format characters (`Cf`: the
 * bidirectional marks, zero-width and tag characters), every default-ignorable code point (the
 * Hangul fillers, variation selectors…), the line and paragraph separators, the blank braille
 * pattern (U+2800, which shows as a space), and a lone surrogate (`Cs`) or U+FFFD, which a strict
 * logfmt reader refuses. Tested on whole code points, so characters past U+FFFF count too.
 */
const HIDDEN = /^[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}\u2800\ufffd]$/u;

/**
 * Text with every hidden character written as `\uXXXX` (each UTF-16 unit, so a character past
 * U+FFFF becomes its surrogate pair), so a line stays one line and shows what it holds. In a JSON
 * line these characters are only ever inside strings, where the escape is the same character to a
 * parser.
 */
const escapeText = (text: string): string => {
  let out = "";
  for (const char of text) {
    if (!HIDDEN.test(char)) {
      out += char;
      continue;
    }
    for (let i = 0; i < char.length; i++)
      out += `\\u${char.charCodeAt(i).toString(16).padStart(4, "0")}`;
  }
  return out;
};

/**
 * What a key or value can be written as it is: letters, digits and `_ . : / @ + , % -`. Nothing a
 * reader could take for a quote, an escape, a separator, an `=` or (`#`) the start of a comment.
 */
const PLAIN = /^[\p{L}\p{N}_.:/@+,%-]+$/u;
/** A hidden character anywhere (some are letters too, such as the Hangul fillers). */
const ANY_HIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}\u2800\ufffd]/u;
const isPlain = (text: string) => PLAIN.test(text) && !ANY_HIDDEN.test(text);

/**
 * A value that isn't plain: a JSON string, with `'` escaped (`\u0027`, so a reader that pairs
 * single quotes finds none).
 */
const quoted = (text: string): string =>
  escapeText(JSON.stringify(text).replaceAll("'", "\\u0027"));

/**
 * A value in a text line: as it is when it's plain (PLAIN), quoted otherwise, so nothing in it can
 * pass for another field, a quote or an escape, to a person or to a reader that splits the line.
 */
const textValue = (value: unknown): string => {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return isPlain(text) ? text : quoted(text);
};

/** A key's characters that stay as they are: PLAIN's, but `%` (the escape) and anything hidden. */
const KEY_CHAR = /^[\p{L}\p{N}_.:/@+,-]$/u;

/**
 * A key in a text line, never quoted (strict logfmt readers refuse a quoted key): every character
 * that isn't KEY_CHAR, `%` included, as its UTF-8 bytes `%XX`, so two keys stay two keys. An empty
 * key is a lone `%`, which no encoded key can be.
 */
const textKey = (key: string): string => {
  if (key === "") return "%";
  let out = "";
  for (const char of key) {
    if (KEY_CHAR.test(char) && !ANY_HIDDEN.test(char)) out += char;
    // A lone surrogate as its UTF-16 unit (`%uD800`): UTF-8 would make every one U+FFFD.
    else if (char.length === 1 && char >= "\ud800" && char <= "\udfff")
      out += `%u${char.charCodeAt(0).toString(16).toUpperCase()}`;
    else
      for (const byte of Buffer.from(char))
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
};

/**
 * The line's head (domain, event, message): with `\`, `=`, `"`, `'` and `#` escaped (`\uXXXX`)
 * before the hidden characters, so it can't hold a field, an escape, a quote that changes how the
 * rest of the line pairs, or a comment that hides it.
 */
const headText = (text: string): string =>
  escapeText(
    text
      .replaceAll("\\", "\\u005c")
      .replaceAll("=", "\\u003d")
      .replaceAll('"', "\\u0022")
      .replaceAll("'", "\\u0027")
      .replaceAll("#", "\\u0023"),
  );

/** `time LEVEL domain event msg key=value…`, the request's ID and user last. */
const textLine = (line: Fields, colour: boolean): string => {
  const time = String(line.time).slice(11, 23);
  const level = String(line.level).toUpperCase().padEnd(5);
  const parts = [line.domain, line.event, line.msg]
    .filter((part) => part !== undefined && part !== "")
    .map((part) => headText(String(part)));
  const head = [
    time,
    colour ? `${COLOURS[line.level as LogLevel]}${level}${RESET}` : level,
    ...parts,
  ].join(" ");
  const last = ["requestId", "userId", "traceId", "spanId"];
  const pairs = Object.entries(line).filter(([key]) => !RESERVED.includes(key));
  for (const key of last) if (line[key] !== undefined) pairs.push([key, line[key]]);
  // Keys percent-encoded (textKey), values plain or quoted (textValue): nothing passes for a field.
  const rest = pairs.map(([key, value]) => `${textKey(key)}=${textValue(value)}`).join(" ");
  return rest ? `${head} ${rest}` : head;
};

/** Writes to stdout without waiting; a closed stdout loses the lines, never crashes (output.ts). */
const writeStdout = (line: string) => writeTo(process.stdout, line);

export const createLogger = (options: LoggerOptions, bindings: Fields = {}): Logger => {
  const write = options.write ?? writeStdout;
  const now = options.now ?? (() => new Date());
  const format = (line: Fields) =>
    `${options.format === "text" ? textLine(line, options.colour ?? false) : escapeText(JSON.stringify(line))}\n`;

  const emit = (
    level: LogLevel,
    msg: unknown,
    fields: unknown,
    event?: EventName,
    always = false,
  ) => {
    if (!always && rank(level) < rank(options.level)) return;
    try {
      const context = currentRequest();
      const withStack = level === "error";
      // Each cleaned on its own: a getter that throws marks its field, not the line.
      // One budget for the line: bindings and fields together.
      const budget = newLine();
      const bound = cleanFields(bindings, withStack, budget);
      const own = { ...bound, ...cleanFields(fields, withStack, budget) };
      // The domain is the logger's (its child's binding); a field names one only when it has none.
      const domain = isName(bound.domain) ? bound.domain : own.domain;
      // The request's user, as authentication found it; a field names one only outside a request's
      // known user (request data spread into the fields can't hide or replace who asked).
      const userId =
        context?.userId === undefined
          ? own.userId
          : cleanFields({ userId: context.userId }, false).userId;
      const line: Fields = {
        time: now().toISOString(),
        level,
        msg: cleanText(String(msg)),
        // The head holds only names and ids: a domain or a user that isn't one is left out.
        ...(isName(domain) ? { domain } : {}),
        ...(event ? { event } : {}),
        ...(context ? { requestId: cleanText(String(context.requestId)) } : {}),
        ...(isName(userId) ? { userId } : {}),
        // With tracing on (101), the span the line was written in: a log line leads to its trace.
        ...hooks().traceIds(),
      };
      const head = { ...line };
      // defineProperty: a `__proto__` field (from request JSON) stays a field.
      for (const [key, value] of Object.entries(own))
        if (!RESERVED.includes(key))
          Object.defineProperty(line, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          });
      // Whatever the budget let through, escaping and quoting included: a line has a size. Past
      // it, the fields go; the head alone is far below it (each part at most 2,001 characters).
      const text = format(line);
      write(text.length > MAX_LINE ? format({ ...head, fields: TOO_BIG }) : text);
    } catch {
      // Logging never fails a request: the line, as little as it can be.
      try {
        write(format({ time: new Date().toISOString(), level, msg: "Unloggable line" }));
      } catch {
        // Nowhere to write: nothing more to do.
      }
    }
  };

  return {
    debug: (msg, fields = {}) => emit("debug", msg, fields),
    info: (msg, fields = {}) => emit("info", msg, fields),
    warn: (msg, fields = {}) => emit("warn", msg, fields),
    error: (msg, fields = {}) => emit("error", msg, fields),
    event: (name, fields = {}, level) => {
      // An unknown name (only past the types) is dropped, never thrown.
      if (typeof name !== "string" || !Object.hasOwn(EVENTS, name)) return;
      const spec = EVENTS[name];
      // The metrics count events (101), at any level; a failure there never stops a line.
      try {
        hooks().onEvent(name, fields);
      } catch {}
      emit(level ?? spec.level, spec.msg, fields, name, "always" in spec && spec.always === true);
    },
    child: (more) => {
      try {
        return createLogger(options, { ...bindings, ...more });
      } catch {
        // Bindings that can't be read (a getter that throws): the child writes without them.
        return createLogger(options, bindings);
      }
    },
  };
};

/** LOG_LEVEL as given, or `info` and a note to warn about when it's not a level. */
export const parseLogLevel = (value: string | undefined): { level: LogLevel; invalid: boolean } => {
  if (value === undefined || value === "") return { level: "info", invalid: false };
  const level = value.trim().toLowerCase();
  return LOG_LEVELS.includes(level as LogLevel)
    ? { level: level as LogLevel, invalid: false }
    : { level: "info", invalid: true };
};

/** LOG_FORMAT: `text` for people, anything else JSON. */
export const parseLogFormat = (
  value: string | undefined,
  nodeEnv: string | undefined = undefined,
): LogFormat => {
  const format = value?.trim().toLowerCase();
  if (format === "text" || format === "json") return format;
  // Unset (or unknown): text for a person running `pnpm dev` (NODE_ENV=development), else JSON.
  return nodeEnv === "development" ? "text" : "json";
};
