import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { kyselySubmissionRepository } from "../domains/submissions/repositories/kysely-submission-repository";
import { type DraftsApiDeps, getScopes, postDraft } from "./drafts-api";
import { createUploadLimiter } from "./upload-rate-limit";

let t: TestDb;
let app: AppAuth;
let deps: DraftsApiDeps;
/** A token for each role. */
let tokens: { user: string; moderator: string; root: string };
let rootId: string;
let teamId: string;
const BASE = "http://localhost:3000/api/v1";
const password = "correct horse battery";

const tokenFor = async (email: string) => {
  const result = await exchangePassword({ email, password, name: "test" }, new Headers(), app);
  if (!result.ok) throw new Error(`no token for ${email}`);
  return result.token.token;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  deps = {
    app,
    guard: { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
    limiter: createUploadLimiter(),
    publicUrl: "https://ronne.example/",
  };
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  await createTestUser(app, { email: "u@example.com", password });
  await createTestUser(app, { email: "m@example.com", password, role: "moderator" });
  tokens = {
    user: await tokenFor("u@example.com"),
    moderator: await tokenFor("m@example.com"),
    root: await tokenFor("root@example.com"),
  };
  const scopes = kyselyScopeRepository(t.db, t.dialect);
  for (const [name, description] of [
    ["team", "A team."],
    ["platform", "Shared tools."],
    ["security", "The security team."],
  ] as const) {
    const id = await scopes.insert({ name, description, createdBy: null, createdAt: new Date() });
    if (name === "team") teamId = id;
  }
});
afterEach(() => t.cleanup());

const get = (path: string, auth: string | null = tokens.user) =>
  new Request(`${BASE}${path}`, {
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
  });

const body = async (response: Response) => ({
  status: response.status,
  json: await response.json(),
});

describe("GET /scopes", () => {
  it("lists scopes by name, with their descriptions, for every role", async () => {
    for (const token of Object.values(tokens)) {
      const response = await getScopes(get("/scopes", token), deps);
      expect(response.headers.get("cache-control")).toBe("private, no-cache");
      expect(await body(response)).toEqual({
        status: 200,
        json: {
          scopes: [
            { name: "platform", description: "Shared tools." },
            { name: "security", description: "The security team." },
            { name: "team", description: "A team." },
          ],
          nextCursor: null,
        },
      });
    }
  });

  it("searches and pages with a limit", async () => {
    const names = async (query: string) =>
      (await body(await getScopes(get(`/scopes${query}`), deps))).json.scopes.map(
        (s: { name: string }) => s.name,
      );
    expect(await names("?q=SECUR")).toEqual(["security"]);
    const first = await body(await getScopes(get("/scopes?limit=2"), deps));
    expect(first.json.scopes.map((s: { name: string }) => s.name)).toEqual([
      "platform",
      "security",
    ]);
    expect(await names(`?limit=2&cursor=${first.json.nextCursor}`)).toEqual(["team"]);
  });

  it("refuses a bad query, and requests without a valid token", async () => {
    for (const query of ["?limit=0", "?limit=101", "?limit=x", `?q=${"a".repeat(101)}`]) {
      const { status, json } = await body(await getScopes(get(`/scopes${query}`), deps));
      expect([status, json.error.code], query).toEqual([400, "invalid_request"]);
    }
    const missing = await body(await getScopes(get("/scopes", null), deps));
    expect([missing.status, missing.json.error.code]).toEqual([401, "token_missing"]);
    const invalid = await body(await getScopes(get("/scopes", "rmk_nope"), deps));
    expect([invalid.status, invalid.json.error.code]).toEqual([401, "token_invalid"]);
  });
});

