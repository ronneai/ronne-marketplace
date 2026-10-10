import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shortItemName } from "@ronneai/core";
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
  /** Every question asked, in order. */
  questions: string[];
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
    questions: [],
    prompt: async (question) => {
      io.questions.push(question);
      return io.answers.shift() ?? "";
    },
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
    // An agent that preloads the skill in Claude Code (097).
    "@team/reviewer@1.0.0": await packItem(
      [
        {
          path: "ronne.yaml",
          bytes: text(
            'name: "@team/reviewer"\ntype: agent\ndescription: Reviews.\nagent:\n  prompt: prompt.md\ndependencies:\n  "@team/secure": "^1.0.0"\n',
          ),
        },
        { path: "prompt.md", bytes: text("Review the change.\n") },
      ],
      { version: "1.0.0" },
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
      if (names.includes("@team/reviewer"))
        items["@team/reviewer"] = {
          version: "1.0.0",
          type: "agent",
          sha256: sha("@team/reviewer@1.0.0"),
          dependencies: { "@team/secure": "1.1.0" },
        };
      if (names.includes("@team/secure") || names.includes("@team/reviewer")) {
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
    routes[`GET /items/team/${shortItemName(`@${name}`)}/${version}/tarball`] = () => ({
      bytes: item.tgz,
      headers: { "x-checksum-sha256": item.sha256, "content-type": "application/gzip" },
    });
  }
  return { routes, packed };
};
export { run } from "./cli.js";

export type FakeDraft = {
  id: string;
  name: string;
  type: string;
  files: unknown[];
  base?: string;
};

/**
 * The routes `rmk export` uses (037): the scopes, and a draft store that creates each upload, or
 * answers `fail` for the names in it.
 */
/** A draft the fake registry already has of the person's (051), as `GET /drafts` lists it. */
export type FakeOpenDraft = {
  id: string;
  name: string;
  type: string;
  status: "draft" | "changes_requested" | "submitted";
  updatedAt?: string;
  baseVersion?: string;
  /** What its `ronne.yaml` says (053); a registry before 053 doesn't list it. */
  description?: string | null;
};

/**
 * `GET /scopes` and `POST /drafts` (037). With `open`, also 051's `GET /drafts` and
 * `PUT /drafts/{id}`: the person's open drafts, newest first, which a POST adds to; without it,
 * the registry is older than 051 and answers neither.
 */
export const exportRoutes = (
  options: {
    scopes?: { name: string; description: string; workspace?: string }[];
    fail?: Record<string, { status: number; json?: unknown }>;
    open?: FakeOpenDraft[];
  } = {},
) => {
  const drafts: FakeDraft[] = [];
  /** Each PUT, by draft id: what replaced it. */
  const replaced: (FakeDraft & { status: string })[] = [];
  const open = options.open ? [...options.open] : null;
  const answer = (
    status: number,
    draft: { id: string; name: string; type: string; files: unknown[]; base?: string },
    draftStatus = "draft",
  ) => ({
    status,
    json: {
      id: draft.id,
      path: `/submissions/${draft.id}`,
      url: `${REGISTRY}/submissions/${draft.id}`,
      name: draft.name,
      type: draft.type,
      status: draftStatus,
      files: draft.files.length,
      bytes: 0,
      issues: [],
      submitIssues: [],
      proposal: draft.base ? { item: draft.name, baseVersion: draft.base, stale: null } : null,
    },
  });
  type Upload = { name: string; type: string; files: unknown[]; base?: string };
  const putRoute =
    (id: string): Route =>
    ({ body }) => {
      const upload = body as Upload;
      const failure = options.fail?.[upload.name];
      if (failure) return failure;
      const draft = open?.find((d) => d.id === id);
      if (!draft)
        return { status: 404, json: { error: { code: "draft_not_found", message: "No." } } };
      if (draft.status === "submitted")
        return { status: 409, json: { error: { code: "not_editable", message: "In review." } } };
      replaced.push({ id, ...upload, status: draft.status });
      return answer(200, { id, ...upload }, draft.status);
    };
  const routes: Record<string, Route> = {
    "GET /scopes": () => ({
      json: {
        scopes: options.scopes ?? [{ name: "team", description: "A team." }],
        nextCursor: null,
      },
    }),
    "POST /drafts": ({ body }) => {
      const upload = body as Upload;
      const failure = options.fail?.[upload.name];
      if (failure) return failure;
      const id = `01DRAFT${String(drafts.length + 1).padStart(19, "0")}`;
      drafts.push({ id, ...upload });
      if (open) {
        open.unshift({
          id,
          name: upload.name,
          type: upload.type,
          status: "draft",
          ...(upload.base ? { baseVersion: upload.base } : {}),
        });
        routes[`PUT /drafts/${id}`] = putRoute(id);
      }
      return answer(201, { id, ...upload });
    },
  };
  if (open) {
    routes["GET /drafts"] = ({ url }) => {
      const name = url.searchParams.get("name");
      return {
        json: {
          drafts: open
            .filter((d) => !name || d.name === name)
            .map((d) => ({
              id: d.id,
              path: `/submissions/${d.id}`,
              url: `${REGISTRY}/submissions/${d.id}`,
              name: d.name,
              type: d.type,
              status: d.status,
              updatedAt: d.updatedAt ?? "2026-10-01T12:00:00.000Z",
              proposal: d.baseVersion ? { item: d.name, baseVersion: d.baseVersion } : null,
              ...(d.description !== undefined ? { description: d.description } : {}),
            })),
        },
      };
    };
    for (const draft of open) routes[`PUT /drafts/${draft.id}`] = putRoute(draft.id);
  }
  return { routes, drafts, replaced };
};

