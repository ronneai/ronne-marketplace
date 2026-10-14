import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, setLoggerForTests } from "../log";
import { logRequestError } from "./request-error";
import { serverAction } from "./server-action";

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
  const src = join(import.meta.dirname, "../..");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const files = sources(src).filter((file) =>
    /^["']use server["'];/.test(readFileSync(file, "utf8")),
  );

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it.each(files.map((file) => [relative(src, file), file]))("%s", (_name, file) => {
    const source = readFileSync(file, "utf8");
    const exports = [...source.matchAll(/^export (?!type )(.*)$/gm)].map((match) => match[1] ?? "");
    expect(exports.length).toBeGreaterThan(0);
    for (const line of exports) expect(line).toMatch(/^const \w+ = serverAction\(/);
  });
});
