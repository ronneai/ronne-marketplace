import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, setLoggerForTests } from "../log";
import { apiRoute } from "./api-route";
import { requireToken } from "./require-token";

const config = vi.hoisted(() => ({ trustProxy: false }));
vi.mock("../config", async (original) => ({
  ...(await original<typeof import("../config")>()),
  loadConfig: () => ({ trustProxy: config.trustProxy }),
}));

let lines: Record<string, unknown>[] = [];
beforeEach(() => {
  lines = [];
  config.trustProxy = false;
  setLoggerForTests({
    level: "debug",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
});
afterEach(() => setLoggerForTests());

const request = (headers: Record<string, string> = {}, method = "GET") =>
  new Request("http://localhost/api/v1/items/acme/secret-name", { method, headers });

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("apiRoute", () => {
  it("sets X-Request-Id and writes http.request with the route's pattern, status and time", async () => {
    const GET = apiRoute("/api/v1/items/[scope]/[name]", async () => Response.json({ ok: true }));
    const response = await GET(request(), {});
    const id = response.headers.get("x-request-id") ?? "";
    expect(id).toMatch(ULID);
    expect(lines).toEqual([
      expect.objectContaining({
        level: "info",
        event: "http.request",
        domain: "http",
        requestId: id,
        method: "GET",
        route: "/api/v1/items/[scope]/[name]",
        status: 200,
        ms: expect.any(Number),
      }),
    ]);
    // The filled-in path (a private item's name) never reaches the line.
    expect(JSON.stringify(lines)).not.toContain("secret-name");
  });

  it("gives every line the handler and what it calls write the request's ID", async () => {
    const service = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.child({ domain: "items" }).info("Looked up");
    };
    const GET = apiRoute("/api/v1/items", async () => {
      await service();
      return new Response("ok");
    });
    const response = await GET(request(), {});
    const id = response.headers.get("x-request-id");
    expect(lines.map((line) => [line.msg, line.requestId])).toEqual([
      ["Looked up", id],
      ["Request handled", id],
    ]);
  });

  it("uses an incoming X-Request-Id only with TRUST_PROXY=true, and only when well formed", async () => {
    const GET = apiRoute("/api/health", async () => new Response("ok"));
    const id = async (incoming: string, trust: boolean) => {
      config.trustProxy = trust;
      return (await GET(request({ "x-request-id": incoming }), {})).headers.get("x-request-id");
    };
    expect(await id("abc-123.X_y", true)).toBe("abc-123.X_y");
    expect(await id("abc-123", false)).toMatch(ULID);
    expect(await id("a".repeat(128), true)).toBe("a".repeat(128));
    for (const bad of ["a".repeat(129), "a b", "a\tb", "rmk_é", "a;b", ""])
      expect(await id(bad, true), bad).toMatch(ULID);
  });

  it("writes one http.error line for an unexpected error, and a 500 in the API's error shape", async () => {
    const GET = apiRoute("/api/v1/me", async () => {
      throw new Error("database exploded");
    });
    const response = await GET(request(), {});
    const id = response.headers.get("x-request-id") ?? "";
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: `Something went wrong on the server. Quote request ${id} to report it.`,
      },
    });
    const errors = lines.filter((line) => line.event === "http.error");
    expect(errors).toEqual([
      expect.objectContaining({
        level: "error",
        requestId: id,
        route: "/api/v1/me",
        err: expect.objectContaining({ message: "database exploded", stack: expect.any(String) }),
      }),
    ]);
    // The request line says 500, at error.
    expect(lines.at(-1)).toMatchObject({ event: "http.request", status: 500, level: "error" });
  });

  it("writes http.request at warn for a rate limit, at info otherwise", async () => {
    for (const [status, level] of [
      [200, "info"],
      [404, "info"],
      [429, "warn"],
      [503, "error"],
    ] as const) {
      lines = [];
      const GET = apiRoute("/api/v1/x", async () => new Response(null, { status }));
      await GET(request(), {});
      expect(lines.at(-1), String(status)).toMatchObject({ status, level });
    }
  });

  it("sets the header on a response whose headers can't be changed", async () => {
    const frozen = Response.redirect("http://localhost/elsewhere", 307);
    const GET = apiRoute("/api/v1/x", async () => frozen);
    const response = await GET(request(), {});
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/elsewhere");
    expect(response.headers.get("x-request-id")).toMatch(ULID);
  });

  it("records the token's user on the request's lines, http.request included", async () => {
    const GET = apiRoute("/api/v1/me", async (req: Request) => {
      const guard = await requireToken(req, {
        ready: async () => true,
        authenticate: async () => ({ ok: true, value: { user: { id: "01USER" } } }) as never,
      });
      logger.info("After the token");
      return new Response(guard.ok ? "ok" : "no");
    });
    await GET(request(), {});
    expect(lines.map((line) => [line.msg, line.userId])).toEqual([
      ["After the token", "01USER"],
      ["Request handled", "01USER"],
    ]);
  });

  it("lets Next's own signals through, unlogged", async () => {
    const signal = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/x;307;",
    });
    const GET = apiRoute("/api/v1/x", async () => {
      throw signal;
    });
    await expect(GET(request(), {})).rejects.toBe(signal);
    expect(lines.filter((line) => line.event === "http.error")).toEqual([]);
  });
});

describe("every API route goes through apiRoute (guard)", () => {
  const apiDir = join(import.meta.dirname, "../../app/api");
  const routeFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return routeFiles(path);
      return name === "route.ts" ? [path] : [];
    });
  const files = routeFiles(apiDir);
  const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThanOrEqual(22);
  });

  it.each(files.map((file) => [relative(apiDir, file), file]))("%s", (_name, file) => {
    const source = readFileSync(file, "utf8");
    const pattern = `/api/${relative(apiDir, file).replace(/\/?route\.ts$/, "")}`;
    // Every exported method is a constant made by apiRoute with this file's pattern.
    const wrapped = new Set(
      [...source.matchAll(/^(?:export )?const (\w+) = apiRoute\(\s*"([^"]+)"/gm)].map((match) => {
        expect(match[2], `${match[1]}'s route`).toBe(pattern);
        return match[1];
      }),
    );
    const exported = [
      ...[...source.matchAll(/^export const (\w+)/gm)].map((match) => match[1] ?? ""),
      ...[...source.matchAll(/^export \{([^}]+)\}/gm)]
        .flatMap((match) =>
          (match[1] ?? "").split(",").map((part) => part.trim().split(/\s+as\s+/)),
        )
        .map(([local, name]) => `${local}:${name ?? local}`),
    ];
    const methods = exported.filter((name) => METHODS.includes(name.split(":").at(-1) ?? name));
    expect(methods.length, "exports a method").toBeGreaterThan(0);
    for (const method of methods) {
      const local = method.split(":")[0] ?? method;
      expect(wrapped.has(local), `${method} goes through apiRoute`).toBe(true);
    }
    // Nothing else is exported as a handler some other way.
    expect(source).not.toMatch(/^export (async )?function/m);
  });
});
