import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, setLoggerForTests } from "../log";
import { logRequestError } from "./request-error";
import { isServerAction, serverAction } from "./server-action";

const incoming = vi.hoisted(() => ({ headers: new Headers() as Headers | null }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (!incoming.headers) throw new Error("`headers` was called outside a request scope.");
    return incoming.headers;
  },
}));

let lines: Record<string, unknown>[] = [];
beforeEach(() => {
  lines = [];
  incoming.headers = new Headers();
  setLoggerForTests({
    level: "debug",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
});
afterEach(() => setLoggerForTests());

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("serverAction", () => {
  it("runs the action in the request's context: lines from what it calls carry the proxy's ID", async () => {
    incoming.headers = new Headers({ "x-request-id": "01K7PROXYSETTHIS0000000000" });
    const service = async (name: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.child({ domain: "submissions" }).info("Saved", { name });
      return name.length;
    };
    const save = serverAction(async (name: string) => service(name));
    expect(await save("draft")).toBe(5);
    expect(lines).toEqual([
      expect.objectContaining({ msg: "Saved", requestId: "01K7PROXYSETTHIS0000000000" }),
    ]);
  });

  it("writes no http.request line, and lets an error through for onRequestError", async () => {
    const fail = serverAction(async () => {
      throw new Error("boom");
    });
    await expect(fail()).rejects.toThrow("boom");
    expect(lines).toEqual([]);
  });

  it("makes an ID when the proxy's is missing or odd, and outside a request", async () => {
    for (const headers of [new Headers(), new Headers({ "x-request-id": "a b" }), null]) {
      lines = [];
      incoming.headers = headers;
      await serverAction(async () => logger.info("x"))();
      expect(lines[0]?.requestId).toMatch(ULID);
    }
  });
});

describe("logRequestError (onRequestError)", () => {
  it("writes one http.error line with the proxy's ID and the route's pattern", () => {
    logRequestError(
      new Error("render failed"),
      { "x-request-id": "01K7PAGE" },
      "/items/[scope]/[name]",
    );
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "http.error",
        domain: "http",
        requestId: "01K7PAGE",
        route: "/items/[scope]/[name]",
        err: expect.objectContaining({ message: "render failed", stack: expect.any(String) }),
      }),
    ]);
  });

  it("makes an ID when the header is missing or isn't one", () => {
    logRequestError("thrown string", {}, "/");
    logRequestError(new Error("x"), { "x-request-id": ["a", "b"] }, "/");
    expect(lines.map((line) => line.requestId)).toEqual([
      expect.stringMatching(ULID),
      expect.stringMatching(ULID),
    ]);
    expect(lines[0]?.err).toEqual({ type: "string" });
  });
});

describe("every exported server action goes through serverAction (guard)", () => {
  const app = join(import.meta.dirname, "../../..");
  const self = join(import.meta.dirname, "server-action.test.ts");
  // Build output and the end-to-end tests at the top of apps/web; node_modules anywhere. A folder
  // with one of these names deeper down is read like any other.
  const TOP_SKIP = new Set([".next", "e2e", "test-results", "playwright-report"]);
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory())
        return name === "node_modules" || (dir === app && TOP_SKIP.has(name)) ? [] : sources(path);
      return /\.[cm]?[jt]sx?$/.test(name) && path !== self ? [path] : [];
    });
  /** The source after its leading blank lines and comments: where a file's directive would be. */
  const afterComments = (source: string): string => {
    let at = 0;
    for (;;) {
      while (at < source.length && source.charAt(at).trim() === "") at++;
      if (source.startsWith("//", at)) {
        const end = source.indexOf("\n", at);
        at = end === -1 ? source.length : end + 1;
      } else if (source.startsWith("/*", at)) {
        const end = source.indexOf("*/", at + 2);
        at = end === -1 ? source.length : end + 2;
      } else return source.slice(at);
    }
  };
  /**
   * The string a file opens with, decoded (`"use\\x20server"` is `use server` to Next too), or null.
   */
  const openingString = (source: string): string | null => {
    const match = /^(["'])((?:\\.|(?!\1)[^\\\n])*)\1/.exec(afterComments(source));
    if (!match) return null;
    const body = (match[2] ?? "").replaceAll("\\'", "'").replaceAll('"', '\\"');
    try {
      return JSON.parse(`"${body.replaceAll(/\\x([0-9a-fA-F]{2})/g, "\\u00$1")}"`);
    } catch {
      return null;
    }
  };
  const DIRECTIVE = /["']use server["']/;
  const withDirective = sources(app).filter((file) => {
    const source = readFileSync(file, "utf8");
    return openingString(source) === "use server" || DIRECTIVE.test(source);
  });

  it("finds the action files", () => {
    expect(withDirective.length).toBeGreaterThanOrEqual(20);
  });

  it.each(withDirective.map((file) => [relative(app, file), file]))("%s", async (_name, file) => {
    const source = readFileSync(file, "utf8");
    // Server actions live in their own files: a "use server" anywhere but at a file's top would
    // be an inline action, which this guard (and the request's ID) couldn't reach.
    expect(openingString(source), "the directive opens the file").toBe("use server");
    const rest = afterComments(source).replace(/^(["'])(?:\\.|(?!\1)[^\\\n])*\1;?/, "");
    expect(DIRECTIVE.test(rest), "no other use server in the file").toBe(false);
    // What the file really exports, however it's written: every value is a serverAction.
    const exported = Object.entries(await import(file));
    expect(exported.length).toBeGreaterThan(0);
    for (const [name, value] of exported) expect(isServerAction(value), name).toBe(true);
  });
});