/** A draft the fake registry knows for `rmk submit` (052): its check result is fixed. */
export type FakeSubmitDraft = {
  id: string;
  name: string;
  type: string;
  status: "draft" | "changes_requested" | "submitted";
  /** What Submit would refuse; none means ready. */
  errors?: { code: string; message: string }[];
  updatedAt?: string;
  /** Its dependency drafts' ids (056): the check includes them first unless `dependencies: false`. */
  includes?: string[];
  /** In a workspace the person isn't a member of (091): checked as `not_a_member`. */
  notAMemberOf?: string;
  /** Removed from this workspace between the check and the submit: submitted as `not_a_member`. */
  removedFrom?: string;
};

/**
 * 052's endpoints over a fixed set of the person's drafts: `GET /drafts?name=`,
 * `POST /drafts/check` and `POST /drafts/submit`. `taken` are ids that stop being ready between
 * the check and the submit. Submitted ones are recorded in `submitted`.
 */
export const submitRoutes = (drafts: FakeSubmitDraft[], taken: string[] = []) => {
  const submitted: string[] = [];
  const place = (d: FakeSubmitDraft) => ({
    path: `/submissions/${d.id}`,
    url: `${REGISTRY}/submissions/${d.id}`,
    name: d.name,
    type: d.type,
    status: d.status,
    ...(d.notAMemberOf ? { workspace: d.notAMemberOf } : {}),
  });
  const issuesOf = (d: FakeSubmitDraft) =>
    (d.errors ?? []).map((e) => ({ severity: "error", ...e }));
  const selected = (body: unknown) => {
    const { ids, all } = body as { ids?: string[]; all?: boolean };
    return all ? drafts.filter((d) => d.status !== "submitted").map((d) => d.id) : (ids ?? []);
  };
  /** The selection with each one's dependency drafts first, and who they're included for (056). */
  const expanded = (body: unknown) => {
    const picked = selected(body);
    const includedFor = new Map<string, string[]>();
    if ((body as { dependencies?: boolean }).dependencies === false)
      return { ids: picked, includedFor };
    const ids: string[] = [];
    for (const id of picked) {
      const d = drafts.find((x) => x.id === id);
      for (const dep of d?.includes ?? []) {
        if (!picked.includes(dep))
          includedFor.set(dep, [...(includedFor.get(dep) ?? []), d?.name ?? id]);
        if (!ids.includes(dep)) ids.push(dep);
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return { ids, includedFor };
  };
  const routes: Record<string, Route> = {
    "GET /drafts": ({ url }) => ({
      json: {
        drafts: drafts
          .filter((d) => d.name === url.searchParams.get("name"))
          .map((d) => ({
            id: d.id,
            ...place(d),
            updatedAt: d.updatedAt ?? "2026-10-01T12:00:00.000Z",
            proposal: null,
            description: null,
          })),
      },
    }),
    "POST /drafts/check": ({ body }) => {
      const { ids, includedFor } = expanded(body);
      return {
        json: {
          drafts: ids.map((id) => {
            const d = drafts.find((x) => x.id === id);
            const included = includedFor.has(id) ? { includedFor: includedFor.get(id) } : {};
            if (!d) return { id, result: "not_found", ready: false };
            if (d.status === "submitted")
              return { id, result: "not_submittable", ready: false, ...place(d) };
            if (d.notAMemberOf)
              return {
                id,
                result: "not_a_member",
                ready: false,
                ...place(d),
                issues: [
                  {
                    severity: "error",
                    code: "not_a_member",
                    message: `You aren't a member of the ${d.notAMemberOf} workspace. Ask to join ${d.notAMemberOf} to propose changes.`,
                  },
                ],
              };
            // A dependent whose dependency drafts are included is ready once they are.
            const issues = d.includes?.length && ids.length > 1 ? [] : issuesOf(d);
            return {
              id,
              result: issues.length ? "not_ready" : "ready",
              ready: issues.length === 0,
              ...place(d),
              issues,
              ...included,
              ...(d.includes?.length ? { needs: d.includes } : {}),
            };
          }),
          more: 0,
        },
      };
    },
    "POST /drafts/submit": ({ body }) => ({
      json: {
        results: selected(body).map((id) => {
          const d = drafts.find((x) => x.id === id);
          if (!d) return { id, result: "not_found" };
          if (taken.includes(id))
            return {
              id,
              result: "not_ready",
              ...place(d),
              issues: [{ severity: "error", code: "name_taken", message: `${d.name} is taken.` }],
            };
          if (d.removedFrom)
            return {
              id,
              result: "not_a_member",
              ...place(d),
              workspace: d.removedFrom,
              issues: [
                {
                  severity: "error",
                  code: "not_a_member",
                  message: `You aren't a member of the ${d.removedFrom} workspace.`,
                },
              ],
            };
          submitted.push(id);
          return {
            id,
            result: d.status === "changes_requested" ? "resubmitted" : "submitted",
            ...place(d),
            status: "submitted",
            revision: 1,
            issues: [],
          };
        }),
        more: 0,
      },
    }),
  };
  return { routes, submitted };
};
