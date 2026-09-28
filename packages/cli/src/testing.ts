import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "./io.js";

/**
 * A fake registry and a temporary home for tests: `routes` answers `METHOD /api/v1/path`, and
 * every request is recorded. Not shipped: the build excludes it (tsconfig.build.json).
 */
export type RouteRequest = { body: unknown; headers: Record<string, string>; url: URL };
export type RouteAnswer = {
  status?: number;
  json?: unknown;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
};
export type Route = (request: RouteRequest) => RouteAnswer | Promise<RouteAnswer>;

export type FakeIo = Io & {
  requests: { method: string; path: string; headers: Record<string, string>; body: unknown }[];
  answers: string[];
  cleanup(): void;
};

export const fakeIo = (
  routes: Record<string, Route>,
  options: { env?: Record<string, string>; interactive?: boolean } = {},
): FakeIo => {
  const home = mkdtempSync(join(tmpdir(), "rmk-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "rmk-project-"));
  const io: FakeIo = {
    env: { ...options.env },
    home,
    cwd,
    interactive: options.interactive ?? true,
    requests: [],
    answers: [],
    prompt: async () => io.answers.shift() ?? "",
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      const headers = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      );
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      io.requests.push({ method, path: url.pathname + url.search, headers, body });
      const route =
        routes[`${method} ${url.pathname}`] ??
        routes[`${method} ${url.pathname.replace(/^\/api\/v1/, "")}`];
      if (!route)
        return Response.json(
          { error: { code: "not_found", message: `No route ${method} ${url.pathname}` } },
          { status: 404 },
        );
      const answer = await route({ body, headers, url });
      const status = answer.status ?? 200;
      if (status === 204 || status === 304)
        return new Response(null, { status, headers: answer.headers });
      if (answer.bytes)
        return new Response(Uint8Array.from(answer.bytes), { status, headers: answer.headers });
      return Response.json(answer.json ?? {}, { status, headers: answer.headers });
    }) as typeof fetch,
    cleanup: () => {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    },
  };
  return io;
};

export const REGISTRY = "https://ronne.example";

/** The routes 009 gives every registry, for a user with this token. */
export const identityRoutes = (token = "rmk_test_token"): Record<string, Route> => ({
  "POST /auth/token": ({ body }) =>
    (body as { password?: string }).password === "correct horse"
      ? {
          status: 201,
          json: { token, id: "t1", name: (body as { name: string }).name, expiresAt: null },
        }
      : {
          status: 401,
          json: { error: { code: "invalid_credentials", message: "Email or password is wrong." } },
        },
  "DELETE /auth/token": ({ headers }) =>
    headers.authorization === `Bearer ${token}`
      ? { status: 204 }
      : {
          status: 401,
          json: { error: { code: "token_invalid", message: "The access token isn't valid." } },
        },
  "GET /me": ({ headers }) =>
    headers.authorization === `Bearer ${token}`
      ? {
          json: {
            id: "u1",
            email: "dev@example.com",
            name: "Dev",
            role: "user",
            token: { id: "t1", name: "rmk on laptop", expiresAt: null },
          },
        }
      : {
          status: 401,
          json: { error: { code: "token_invalid", message: "The access token isn't valid." } },
        },
});
