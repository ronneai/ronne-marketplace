import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setRequestUser, withRequestContext } from "./context";
import { EVENTS, LOG_LEVELS, type LogLevel } from "./events";
import { logger, setLoggerForTests } from "./index";
import {
  createLogger,
  type LoggerOptions,
  MAX_LINE,
  parseLogFormat,
  parseLogLevel,
} from "./logger";

const NOW = new Date("2026-10-11T14:03:22.417Z");

const collect = (options: Partial<LoggerOptions> = {}) => {
  const lines: string[] = [];
  const log = createLogger({
    level: "debug",
    format: "json",
    now: () => NOW,
    write: (line) => lines.push(line),
    ...options,
  });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { log, lines, parsed };
};

describe("levels", () => {
  it("writes each level, one JSON object per line", () => {
    const { log, lines, parsed } = collect();
    for (const level of LOG_LEVELS) log[level]("Something happened", { n: 1 });
    expect(lines.every((line) => line.endsWith("\n") && !line.slice(0, -1).includes("\n"))).toBe(
      true,
    );
    expect(parsed()).toEqual(
      LOG_LEVELS.map((level) => ({
        time: "2026-10-11T14:03:22.417Z",
        level,
        msg: "Something happened",
        n: 1,
      })),
    );
  });

  it.each([
    ["debug", ["debug", "info", "warn", "error"]],
    ["info", ["info", "warn", "error"]],
    ["warn", ["warn", "error"]],
    ["error", ["error"]],
  ] as const)("at %s, writes only that level and above", (min, written) => {
    const { log, parsed } = collect({ level: min });
    for (const level of LOG_LEVELS) log[level]("x");
    log.event("http.request");
    expect(parsed().map((line) => line.level)).toEqual([
      ...written,
      ...(min === "debug" || min === "info" ? ["info"] : []),
    ]);
  });
});

describe("events", () => {
  it("writes an event with its name, its level and its fixed message", () => {
    const { log, parsed } = collect();
    log.event("version.released", { count: 3, userId: "01J9" });
    expect(parsed()).toEqual([
      {
        time: "2026-10-11T14:03:22.417Z",
        level: "info",
        msg: "Released",
        event: "version.released",
        userId: "01J9",
        count: 3,
      },
    ]);
  });

  it("takes another level when the caller says so (http.request on a 5xx)", () => {
    const { log, parsed } = collect();
    log.event("http.request", { status: 500 }, "error");
    expect(parsed()[0]).toMatchObject({ level: "error", event: "http.request", status: 500 });
  });

  it("names every event <area>.<what>, with a level and a message without values", () => {
    for (const [name, spec] of Object.entries(EVENTS)) {
      expect(name).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(LOG_LEVELS).toContain(spec.level as LogLevel);
      expect(spec.msg).not.toMatch(/[{}$%]/);
    }
  });
});

describe("child loggers", () => {
  it("carry their bindings, and a child's child carries both", () => {
    const { log, parsed } = collect();
    const submissions = log.child({ domain: "submissions" });
    submissions.info("a");
    submissions.child({ part: "bulk" }).warn("b");
    log.info("c");
    expect(parsed()).toEqual([
      expect.objectContaining({ msg: "a", domain: "submissions" }),
      expect.objectContaining({ msg: "b", domain: "submissions", part: "bulk" }),
      expect.not.objectContaining({ domain: expect.anything() }),
    ]);
  });

  it("redact secrets in their bindings too", () => {
    const { log, lines } = collect();
    log.child({ apiKey: "k-123" }).info("x");
    expect(lines[0]).not.toContain("k-123");
  });
});