describe("POST /drafts", () => {
  const manifest = (name = "@team/secure-coding", extra = "") =>
    `name: "${name}"\ntype: skill\ndescription: Checks code.\n${extra}`;
  const skillMd = "---\nname: secure-coding\ndescription: Checks code.\n---\nBe careful.\n";
  const files = (yaml = manifest()) => [
    { path: "ronne.yaml", encoding: "utf8", content: yaml },
    { path: "SKILL.md", encoding: "utf8", content: skillMd },
    { path: "scripts/check.sh", encoding: "utf8", content: "#!/bin/sh\n", executable: true },
  ];
  /** A valid upload, with some fields replaced. */
  const upload = (overrides: Record<string, unknown> = {}) => ({
    name: "@team/secure-coding",
    type: "skill",
    files: files(),
    ...overrides,
  });
  const post = (payload: unknown, auth: string | null = tokens.user) =>
    new Request(`${BASE}/drafts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const counts = async () => {
    const count = async (table: "submissions" | "submission_files") =>
      Number(
        (
          await t.db
            .selectFrom(table)
            .select((eb) => eb.fn.countAll().as("n"))
            .executeTakeFirstOrThrow()
        ).n,
      );
    return {
      drafts: await count("submissions"),
      files: await count("submission_files"),
      uploads: (
        await t.db
          .selectFrom("audit_log")
          .select("id")
          .where("action", "=", "submission.draft_created")
          .execute()
      ).length,
    };
  };

  it("creates the draft with its files as the token's user, and says where it is", async () => {
    const response = await postDraft(post(upload()), deps);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { status, json } = await body(response);
    expect(status).toBe(201);
    expect(json).toEqual({
      id: expect.any(String),
      path: `/submissions/${json.id}`,
      url: `https://ronne.example/submissions/${json.id}`,
      name: "@team/secure-coding",
      type: "skill",
      status: "draft",
      files: 3,
      bytes: files().reduce((sum, file) => sum + Buffer.byteLength(file.content), 0),
      issues: [],
      submitIssues: [],
    });
    const repo = kyselySubmissionRepository(t.db, t.dialect);
    const user = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "u@example.com")
      .executeTakeFirstOrThrow();
    expect((await repo.find(json.id))?.authorId).toBe(user.id);
    expect((await repo.files(json.id)).map((f) => [f.path, f.executable])).toEqual([
      ["SKILL.md", false],
      ["ronne.yaml", false],
      ["scripts/check.sh", true],
    ]);
    expect(await counts()).toEqual({ drafts: 1, files: 3, uploads: 1 });
  });

  it("gives no url without a public address", async () => {
    const { json } = await body(await postDraft(post(upload()), { ...deps, publicUrl: null }));
    expect([json.path, json.url]).toEqual([`/submissions/${json.id}`, null]);
  });

  it("creates a draft with errors, listing them in issues", async () => {
    const { status, json } = await body(
      await postDraft(post(upload({ files: files(manifest("@team/other")) })), deps),
    );
    expect(status).toBe(201);
    expect(json.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", code: "name_mismatch", file: "ronne.yaml" }),
      ]),
    );
  });

  it("says what Submit would refuse: a taken name, an unreleased dependency", async () => {
    await kyselyItemRepository(t.db, t.dialect).insertItem({
      scopeId: teamId,
      name: "secure-coding",
      type: "skill",
      description: "Published.",
      ownerId: rootId,
      createdAt: new Date(),
    });
    const withDependency = manifest(
      "@team/secure-coding",
      'dependencies:\n  "@team/not-yet": ^1.0.0\n',
    );
    const { status, json } = await body(
      await postDraft(post(upload({ files: files(withDependency) })), deps),
    );
    expect(status).toBe(201);
    expect(json.submitIssues.map((issue: { code: string }) => issue.code)).toEqual([
      "name_taken",
      "dependency_not_found",
    ]);
    expect(json.status).toBe("draft");
  });

  it("answers each refusal with its code, and leaves nothing behind", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    const cases: [unknown, number, string][] = [
      ["not json", 400, "invalid_request"],
      [[], 400, "invalid_request"],
      [{ name: "@team/x", type: "skill" }, 400, "invalid_request"],
      [upload({ files: [{ path: "ronne.yaml", content: "x" }] }), 400, "invalid_request"],
      [upload({ files: [{ ...files()[0], executable: "yes" }] }), 400, "invalid_request"],
      [upload({ name: "team/secure-coding" }), 400, "invalid_name"],
      [upload({ name: "@team/No Spaces" }), 400, "invalid_name"],
      [upload({ type: "skil" }), 400, "invalid_type"],
      [
        upload({ files: [...files(), { path: "../x", encoding: "utf8", content: "" }] }),
        400,
        "invalid_path",
      ],
      [upload({ files: [...files(), files()[1]] }), 400, "invalid_path"],
      [
        upload({ files: [...files(), { path: "a.png", encoding: "base64", content: "no!" }] }),
        400,
        "invalid_content",
      ],
      [upload({ files: files().slice(1) }), 400, "manifest_required"],
      [upload({ name: "@nowhere/secure-coding" }), 404, "scope_not_found"],
      [
        upload({ files: [...files(), { path: "big.md", encoding: "utf8", content: big }] }),
        413,
        "file_too_large",
      ],
      [
        upload({
          files: [
            ...files(),
            ...Array.from({ length: 500 }, (_, i) => ({
              path: `f${i}.md`,
              encoding: "utf8",
              content: "",
            })),
          ],
        }),
        413,
        "draft_too_large",
      ],
    ];
    for (const [payload, status, code] of cases) {
      const { json, ...rest } = await body(await postDraft(post(payload), deps));
      expect([rest.status, json.error.code], JSON.stringify(payload).slice(0, 80)).toEqual([
        status,
        code,
      ]);
    }
    expect(await counts()).toEqual({ drafts: 0, files: 0, uploads: 0 });
  });

  it("refuses a body over 28 MiB, with or without content-length", async () => {
    const payload = JSON.stringify(upload({ padding: "x".repeat(28 * 1024 * 1024) }));
    const withLength = post(payload);
    withLength.headers.set("content-length", String(payload.length));
    for (const request of [post(payload), withLength]) {
      const { status, json } = await body(await postDraft(request, deps));
      expect([status, json.error.code]).toEqual([413, "body_too_large"]);
    }
    expect(await counts()).toEqual({ drafts: 0, files: 0, uploads: 0 });
  });

  it("refuses the 51st draft", async () => {
    const repo = kyselySubmissionRepository(t.db, t.dialect);
    const user = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "u@example.com")
      .executeTakeFirstOrThrow();
    for (let i = 0; i < 50; i += 1)
      await repo.insert({
        authorId: user.id,
        scopeId: teamId,
        name: `d${i}`,
        type: "rule",
        status: "draft",
        createdAt: new Date(),
      });
    const { status, json } = await body(await postDraft(post(upload()), deps));
    expect([status, json.error.code, json.error.details]).toEqual([
      409,
      "draft_limit",
      { limit: 50 },
    ]);
    expect((await postDraft(post(upload(), tokens.moderator), deps)).status).toBe(201);
  });

  it("refuses the 31st upload in 10 minutes from one user, with retry-after", async () => {
    for (let i = 0; i < 30; i += 1)
      expect((await postDraft(post("not json"), deps)).status).toBe(400);
    const response = await postDraft(post(upload()), deps);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await body(response)).json.error.code).toBe("rate_limited");
    expect((await postDraft(post(upload(), tokens.root), deps)).status).toBe(201);
  });

  it("needs a valid token, before anything else", async () => {
    const missing = await body(await postDraft(post("not json", null), deps));
    expect([missing.status, missing.json.error.code]).toEqual([401, "token_missing"]);
    const invalid = await body(await postDraft(post(upload(), "rmk_nope"), deps));
    expect([invalid.status, invalid.json.error.code]).toEqual([401, "token_invalid"]);
    expect(await counts()).toEqual({ drafts: 0, files: 0, uploads: 0 });
  });
});
