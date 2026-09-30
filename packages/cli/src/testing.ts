import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packItem } from "@ronneai/core/pack";
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

const text = (value: string) => new TextEncoder().encode(value);

/** A registry with a skill (1.0.0 and 1.1.0), an MCP server the skill needs, and a hook. */
export const buildRegistry = async () => {
  const skill = async (version: string, body: string) =>
    packItem(
      [
        {
          path: "ronne.yaml",
          bytes: text(
            `name: "@team/secure"\ntype: skill\ndescription: Secure.\nskill:\n  entry: SKILL.md\ndependencies:\n  "@team/gh": "^1.0.0"\n`,
          ),
        },
        {
          path: "SKILL.md",
          bytes: text(`---\nname: secure\ndescription: Secure.\n---\n${body}\n`),
        },
      ],
      { version },
    );
  const packed = {
    "@team/secure@1.0.0": await skill("1.0.0", "Check inputs."),
    "@team/secure@1.1.0": await skill("1.1.0", "Check inputs and secrets."),
    "@team/gh@1.2.0": await packItem(
      [
        {
          path: "ronne.yaml",
          bytes: text(
            'name: "@team/gh"\ntype: mcp-server\ndescription: GitHub.\nmcp-server:\n  transport: stdio\n  command: npx\n  env:\n    - name: GITHUB_TOKEN\n      required: true\n      secret: true\n',
          ),
        },
      ],
      { version: "1.2.0" },
    ),
    "@team/fmt@1.0.0": await packItem(
      [
        {
          path: "ronne.yaml",
          bytes: text(
            'name: "@team/fmt"\ntype: hook\ndescription: Formats.\nhook:\n  event: tool.after\n  matcher:\n    tool: edit\n  run:\n    command: "npx biome format --write"\n',
          ),
        },
      ],
      { version: "1.0.0" },
    ),
  };
  const sha = (key: keyof typeof packed) => packed[key].sha256;
  const resolutions: Record<string, unknown> = {
    "@team/secure": {
      items: {
        "@team/gh": {
          version: "1.2.0",
          type: "mcp-server",
          sha256: sha("@team/gh@1.2.0"),
          dependencies: {},
        },
        "@team/secure": {
          version: "1.1.0",
          type: "skill",
          sha256: sha("@team/secure@1.1.0"),
          dependencies: { "@team/gh": "1.2.0" },
        },
      },
      warnings: [],
    },
  };
  const routes: Record<string, Route> = {
    ...identityRoutes(),
    "POST /resolve": ({ body }) => {
      const { dependencies, locked } = body as {
        dependencies: Record<string, string>;
        locked?: Record<string, string>;
      };
      const names = Object.keys(dependencies).sort();
      if (names.includes("@team/nope"))
        return {
          status: 404,
          json: {
            error: { code: "item_not_found", message: "@team/nope isn't a published item." },
          },
        };
      const items: Record<string, unknown> = {};
      if (names.includes("@team/secure")) {
        const version = locked?.["@team/secure"] ?? "1.1.0";
        items["@team/secure"] = {
          version,
          type: "skill",
          sha256: sha(`@team/secure@${version}` as keyof typeof packed),
          dependencies: { "@team/gh": "1.2.0" },
        };
        items["@team/gh"] = {
          version: "1.2.0",
          type: "mcp-server",
          sha256: sha("@team/gh@1.2.0"),
          dependencies: {},
        };
      }
      if (names.includes("@team/fmt"))
        items["@team/fmt"] = {
          version: "1.0.0",
          type: "hook",
          sha256: sha("@team/fmt@1.0.0"),
          dependencies: {},
        };
      return {
        json: {
          items,
          warnings: names.includes("@team/fmt")
            ? [
                {
                  item: "@team/fmt",
                  version: "1.0.0",
                  code: "deprecated",
                  message: "Use @team/fmt2.",
                },
              ]
            : [],
        },
      };
    },
  };
  const versionRow = (version: string, key: keyof typeof packed, yanked = false) => ({
    version,
    publishedAt: "2026-09-20T00:00:00.000Z",
    sha256: packed[key].sha256,
    size: packed[key].size,
    deprecated: null,
    yanked,
    dependencies: {},
  });
  routes["GET /items/team/secure"] = () => ({
    json: {
      name: "@team/secure",
      type: "skill",
      description: "Secure.",
      owner: "Ada",
      downloads: 0,
      tags: { latest: "1.1.0" },
      versions: [
        versionRow("1.1.0", "@team/secure@1.1.0"),
        versionRow("1.0.0", "@team/secure@1.0.0"),
      ],
    },
  });
  routes["GET /items/team/gh"] = () => ({
    json: {
      name: "@team/gh",
      type: "mcp-server",
      description: "GitHub.",
      owner: "Ada",
      downloads: 0,
      tags: { latest: "1.2.0" },
      versions: [versionRow("1.2.0", "@team/gh@1.2.0")],
    },
  });
  routes["GET /items/team/fmt"] = () => ({
    json: {
      name: "@team/fmt",
      type: "hook",
      description: "Formats.",
      owner: "Ada",
      downloads: 0,
      tags: { latest: "1.0.0" },
      versions: [versionRow("1.0.0", "@team/fmt@1.0.0")],
    },
  });
  for (const [key, item] of Object.entries(packed)) {
    const [name, version] = key.split("@").slice(1);
    routes[`GET /items/team/${name?.split("/")[1]}/${version}/tarball`] = () => ({
      bytes: item.tgz,
      headers: { "x-checksum-sha256": item.sha256, "content-type": "application/gzip" },
    });
  }
  return { routes, packed };
};
export { run } from "./cli.js";

export type FakeDraft = { id: string; name: string; type: string; files: unknown[] };

/**
 * The routes `rmk export` uses (037): the scopes, and a draft store that creates each upload, or
 * answers `fail` for the names in it.
 */
export const exportRoutes = (
  options: {
    scopes?: { name: string; description: string }[];
    fail?: Record<string, { status: number; json?: unknown }>;
  } = {},
) => {
  const drafts: FakeDraft[] = [];
  const routes: Record<string, Route> = {
    "GET /scopes": () => ({
      json: {
        scopes: options.scopes ?? [{ name: "team", description: "A team." }],
        nextCursor: null,
      },
    }),
    "POST /drafts": ({ body }) => {
      const upload = body as { name: string; type: string; files: unknown[] };
      const failure = options.fail?.[upload.name];
      if (failure) return failure;
      const id = `01DRAFT${String(drafts.length + 1).padStart(19, "0")}`;
      drafts.push({ id, ...upload });
      return {
        status: 201,
        json: {
          id,
          path: `/submissions/${id}`,
          url: `${REGISTRY}/submissions/${id}`,
          name: upload.name,
          type: upload.type,
          status: "draft",
          files: upload.files.length,
          bytes: 0,
          issues: [],
          submitIssues: [],
        },
      };
    },
  };
  return { routes, drafts };
};