describe("the request context", () => {
  it("adds the request's ID and, once known, its user to every line inside it", async () => {
    const { log, parsed } = collect();
    log.info("outside");
    await withRequestContext({ requestId: "01K7REQ" }, async () => {
      log.info("before");
      await new Promise((resolve) => setTimeout(resolve, 1));
      setRequestUser("01J9USER");
      log.child({ domain: "feeds" }).info("after");
    });
    log.info("outside again");
    const lines = parsed();
    expect(lines[0]).not.toHaveProperty("requestId");
    expect(lines[1]).toMatchObject({ requestId: "01K7REQ" });
    expect(lines[1]).not.toHaveProperty("userId");
    expect(lines[2]).toMatchObject({ requestId: "01K7REQ", userId: "01J9USER", domain: "feeds" });
    expect(lines[3]).not.toHaveProperty("requestId");
  });

  it("keeps two requests apart when they run at the same time", async () => {
    const { log, parsed } = collect();
    const run = (id: string, wait: number) =>
      withRequestContext({ requestId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, wait));
        log.info(id);
      });
    await Promise.all([run("A", 5), run("B", 1)]);
    expect(parsed().map((line) => [line.msg, line.requestId])).toEqual([
      ["B", "B"],
      ["A", "A"],
    ]);
  });

  it("can't be overwritten by a field: the request's ID wins", () => {
    const { log, parsed } = collect();
    withRequestContext({ requestId: "real" }, () => log.info("x", { requestId: "forged" }));
    expect(parsed()[0]?.requestId).toBe("real");
  });
});

describe("formats", () => {
  it("writes text for people: time, level, domain, event, message, then the fields", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "01K7" }, () =>
      log.child({ domain: "submissions" }).event("version.released", { count: 3 }),
    );
    log.warn("Watch out", { reason: "too big", ok: true });
    expect(lines).toEqual([
      "14:03:22.417 INFO  submissions version.released Released count=3 requestId=01K7\n",
      '14:03:22.417 WARN  Watch out reason="too big" ok=true\n',
    ]);
  });

  it("colours the level in text when asked, and never in JSON", () => {
    const text = collect({ format: "text", colour: true });
    text.log.error("x");
    expect(text.lines[0]).toContain("\u001b[31mERROR\u001b[0m");
    const json = collect({ format: "json", colour: true });
    json.log.error("x");
    expect(json.lines[0]).not.toContain("\u001b");
  });

  it("redacts the same way in both formats", () => {
    for (const format of ["json", "text"] as const) {
      const { log, lines } = collect({ format });
      log.error("x", { password: "hunter2", url: "postgres://u:pw@h/d" });
      expect(lines[0]).not.toContain("hunter2");
      expect(lines[0]).not.toContain(":pw@");
    }
  });
});

describe("what a line can't carry", () => {
  const TOKEN = `rmk_${"B".repeat(43)}`;

  it("redacts the message itself", () => {
    const { log, lines } = collect();
    log.info(`Called with ${TOKEN} on postgres://u:pw@h/d`);
    expect(lines[0]).toContain("rmk_[redacted]");
    expect(lines[0]).not.toContain(TOKEN);
    expect(lines[0]).not.toContain(":pw@");
  });

  it("redacts the request's ID and user from the context", () => {
    const { log, lines } = collect();
    withRequestContext({ requestId: TOKEN }, () => {
      setRequestUser(`u ${TOKEN}`);
      log.info("x");
    });
    expect(lines[0]).not.toContain(TOKEN);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      requestId: "rmk_[redacted]",
      userId: "u rmk_[redacted]",
    });
  });

  it("keeps a text line one line: control characters in the message, domain, keys and values are escaped", () => {
    const { log, lines } = collect({ format: "text" });
    log.child({ domain: "d\nERROR forged" }).info("line1\nFAKE 00:00 ERROR forged", {
      "k\nERROR x": 1,
      v: "a\u001b[2Jb",
      w: "a\u2028b\u0085c",
    });
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line.slice(0, -1)).not.toMatch(/[\n\r\u2028\u0085]/);
    expect(line).not.toContain("\u001b");
    expect(line).toContain("d\\u000aERROR forged");
    expect(line).toContain("line1\\u000aFAKE");
    // A key that could pass for something else is percent-encoded.
    expect(line).toContain("k%0AERROR%20x=1");
    expect(line).toContain("a\\u001b[2Jb");
  });

  it("marks a field whose getter throws, and keeps the line", () => {
    const { log, parsed } = collect();
    log.info("x", {
      ok: 1,
      get boom(): unknown {
        throw new Error("no");
      },
    });
    expect(parsed()[0]).toMatchObject({ msg: "x", ok: 1, boom: "[unserialisable]" });
  });

  it("makes a child even when its bindings can't be read", () => {
    const { log, parsed } = collect();
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("no");
        },
      },
    );
    expect(() => log.child(hostile).info("still here")).not.toThrow();
    expect(parsed()[0]).toMatchObject({ msg: "still here" });
  });

  it("writes the fallback line in the logger's format", () => {
    const { log, lines } = collect({
      format: "text",
      now: () => {
        throw new Error("clock");
      },
    });
    log.warn("x");
    expect(lines[0]).toMatch(/^\d\d:\d\d:\d\d\.\d{3} WARN {2}Unloggable line\n$/);
  });
});

