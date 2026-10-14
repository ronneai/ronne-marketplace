// The server's logger (feature 100): one JSON object per line on stdout, with the time, the level, a
// fixed message, the request it belongs to and the event's fields, secrets redacted (redact.ts). Or,
// with LOG_FORMAT=text (`pnpm dev`), the same for a person reading a terminal. Logging never throws
// and never blocks: a line that can't be written whole is written as little as it can be.
import { currentRequest } from "./context";
import { EVENTS, type EventName, LOG_LEVELS, type LogLevel } from "./events";
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
  typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

/** The most a line written holds, in characters: past it, its fields become `"[too big]"`. */
export const MAX_LINE = 131_072;

/** The fields every line may carry, in the order a JSON line shows them. */
const RESERVED = ["time", "level", "msg", "domain", "event", "requestId", "userId"];

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
 * Hangul fillers, variation selectors…), the line and paragraph separators, and the blank braille
 * pattern (U+2800, which shows as a space). Tested on whole code points, so characters past U+FFFF
 * count too.
 */
const HIDDEN = /^[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}\u2800]$/u;

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
 * What a key or value can be written as it is: letters, digits and `_ . : / @ + , % # -`. Nothing
 * a reader could take for a quote, an escape, a separator or an `=`.
 */
const PLAIN = /^[\p{L}\p{N}_.:/@+,%#-]+$/u;
/** A hidden character anywhere (some are letters too, such as the Hangul fillers). */
const ANY_HIDDEN = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}\u2800]/u;
const isPlain = (text: string) => PLAIN.test(text) && !ANY_HIDDEN.test(text);

/**
 * Quoted text for a key or value: a JSON string, with `'` escaped (`\u0027`, so a reader that pairs
 * single quotes finds none), and, in a key, `=` too (a reader that drops quotes then still finds the
 * key's end at the real `=`).
 */
const quoted = (text: string, key: boolean): string => {
  const json = JSON.stringify(text).replaceAll("'", "\\u0027");
  return escapeText(key ? json.replaceAll("=", "\\u003d") : json);
};

/**
 * A value in a text line: as it is when it's plain (PLAIN), quoted otherwise, so nothing in it can
 * pass for another field, a quote or an escape, to a person or to a reader that splits the line.
 */
const textValue = (value: unknown): string => {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return isPlain(text) ? text : quoted(text, false);
};

const textKey = (key: string): string => (isPlain(key) ? key : quoted(key, true));

/**
 * The line's head (domain, event, message): with `\`, `=`, `"` and `'` escaped (`\uXXXX`) before
 * the hidden characters, so it can't hold a field, an escape or a quote that changes how the rest of
 * the line pairs.
 */
const headText = (text: string): string =>
  escapeText(
    text
      .replaceAll("\\", "\\u005c")
      .replaceAll("=", "\\u003d")
      .replaceAll('"', "\\u0022")
      .replaceAll("'", "\\u0027"),
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
  const last = ["requestId", "userId"];
  const pairs = Object.entries(line).filter(([key]) => !RESERVED.includes(key));
  for (const key of last) if (line[key] !== undefined) pairs.push([key, line[key]]);
  // A key is quoted like a value when it could pass for something else (`x requestId`).
  const rest = pairs.map(([key, value]) => `${textKey(key)}=${textValue(value)}`).join(" ");
  return rest ? `${head} ${rest}` : head;
};

let stdoutWatched = false;

/**
 * Writes to stdout without waiting. A closed stdout (`EPIPE`, a reader gone) loses the lines, and
 * never crashes the server: its `error` event is listened to once.
 */
const writeStdout = (line: string) => {
  if (!stdoutWatched) {
    stdoutWatched = true;
    process.stdout.on("error", () => {
      // Nowhere to write logs: they're lost, the server goes on.
    });
  }
  process.stdout.write(line);
};

export const createLogger = (options: LoggerOptions, bindings: Fields = {}): Logger => {
  const write = options.write ?? writeStdout;
  const now = options.now ?? (() => new Date());
  const format = (line: Fields) =>
    `${options.format === "text" ? textLine(line, options.colour ?? false) : escapeText(JSON.stringify(line))}\n`;

  const emit = (level: LogLevel, msg: unknown, fields: unknown, event?: EventName) => {
    if (rank(level) < rank(options.level)) return;
    try {
      const context = currentRequest();
      const withStack = level === "error";
      // Each cleaned on its own: a getter that throws marks its field, not the line.
      // One budget for the line: bindings and fields together.
      const budget = newLine();
      const own = {
        ...cleanFields(bindings, withStack, budget),
        ...cleanFields(fields, withStack, budget),
      };
      // The context's user, unless a field names one; cleaned like any value either way.
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
        ...(isName(own.domain) ? { domain: own.domain } : {}),
        ...(event ? { event } : {}),
        ...(context ? { requestId: cleanText(String(context.requestId)) } : {}),
        ...(isName(userId) ? { userId } : {}),
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
      emit(level ?? spec.level, spec.msg, fields, name);
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
export const parseLogFormat = (value: string | undefined): LogFormat =>
  value?.trim().toLowerCase() === "text" ? "text" : "json";
