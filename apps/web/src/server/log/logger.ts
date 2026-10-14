// The server's logger (feature 100): one JSON object per line on stdout, with the time, the level, a
// fixed message, the request it belongs to and the event's fields, secrets redacted (redact.ts). Or,
// with LOG_FORMAT=text (`pnpm dev`), the same for a person reading a terminal. Logging never throws
// and never blocks: a line that can't be written whole is written as little as it can be.
import { currentRequest } from "./context";
import { EVENTS, type EventName, LOG_LEVELS, type LogLevel } from "./events";
import { cleanFields, redactString } from "./redact";

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
 * A character that could break a text line, drive the terminal or reorder what it shows: C0, DEL,
 * C1, U+2028/9, and the bidirectional formatting marks (U+200E/F, U+202A–E, U+2066–9).
 */
const isControl = (code: number) =>
  code < 0x20 ||
  (code >= 0x7f && code < 0xa0) ||
  code === 0x200e ||
  code === 0x200f ||
  (code >= 0x2028 && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069);

/** Text with every control character written as `\uXXXX`, so a line stays one line. */
const escapeText = (text: string): string => {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    out += isControl(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return out;
};

const textValue = (value: unknown): string => {
  if (typeof value !== "string") return escapeText(JSON.stringify(value) ?? String(value));
  return /[\s"=]/.test(value) ? escapeText(JSON.stringify(value)) : escapeText(value);
};

/** `time LEVEL domain event msg key=value…`, the request's ID and user last. */
const textLine = (line: Fields, colour: boolean): string => {
  const time = String(line.time).slice(11, 23);
  const level = String(line.level).toUpperCase().padEnd(5);
  const parts = [line.domain, line.event, line.msg]
    .filter((part) => part !== undefined && part !== "")
    .map((part) => escapeText(String(part)));
  const head = [
    time,
    colour ? `${COLOURS[line.level as LogLevel]}${level}${RESET}` : level,
    ...parts,
  ].join(" ");
  const last = ["requestId", "userId"];
  const pairs = Object.entries(line).filter(([key]) => !RESERVED.includes(key));
  for (const key of last) if (line[key] !== undefined) pairs.push([key, line[key]]);
  // A key is quoted like a value when it could pass for something else (`x requestId`).
  const rest = pairs.map(([key, value]) => `${textValue(key)}=${textValue(value)}`).join(" ");
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
    `${options.format === "text" ? textLine(line, options.colour ?? false) : JSON.stringify(line)}\n`;

  const emit = (level: LogLevel, msg: unknown, fields: unknown, event?: EventName) => {
    if (rank(level) < rank(options.level)) return;
    try {
      const context = currentRequest();
      const withStack = level === "error";
      // Each cleaned on its own: a getter that throws marks its field, not the line.
      const own = { ...cleanFields(bindings, withStack), ...cleanFields(fields, withStack) };
      // The context's user, unless a field names one; cleaned like any value either way.
      const userId =
        own.userId ??
        (context?.userId === undefined
          ? undefined
          : cleanFields({ userId: context.userId }, false).userId);
      const line: Fields = {
        time: now().toISOString(),
        level,
        msg: redactString(String(msg)),
        ...(own.domain !== undefined ? { domain: own.domain } : {}),
        ...(event ? { event } : {}),
        ...(context ? { requestId: redactString(String(context.requestId)) } : {}),
        ...(userId !== undefined ? { userId } : {}),
      };
      for (const [key, value] of Object.entries(own))
        if (!RESERVED.includes(key)) line[key] = value;
      write(format(line));
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
      if (!Object.hasOwn(EVENTS, name)) return;
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