describe("more of what a line can't carry", () => {
  const TOKEN = `rmk_${"C".repeat(43)}`;

  it("writes the fields in the spec's order", () => {
    const { log, lines } = collect();
    withRequestContext({ requestId: "R", userId: "U" }, () =>
      log.child({ domain: "submissions" }).event("version.released", { count: 3 }),
    );
    expect(Object.keys(JSON.parse(lines[0] ?? ""))).toEqual([
      "time",
      "level",
      "msg",
      "domain",
      "event",
      "requestId",
      "userId",
      "count",
    ]);
  });

  it("drops an unknown event, never throws", () => {
    const { log, lines } = collect();
    expect(() => log.event("nope.nope" as never)).not.toThrow();
    expect(() => log.event("__proto__" as never)).not.toThrow();
    expect(lines).toEqual([]);
  });

  it("cleans a context user that isn't a string", () => {
    const { log, lines } = collect();
    withRequestContext({ requestId: "R", userId: { password: "hunter2", t: TOKEN } as never }, () =>
      log.info("x"),
    );
    expect(lines[0]).not.toContain("hunter2");
    expect(lines[0]).not.toContain(TOKEN);
  });

  it("encodes a text key that could pass for another field, and escapes bidi marks", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "real" }, () =>
      log.info("x", { "x requestId": "forged", rtl: "a\u202eb" }),
    );
    expect(lines[0]).toContain("x%20requestId=forged");
    expect(lines[0]).toContain("\\u202e");
    expect(lines[0]).not.toContain("\u202e");
  });

  it("escapes every bidi mark, U+061C included, in text and in JSON", () => {
    const marks = [
      "\u061c",
      "\u200e",
      "\u200f",
      "\u202a",
      "\u202e",
      "\u2066",
      "\u2069",
      "\u0085",
      "\u009b",
      "\u2028",
    ];
    for (const format of ["text", "json"] as const) {
      const { log, lines } = collect({ format });
      log.info(`m${marks.join("")}`, { v: marks.join(""), [`k${marks.join("")}`]: 1 });
      for (const mark of marks)
        expect(lines[0], `${format} ${mark.charCodeAt(0).toString(16)}`).not.toContain(mark);
      if (format === "json") expect(JSON.parse(lines[0] ?? "").v).toBe(marks.join(""));
    }
  });

  it("can't forge a field in text through an object value, the message or the domain", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "REAL" }, () =>
      log.child({ domain: "sub requestId=FORGED" }).info("m requestId=FORGED", {
        v: { a: " requestId=FORGED" },
        plain: { a: 1 },
      }),
    );
    const line = lines[0] ?? "";
    expect(line).toContain('v="{\\"a\\":\\" requestId=FORGED\\"}"');
    // Outside quoted values, one field named requestId: the real one.
    const unquoted = line.replaceAll(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(unquoted.match(/ requestId=/g)).toHaveLength(1);
    expect(line).toContain('plain="{\\"a\\":1}"');
    expect(line).toMatch(/ requestId=REAL\n$/);
  });

  it("quotes a plain string value holding an = or a quote", () => {
    const { log, lines } = collect({ format: "text" });
    log.info("m", { e: "a=b", s: 'a"b' });
    expect(lines[0]).toContain('e="a=b"');
    expect(lines[0]).toContain('s="a\\"b"');
  });

  it("escapes every hidden character, past U+FFFF too, so a key can't pass for another", () => {
    const hidden = [
      0x00, 0x1b, 0x7f, 0x85, 0x9b, 0xad, 0x34f, 0x61c, 0x115f, 0x1160, 0x17b4, 0x180b, 0x180e,
      0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2060, 0x2061,
      0x2064, 0x2066, 0x2069, 0x206a, 0x206f, 0x2800, 0x3164, 0xfe00, 0xfe0f, 0xfeff, 0xffa0,
      0xfff9, 0xfffb, 0x1bca0, 0x1d173, 0xe0001, 0xe0020, 0xe007f, 0xe01ef,
    ].map((code) => String.fromCodePoint(code));
    for (const format of ["text", "json"] as const) {
      const { log, lines } = collect({ format });
      withRequestContext({ requestId: "REAL" }, () =>
        log.info(
          `m${hidden.join("")}`,
          Object.fromEntries(hidden.map((char, i) => [`requestId${char}`, i])),
        ),
      );
      const line = lines[0] ?? "";
      for (const char of hidden)
        expect(line.includes(char), `${format} U+${char.codePointAt(0)?.toString(16)}`).toBe(false);
      if (format === "json") expect(JSON.parse(line).msg).toBe(`m${hidden.join("")}`);
      else expect(line).toContain(`requestId%CD%8F=${hidden.indexOf("\u034f")}`);
    }
    // Ordinary text, accents and other scripts stay as they are.
    const { log, lines } = collect({ format: "text" });
    log.info("café 日本 ñ ü 🙂");
    expect(lines[0]).toContain("café 日本 ñ ü 🙂");
  });

  it("encodes keys and quotes values holding any space, non-ASCII ones too", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "REAL" }, () =>
      log.info("m", {
        "x\u00a0requestId": "FORGED",
        "y\u3000requestId": "FORGED",
        v: "a\u2007requestId=FORGED",
        o: { "a b": 1 },
      }),
    );
    const line = lines[0] ?? "";
    expect(line).toContain("x%C2%A0requestId=FORGED");
    expect(line).toContain("y%E3%80%80requestId=FORGED");
    expect(line).toContain('v="a\u2007requestId=FORGED"');
    expect(line).toContain('o="{\\"a b\\":1}"');
    expect(line).toMatch(/ requestId=REAL\n$/);
  });

  it("escapes a quote in the head, so it can't change how the line's quotes pair", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "REAL" }, () => {
      log.child({ domain: 'x"' }).info("Request received", { note: " requestId=FORGED " });
      log.info('Got "', { note: " requestId=FORGED " });
    });
    for (const line of lines) {
      const head = line.slice(0, line.indexOf(" note="));
      expect(head).not.toContain('"');
      expect(head).toContain("\\u0022");
      // Pairing the quotes, the only bare requestId is the real one.
      const unquoted = line.replaceAll(/"(?:[^"\\]|\\.)*"/g, '""');
      expect(unquoted.match(/ requestId=\S+/g)).toEqual([" requestId=REAL"]);
    }
  });

  it("reads right to a shell-like reader: no forged field, the real one kept, every line parses", () => {
    // Splits as POSIX `shlex` does: '…' literal, "…" with \ escapes, \ escaping outside quotes.
    const split = (line: string): string[] => {
      const tokens: string[] = [];
      let token: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const char = line.charAt(i);
        if (char === " " || char === "\n") {
          if (token !== null) tokens.push(token);
          token = null;
        } else if (char === "'") {
          const end = line.indexOf("'", i + 1);
          if (end === -1) throw new Error("No closing quotation");
          token = (token ?? "") + line.slice(i + 1, end);
          i = end;
        } else if (char === '"') {
          token = token ?? "";
          for (i++; i < line.length && line.charAt(i) !== '"'; i++) {
            if (line.charAt(i) === "\\" && '"\\$`'.includes(line.charAt(i + 1))) i++;
            token += line.charAt(i);
          }
          if (i >= line.length) throw new Error("No closing quotation");
        } else if (char === "\\") {
          if (i + 1 >= line.length) throw new Error("No escaped character");
          token = (token ?? "") + line.charAt(++i);
        } else token = (token ?? "") + char;
      }
      if (token !== null) tokens.push(token);
      return tokens;
    };
    const cases: Array<[string, Record<string, unknown>]> = [
      ["backslash key", { "requestId\\": "FORGED" }],
      ["trailing backslash", { path: "a\\" }],
      ["single quotes", { a: "'", b: "' requestId=FORGED '", c: "'" }],
      ["key holding =", { "requestId=FORGED": "v" }],
      ["object holding =", { o: { "requestId=FORGED": 1 } }],
      ["quote key", { "'": "' requestId=FORGED '" }],
      ["no fields", {}],
      ["comment key", { "#": "x", "#k": "v" }],
    ];
    for (const [domain, msg] of [
      ["d", "a\\ 'm"],
      ["a\\", "m\\"],
      ["x'", "m'"],
      ['y"', 'm"'],
      ["z=requestId=F", "m requestId=F"],
      ["#d", "Item #3 failed"],
    ]) {
      for (const [name, fields] of cases) {
        for (const context of [true, false]) {
          const { log, lines } = collect({ format: "text" });
          const write = () => log.child({ domain }).info(msg ?? "", fields);
          if (context) withRequestContext({ requestId: "REAL", userId: "U1" }, write);
          else write();
          const tokens = split((lines[0] ?? "").slice(0, -1));
          const ids = tokens.filter((token) => token.startsWith("requestId="));
          expect(ids, `${domain} ${name} ${context}`).toEqual(context ? ["requestId=REAL"] : []);
          if (context) expect(tokens.at(-1)).toBe("userId=U1");
        }
      }
    }
  });

  it("escapes ' inside quoted keys and values, and # wherever a word could start", () => {
    const { log, lines } = collect({ format: "text" });
    log.child({ domain: "#d" }).info("Item #3", { "x'": "a b'", "#k": "#v" });
    const line = lines[0] ?? "";
    expect(line).not.toContain("'");
    expect(line).toContain('x%27="a b\\u0027"');
    expect(line).toContain('%23k="#v"');
    // No word of the line starts with `#`: nothing reads as a comment.
    expect(line.split(" ").some((word) => word.startsWith("#"))).toBe(false);
  });

  it("escapes every occurrence, not only the first, in the head, keys and values", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "REAL", userId: "U1" }, () =>
      log.child({ domain: "#a#b" }).info(`x #1 #2 a=b=c \\ \\ ' ' " "`, {
        "a'b'c=d=e #f #g": `v' w' #h #i`,
      }),
    );
    const line = lines[0] ?? "";
    const head = line.slice(0, line.indexOf(" a%27"));
    for (const char of ["#", "=", "'", '"']) expect(head, char).not.toContain(char);
    // A backslash only ever starts an escape the logger wrote.
    expect(head).not.toMatch(/\\(?!u[0-9a-f]{4})/);
    expect(head.match(/\\u005c/g)).toHaveLength(2);
    expect(line).toContain("a%27b%27c%3Dd%3De%20%23f%20%23g=");
    expect(line).not.toContain("'");
    expect(line).toMatch(/ requestId=REAL userId=U1\n$/);
  });

  it("writes keys unquoted and distinct, an empty key as %, an empty value quoted", () => {
    const { log, lines } = collect({ format: "text" });
    log.info("m", { "": "e", e: "", A: 1, "%41": 2, "a b": 3, "a%20b": 4 });
    const line = lines[0] ?? "";
    expect(line).toContain(' %=e e="" A=1 %2541=2 a%20b=3 a%2520b=4');
    // Every key is one plain word: a strict logfmt reader takes them all.
    const keys = line
      .slice(line.indexOf(" m ") + 3)
      .replaceAll(/"(?:[^"\\]|\\.)*"/g, '""')
      .trim()
      .split(" ")
      .map((pair) => pair.slice(0, pair.indexOf("=")));
    expect(keys).toHaveLength(6);
    for (const key of keys) expect(key).toMatch(/^[^"'\s=]+$/);
  });

  it("encodes \" in keys; quotes values holding ', $ or a hidden letter", () => {
    const { log, lines } = collect({ format: "text" });
    log.info("m", { 'a"b': 1, v1: "x'y", v2: "a$b", v3: "\u3164" });
    expect(lines[0]).toContain(' a%22b=1 v1="x\\u0027y" v2="a$b" v3="\\u3164"');
  });

  it("escapes U+FFFD and lone surrogates in the head, and keeps surrogate keys apart", () => {
    const { log, lines } = collect({ format: "text" });
    withRequestContext({ requestId: "REAL", userId: "U1" }, () => {
      log
        .child({ domain: "\ufffd" })
        .info("Bad \ud800 \ufffd", JSON.parse('{"\\ud800":"a","\\udc00":"b","\\ufffd":"c"}'));
    });
    const line = lines[0] ?? "";
    expect(line).not.toMatch(/[\ufffd\ud800-\udfff]/u);
    expect(line).toContain("INFO  \\ufffd Bad \\ud800 \\ufffd ");
    expect(line).toContain(" %uD800=a %uDC00=b %EF%BF%BD=c requestId=REAL userId=U1");
  });

  it("quotes a value holding a combining mark: only letters and digits are plain", () => {
    const { log, lines } = collect({ format: "text" });
    log.info("m", { v: "a\u0301", w: "á" });
    expect(lines[0]).toContain(' v="a\u0301" w=á');
  });

  it("keeps the logger's domain, whatever a field says; an empty one counts as none", () => {
    const empty = collect();
    empty.log.child({ domain: "" }).info("z", { domain: "identity" });
    expect(JSON.parse(empty.lines[0] ?? "").domain).toBe("identity");
    const { log, lines } = collect();
    log.child({ domain: "submissions" }).info("x", { domain: "identity" });
    log.info("y", { domain: "feeds" });
    expect(lines.map((line) => JSON.parse(line).domain)).toEqual(["submissions", "feeds"]);
  });

  it("writes the request's user, whatever a field says", () => {
    for (const userId of ["FORGED", "", { a: 1 }]) {
      const { log, lines } = collect();
      withRequestContext({ requestId: "R", userId: "U1" }, () => log.info("m", { userId }));
      expect(JSON.parse(lines[0] ?? "").userId).toBe("U1");
    }
    // Outside a request, a field can name the user.
    const { log, lines } = collect();
    log.info("m", { userId: "U2" });
    expect(JSON.parse(lines[0] ?? "").userId).toBe("U2");
  });

  it("leaves a small domain that isn't a name out of the head", () => {
    const { log, lines } = collect();
    log.child({ domain: { a: 1 } }).info("m");
    expect(JSON.parse(lines[0] ?? "")).not.toHaveProperty("domain");
  });

  it("writes a __proto__ field as a field", () => {
    const { log, lines } = collect();
    log.info("m", JSON.parse('{"__proto__":{"a":1}}'));
    expect(lines[0]).toContain('"__proto__":{"a":1}');
  });

  it("caps the finished line: escaping and quoting can't take it past MAX_LINE", () => {
    for (const format of ["json", "text"] as const) {
      const { log, lines } = collect({ format });
      const error = new Error("\u0001".repeat(2000));
      log
        .child({ err: error })
        .error("m", { a: new Array(30).fill("\u0001".repeat(2000)), err: error });
      expect(lines[0]?.length).toBeLessThanOrEqual(MAX_LINE);
      expect(lines[0]).toContain("[too big]");
      expect(lines[0]).toContain("m");
    }
  });

  it("keeps the head when the fields go, and replaces the fields only past MAX_LINE", () => {
    const { log, lines } = collect();
    withRequestContext({ requestId: "R1", userId: "U1" }, () =>
      log.child({ domain: "submissions" }).event("version.released", {
        x: new Array(100).fill("\u0001".repeat(1990)),
      }),
    );
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      time: "2026-10-11T14:03:22.417Z",
      level: "info",
      msg: "Released",
      domain: "submissions",
      event: "version.released",
      requestId: "R1",
      userId: "U1",
      fields: "[too big]",
    });
    // Around the cap: each control character is written as six (`\\u0001`).
    const sized = (count: number) => {
      const { log, lines } = collect();
      log.info("m", { v: new Array(count).fill("\u0001".repeat(1999)) });
      return lines[0] ?? "";
    };
    const under = sized(10);
    const over = sized(12);
    expect(under.length).toBeGreaterThan(MAX_LINE * 0.9);
    expect(under).not.toContain("[too big]");
    expect(over.length).toBeLessThan(MAX_LINE);
    expect(JSON.parse(over).fields).toBe("[too big]");
  });

  it("leaves a domain or user that isn't a name out of the head, so the cap holds", () => {
    const { log, lines } = collect();
    const big = new Array(100).fill("\u0001".repeat(499));
    log.child({ domain: big }).info("m", { userId: big });
    withRequestContext({ requestId: "R", userId: big as never }, () => log.info("m"));
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE);
      const parsed = JSON.parse(line);
      expect(parsed).not.toHaveProperty("domain");
      expect(parsed).not.toHaveProperty("userId");
    }
  });

  it("writes a message or request ID over 64 KB as its length only", () => {
    const { log, lines } = collect();
    const huge = `${"x".repeat(70_000)}${"rmk_".padEnd(47, "Z")}`;
    withRequestContext({ requestId: huge }, () => log.info(huge));
    const parsed = JSON.parse(lines[0] ?? "");
    expect(parsed.msg).toBe(`[${huge.length} characters]`);
    expect(parsed.requestId).toBe(`[${huge.length} characters]`);
  });

  it("drops an event whose name isn't a string, never throws", () => {
    const { log } = collect();
    const hostile = {
      toString: () => {
        throw new Error("no");
      },
    };
    expect(() => log.event(hostile as never)).not.toThrow();
  });

  it("gives bindings and fields one budget", () => {
    const { log, lines } = collect();
    const big = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`k${i}`, "x".repeat(1999)]),
    );
    log.child({ a: big, b: big }).info("x", { c: big, d: big });
    expect(lines[0]?.length).toBeLessThan(70_000);
  });
});

