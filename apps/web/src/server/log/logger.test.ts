import { afterEach, describe, expect, it, vi } from "vitest";
import { setRequestUser, withRequestContext } from "./context";
import { EVENTS, LOG_LEVELS, type LogLevel } from "./events";
import { logger, setLoggerForTests } from "./index";
import { createLogger, type LoggerOptions, parseLogFormat, parseLogLevel } from "./logger";

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
      "14:03:22.417 INFO  submissions version.released Released requestId=01K7 count=3\n",
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

  it("parses LOG_FORMAT, JSON unless text", () => {
    expect(parseLogFormat(undefined)).toBe("json");
    expect(parseLogFormat("Text")).toBe("text");
    expect(parseLogFormat("pretty")).toBe("json");
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
