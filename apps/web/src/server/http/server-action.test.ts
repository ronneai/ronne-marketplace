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

// Catches every unwrapped action someone could write by mistake: any file shape, extension or
// folder, a directive after comments or "use strict", most escapes Next cooks. Out of scope (owner,
// 2026-10-14): a deliberately escaped "use server" placed to slip past (inside a function, after a
// hashbang, around a comment, across a CRLF line continuation), and an export that differs under
// Vitest.
describe("every exported server action goes through serverAction (guard)", () => {
  const app = join(import.meta.dirname, "../../..");
  const self = join(import.meta.dirname, "server-action.test.ts");
  // Build output, the end-to-end tests and the dependencies at the top of apps/web. A folder with
  // one of these names deeper down is read like any other (Next builds what's in it).
  const TOP_SKIP = new Set(["node_modules", ".next", "e2e", "test-results", "playwright-report"]);
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory())
        return dir === app && TOP_SKIP.has(name) ? [] : sources(path);
      return /\.[cm]?[jt]sx?$/.test(name) && path !== self ? [path] : [];
    });
  /** The source after its leading blank lines and comments: where a directive would be. */
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
  /** A quoted string literal and nothing else: any escape, a line continuation included. */
  const LITERAL = /^(["'])(?:\\[\s\S]|(?!\1)[^\\\n])*\1/;
  /**
   * The file's directive prologue, each string read as JavaScript reads it (`"use\\u{20}server"`
   * and `"u\\se server"` are `use server` to Next too), and the source after it. The regex admits
   * a single string literal only, so evaluating it can do nothing but make that string.
   */
  const prologue = (source: string): { directives: string[]; rest: string } => {
    const directives: string[] = [];
    let rest = afterComments(source);
    for (let match = LITERAL.exec(rest); match; match = LITERAL.exec(rest)) {
      directives.push(Function(`"use strict"; return ${match[0]};`)());
      rest = afterComments(rest.slice(match[0].length).replace(/^\s*;/, ""));
    }
    return { directives, rest };
  };
  const DIRECTIVE = /["']use server["']/;
  const withDirective = sources(app).filter((file) => {
    const source = readFileSync(file, "utf8");
    return prologue(source).directives.includes("use server") || DIRECTIVE.test(source);
  });

  it("finds the action files", () => {
    expect(withDirective.length).toBeGreaterThanOrEqual(20);
  });

  it.each(withDirective.map((file) => [relative(app, file), file]))("%s", async (_name, file) => {
    const source = readFileSync(file, "utf8");
    // Server actions live in their own files: a "use server" anywhere but at a file's top would
    // be an inline action, which this guard (and the request's ID) couldn't reach.
    const { directives, rest } = prologue(source);
    expect(directives, "the directive opens the file").toContain("use server");
    expect(DIRECTIVE.test(rest), "no other use server in the file").toBe(false);
    // What the file really exports, however it's written: every value is a serverAction.
    const exported = Object.entries(await import(file));
    expect(exported.length).toBeGreaterThan(0);
    for (const [name, value] of exported) expect(isServerAction(value), name).toBe(true);
  });
});