describe("errors", () => {
  it("logs the stack at error, and not below", () => {
    const { log, parsed } = collect();
    const err = new Error("boom");
    log.error("Unexpected error", { err });
    log.warn("Recovered", { err });
    expect(parsed()[0]?.err).toHaveProperty("stack");
    expect(parsed()[1]?.err).not.toHaveProperty("stack");
  });
});

describe("never throwing", () => {
  it("writes a line with a cycle or a BigInt, the field marked", () => {
    const { log, parsed } = collect();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => log.info("x", { cycle, big: 1n, ok: 1 })).not.toThrow();
    expect(parsed()[0]).toMatchObject({
      cycle: "[unserialisable]",
      big: "[unserialisable]",
      ok: 1,
    });
  });

  it("writes a short line when the line can't be built, and nothing when it can't write", () => {
    const { log, parsed } = collect({
      now: () => {
        throw new Error("clock");
      },
    });
    expect(() => log.info("x")).not.toThrow();
    expect(parsed()).toEqual([expect.objectContaining({ level: "info", msg: "Unloggable line" })]);
    const broken = createLogger({
      level: "info",
      format: "json",
      write: () => {
        throw new Error("EPIPE");
      },
    });
    expect(() => broken.error("x")).not.toThrow();
  });
});

describe("LOG_LEVEL and LOG_FORMAT", () => {
  it("parses LOG_LEVEL, info when unset, info and invalid otherwise", () => {
    expect(parseLogLevel(undefined)).toEqual({ level: "info", invalid: false });
    expect(parseLogLevel("")).toEqual({ level: "info", invalid: false });
    expect(parseLogLevel(" DEBUG ")).toEqual({ level: "debug", invalid: false });
    expect(parseLogLevel("warn")).toEqual({ level: "warn", invalid: false });
    expect(parseLogLevel("verbose")).toEqual({ level: "info", invalid: true });
  });

  it("parses LOG_FORMAT: text or JSON as asked; unset, text in development (pnpm dev), else JSON", () => {
    expect(parseLogFormat(undefined)).toBe("json");
    expect(parseLogFormat("Text")).toBe("text");
    expect(parseLogFormat("pretty")).toBe("json");
    expect(parseLogFormat(undefined, "development")).toBe("text");
    expect(parseLogFormat("", "development")).toBe("text");
    expect(parseLogFormat("json", "development")).toBe("json");
    expect(parseLogFormat(undefined, "production")).toBe("json");
  });
});

describe("the shared logger", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setLoggerForTests();
  });

  const stdout = () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    return lines;
  };

  it("warns once about an invalid LOG_LEVEL, without its value, and uses info", () => {
    vi.stubEnv("LOG_LEVEL", "loud-secret-value");
    vi.stubEnv("LOG_FORMAT", "json");
    const lines = stdout();
    setLoggerForTests();
    logger.debug("hidden");
    logger.child({ domain: "feeds" }).info("shown");
    logger.info("shown too");
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed.map((line) => line.event ?? line.msg)).toEqual([
      "log.level_invalid",
      "shown",
      "shown too",
    ]);
    expect(parsed[1].domain).toBe("feeds");
    expect(lines.join("")).not.toContain("loud-secret-value");
  });

  it("makes a child of the shared logger even when its bindings can't be read", () => {
    const lines = stdout();
    setLoggerForTests();
    const hostile = {
      get domain(): string {
        throw new Error("boom");
      },
    };
    expect(() => logger.child(hostile).info("still here")).not.toThrow();
    expect(lines.join("")).toContain("still here");
  });

  it("goes on logging when the settings file can't be read", () => {
    vi.stubEnv("RONNE_ENV_FILE", tmpdir());
    vi.stubEnv("LOG_FORMAT", "json");
    const lines = stdout();
    setLoggerForTests();
    expect(() => logger.info("still here")).not.toThrow();
    expect(lines.join("")).toContain("still here");
  });

  it("survives a closed stdout: its error event doesn't crash the server", () => {
    stdout();
    createLogger({ level: "info", format: "json" }).info("x");
    expect(process.stdout.listenerCount("error")).toBeGreaterThan(0);
    expect(() => process.stdout.emit("error", new Error("write EPIPE"))).not.toThrow();
  });

  it("reads LOG_LEVEL and LOG_FORMAT from the environment", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    vi.stubEnv("LOG_FORMAT", "text");
    const lines = stdout();
    setLoggerForTests();
    logger.warn("hidden");
    logger.error("Failed");
    expect(lines).toHaveLength(1);
    // Coloured only when the test runner's stdout is a terminal.
    expect(String(lines[0]).replace("\u001b[31m", "").replace("\u001b[0m", "")).toMatch(
      /^\d\d:\d\d:\d\d\.\d{3} ERROR Failed\n$/,
    );
  });
});
