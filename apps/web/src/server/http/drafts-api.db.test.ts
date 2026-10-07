import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packItem } from "@ronneai/core/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { listAuditEvents } from "../domains/audit/actions/audit";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import {
  createTestUser,
  setWorkspaceRole,
  testAppAuth,
} from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { kyselySubmissionRepository } from "../domains/submissions/repositories/kysely-submission-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../domains/workspaces/models/workspace";
import { kyselyWorkspaceRepository } from "../domains/workspaces/repositories/kysely-workspace-repository";
import { localStorage } from "../storage/local-storage";
import {
  checkDrafts,
  type DraftsApiDeps,
  getDrafts,
  getScopes,
  postDraft,
  putDraft,
  submitDrafts,
} from "./drafts-api";
import { createSubmitLimiter, createUploadLimiter } from "./upload-rate-limit";

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
    submitLimiter: createSubmitLimiter(),
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
    const id = await scopes.insert({
      name,
      description,
      workspaceId: GLOBAL_WORKSPACE_ID,
      createdBy: null,
      createdAt: new Date(),
    });
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
  it("lists scopes by name, with their descriptions, workspaces and your role, for every role", async () => {
    for (const [role, token] of Object.entries(tokens)) {
      const response = await getScopes(get("/scopes", token), deps);
      expect(response.headers.get("cache-control")).toBe("private, no-cache");
      expect(await body(response)).toEqual({
        status: 200,
        json: {
          scopes: [
            { name: "platform", description: "Shared tools.", workspace: "global", role },
            { name: "security", description: "The security team.", workspace: "global", role },
            { name: "team", description: "A team.", workspace: "global", role },
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
      proposal: null,
    });
    const repo = kyselySubmissionRepository(t.db, t.dialect, UNFILTERED);
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
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertItem({
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
    const repo = kyselySubmissionRepository(t.db, t.dialect, UNFILTERED);
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

describe("GET and PUT /drafts (051)", () => {
  const files = (body = "Be careful.") => [
    {
      path: "ronne.yaml",
      encoding: "utf8",
      content: 'name: "@team/secure-coding"\ntype: skill\ndescription: Checks code.\n',
    },
    { path: "SKILL.md", encoding: "utf8", content: `---\nname: secure-coding\n---\n${body}\n` },
  ];
  const upload = (overrides: Record<string, unknown> = {}) => ({
    name: "@team/secure-coding",
    type: "skill",
    files: files(),
    ...overrides,
  });
  const send = (method: "POST" | "PUT", path: string, payload: unknown, auth = tokens.user) =>
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const create = async (auth = tokens.user) =>
    (await body(await postDraft(send("POST", "/drafts", upload(), auth), deps))).json.id as string;
  const put = (id: string, payload: unknown, auth = tokens.user) =>
    putDraft(send("PUT", `/drafts/${id}`, payload, auth), { id }, deps);
  const setStatus = (id: string, status: "submitted" | "changes_requested" | "published") =>
    t.db.updateTable("submissions").set({ status }).where("id", "=", id).execute();
  const stored = async (id: string) =>
    (await kyselySubmissionRepository(t.db, t.dialect, UNFILTERED).files(id)).map((f) => [
      f.path,
      f.content,
    ]);

  it("lists your open drafts of an item, and nobody else's", async () => {
    const mine = await create();
    const inReview = await create();
    await setStatus(inReview, "submitted");
    const done = await create();
    await setStatus(done, "published");
    await create(tokens.moderator);
    const response = await getDrafts(get("/drafts?name=@team/secure-coding"), deps);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { status, json } = await body(response);
    expect(status).toBe(200);
    expect(json.drafts).toHaveLength(2);
    expect(json.drafts).toEqual(
      expect.arrayContaining([
        {
          id: mine,
          path: `/submissions/${mine}`,
          url: `https://ronne.example/submissions/${mine}`,
          name: "@team/secure-coding",
          type: "skill",
          status: "draft",
          updatedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
          description: "Checks code.",
          proposal: null,
        },
        expect.objectContaining({ id: inReview, status: "submitted" }),
      ]),
    );
    expect((await body(await getDrafts(get("/drafts?name=@team/other"), deps))).json).toEqual({
      drafts: [],
    });
    expect((await body(await getDrafts(get("/drafts"), deps))).json.drafts).toHaveLength(2);
    const bad = await body(await getDrafts(get("/drafts?name=nope"), deps));
    expect([bad.status, bad.json.error.code]).toEqual([400, "invalid_name"]);
    const anonymous = await body(await getDrafts(get("/drafts", null), deps));
    expect([anonymous.status, anonymous.json.error.code]).toEqual([401, "token_missing"]);
  });

  it("lists each draft's description from its ronne.yaml, or null (053)", async () => {
    const described = await create();
    const undescribed = (
      await body(
        await postDraft(
          send(
            "POST",
            "/drafts",
            upload({
              files: [
                { path: "ronne.yaml", encoding: "utf8", content: 'name: "@team/secure-coding"\n' },
              ],
            }),
          ),
          deps,
        ),
      )
    ).json.id as string;
    const { json } = await body(await getDrafts(get("/drafts?name=@team/secure-coding"), deps));
    const byId = Object.fromEntries(
      json.drafts.map((d: { id: string; description: string | null }) => [d.id, d.description]),
    );
    expect(byId).toEqual({ [described]: "Checks code.", [undescribed]: null });
  });

  it("replaces your draft's files, answering as POST does", async () => {
    const id = await create();
    const response = await put(id, upload({ files: files("Changed.").slice(0, 2) }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { status, json } = await body(response);
    expect(status).toBe(200);
    expect(json).toMatchObject({
      id,
      path: `/submissions/${id}`,
      name: "@team/secure-coding",
      status: "draft",
      files: 2,
      proposal: null,
    });
    expect(await stored(id)).toEqual([
      ["SKILL.md", "---\nname: secure-coding\n---\nChanged.\n"],
      ["ronne.yaml", files()[0]?.content],
    ]);
    const events = await t.db
      .selectFrom("audit_log")
      .select("action")
      .where("target_id", "=", id)
      .execute();
    expect(events.map((e) => e.action).sort()).toEqual([
      "submission.draft_created",
      "submission.draft_updated",
    ]);
  });

  it("answers each refusal with its code, and changes nothing", async () => {
    const id = await create();
    const before = await stored(id);
    const refusals: [Promise<Response>, number, string][] = [
      [put(id, upload(), tokens.moderator), 404, "draft_not_found"],
      [put("01ARZ3NDEKTSV4RRFFQ69G5FAV", upload()), 404, "draft_not_found"],
      [put(id, upload({ name: "@team/other" })), 409, "draft_mismatch"],
      [put(id, upload({ type: "rule" })), 409, "draft_mismatch"],
      [put(id, upload({ base: "1.0.0" })), 409, "draft_mismatch"],
      [put(id, upload({ name: "nope" })), 400, "invalid_name"],
      [put(id, upload({ files: files().slice(1) })), 400, "manifest_required"],
      [put(id, "{"), 400, "invalid_request"],
    ];
    for (const [response, status, code] of refusals) {
      const answer = await body(await response);
      expect([answer.status, answer.json.error.code], code).toEqual([status, code]);
    }
    await setStatus(id, "submitted");
    const inReview = await body(await put(id, upload({ files: files("Changed.") })));
    expect([inReview.status, inReview.json.error]).toEqual([
      409,
      expect.objectContaining({ code: "not_editable", details: { status: "submitted" } }),
    ]);
    expect(await stored(id)).toEqual(before);
  });

  it("replaces one sent back for changes", async () => {
    const id = await create();
    await setStatus(id, "changes_requested");
    const { status, json } = await body(await put(id, upload({ files: files("Fixed.") })));
    expect([status, json.status]).toEqual([200, "changes_requested"]);
  });

  it("shares POST's rate limit, and needs a valid token first", async () => {
    const id = await create();
    for (let i = 1; i < 30; i += 1) await put(id, upload());
    const limited = await put(id, upload());
    expect(limited.status).toBe(429);
    const anonymous = await putDraft(
      new Request(`${BASE}/drafts/${id}`, { method: "PUT", body: "{" }),
      { id },
      deps,
    );
    expect([anonymous.status, (await anonymous.json()).error.code]).toEqual([401, "token_missing"]);
  });
});

describe("POST /drafts/check and /drafts/submit (052)", () => {
  const files = (description = "Checks code.") => [
    {
      path: "ronne.yaml",
      encoding: "utf8",
      content: `name: "@team/secure-coding"\ntype: skill\n${description ? `description: ${description}\n` : ""}`,
    },
    {
      path: "SKILL.md",
      encoding: "utf8",
      content: "---\nname: secure-coding\ndescription: Checks code.\n---\nGo.\n",
    },
  ];
  const post = (path: string, payload: unknown, auth = tokens.user) =>
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const create = async (description = "Checks code.", auth = tokens.user) =>
    (
      await body(
        await postDraft(
          post(
            "/drafts",
            { name: "@team/secure-coding", type: "skill", files: files(description) },
            auth,
          ),
          deps,
        ),
      )
    ).json.id as string;
  const statusOf = async (id: string) =>
    (await t.db.selectFrom("submissions").select("status").where("id", "=", id).executeTakeFirst())
      ?.status;

  it("checks your drafts without submitting, saying what's in the way", async () => {
    const ready = await create();
    const missing = await create("");
    const theirs = await create("Checks code.", tokens.moderator);
    const response = await checkDrafts(
      post("/drafts/check", { ids: [ready, missing, theirs] }),
      deps,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { status, json } = await body(response);
    expect(status).toBe(200);
    expect(json.more).toBe(0);
    expect(json.drafts[0]).toEqual({
      id: ready,
      result: "ready",
      ready: true,
      path: `/submissions/${ready}`,
      url: `https://ronne.example/submissions/${ready}`,
      name: "@team/secure-coding",
      type: "skill",
      status: "draft",
      issues: [],
    });
    expect(json.drafts[1]).toMatchObject({ id: missing, result: "not_ready", ready: false });
    expect(json.drafts[1].issues.length).toBeGreaterThan(0);
    expect(json.drafts[2]).toEqual({ id: theirs, result: "not_found", ready: false });
    expect([await statusOf(ready), await statusOf(missing)]).toEqual(["draft", "draft"]);
    const all = await body(await checkDrafts(post("/drafts/check", { all: true }), deps));
    expect(all.json.drafts.map((d: { id: string }) => d.id).sort()).toEqual(
      [ready, missing].sort(),
    );
  });

  it("submits the ready ones and answers each result, auditing the token", async () => {
    const ready = await create();
    const missing = await create("");
    const { status, json } = await body(
      await submitDrafts(post("/drafts/submit", { ids: [ready, missing] }), deps),
    );
    expect(status).toBe(200);
    expect(json.results).toMatchObject([
      { id: ready, result: "submitted", status: "submitted", revision: 1 },
      { id: missing, result: "not_ready", status: "draft" },
    ]);
    expect([await statusOf(ready), await statusOf(missing)]).toEqual(["submitted", "draft"]);
    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "submission.submitted",
    );
    expect(event?.metadata).toMatchObject({ via: "api", tokenName: "test" });
  });

  it("answers each refusal with its code", async () => {
    const id = await create();
    const many = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const refusals: [Promise<Response>, number, string][] = [
      [checkDrafts(post("/drafts/check", {}), deps), 400, "invalid_request"],
      [checkDrafts(post("/drafts/check", { ids: [] }), deps), 400, "invalid_request"],
      [checkDrafts(post("/drafts/check", { ids: [1] }), deps), 400, "invalid_request"],
      [checkDrafts(post("/drafts/check", { ids: [id, id] }), deps), 400, "invalid_request"],
      [
        checkDrafts(post("/drafts/check", { ids: [id], dependencies: "no" }), deps),
        400,
        "invalid_request",
      ],
      [submitDrafts(post("/drafts/submit", "{"), deps), 400, "invalid_request"],
      [submitDrafts(post("/drafts/submit", { ids: many }), deps), 413, "too_many"],
    ];
    for (const [response, status, code] of refusals) {
      const answer = await body(await response);
      expect([answer.status, answer.json.error.code], code).toEqual([status, code]);
    }
    expect(await statusOf(id)).toBe("draft");
    const anonymous = await checkDrafts(
      new Request(`${BASE}/drafts/check`, { method: "POST", body: "{}" }),
      deps,
    );
    expect(anonymous.status).toBe(401);
  });

  it("refuses the 11th submit request in 10 minutes, with retry-after", async () => {
    for (let i = 0; i < 10; i += 1)
      expect((await submitDrafts(post("/drafts/submit", { ids: ["x"] }), deps)).status).toBe(200);
    const limited = await submitDrafts(post("/drafts/submit", { ids: ["x"] }), deps);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    // Checking isn't limited this way.
    expect((await checkDrafts(post("/drafts/check", { ids: ["x"] }), deps)).status).toBe(200);
  });
});

describe("POST /drafts with a base (042)", () => {
  const text = (value: string) => new TextEncoder().encode(value);
  const skillFiles = (description = "A kit.") => [
    {
      path: "ronne.yaml",
      content: `name: "@team/kit"\ntype: skill\ndescription: ${description}\nskill:\n  entry: SKILL.md\n`,
    },
    { path: "SKILL.md", content: `---\nname: kit\ndescription: ${description}\n---\nDo it.\n` },
  ];
  let storageRoot: string;

  /** @team/kit published at the given versions, each with its artifact, `latest` on the last. */
  const publish = async (versions: string[]) => {
    storageRoot = mkdtempSync(join(tmpdir(), "ronne-proposals-"));
    const storage = localStorage(storageRoot);
    deps = { ...deps, storage };
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const itemId = await items.insertItem({
      scopeId: teamId,
      name: "kit",
      type: "skill",
      description: "A kit.",
      ownerId: rootId,
      createdAt: new Date(),
    });
    for (const version of versions) {
      const files = skillFiles().map((f) => ({ path: f.path, bytes: text(f.content) }));
      const packed = await packItem(files, { version });
      await storage.put(`team/kit/${version}.tgz`, packed.tgz);
      const versionId = await items.insertVersion({
        itemId,
        version,
        manifest: { name: "@team/kit", type: "skill", description: "A kit.", version },
        readme: null,
        files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
        notes: null,
        artifactPath: `team/kit/${version}.tgz`,
        sha256: packed.sha256,
        size: packed.size,
        publishedBy: rootId,
        publishedAt: new Date(),
        submissionId: null,
        dependencies: [],
        riskFlags: [],
      });
      await items.setTag(itemId, "latest", versionId);
    }
  };
  afterEach(() => storageRoot && rmSync(storageRoot, { recursive: true, force: true }));
  const post = (payload: unknown) =>
    new Request(`${BASE}/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokens.user}` },
      body: JSON.stringify(payload),
    });
  const proposal = (base: string, description = "A better kit.", type = "skill") => ({
    name: "@team/kit",
    type,
    base,
    files: skillFiles(description).map((f) => ({ ...f, encoding: "utf8" })),
  });

  it("creates a proposal draft with the uploaded files, and says what it's based on", async () => {
    await publish(["1.0.0"]);
    const { status, json } = await body(await postDraft(post(proposal("1.0.0")), deps));
    expect(status).toBe(201);
    expect(json).toMatchObject({
      name: "@team/kit",
      status: "draft",
      issues: [],
      submitIssues: [],
      proposal: { item: "@team/kit", baseVersion: "1.0.0", stale: null },
    });
    const draft = await kyselySubmissionRepository(t.db, t.dialect, UNFILTERED).find(json.id);
    expect(draft?.proposal).toMatchObject({ baseVersion: "1.0.0" });
    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "submission.draft_created",
    );
    expect(event?.metadata).toMatchObject({ proposal: true, baseVersion: "1.0.0" });
  });

  it("says a proposal from an older version is stale, and one that changes nothing", async () => {
    await publish(["1.0.0", "1.1.0"]);
    const stale = await body(await postDraft(post(proposal("1.0.0")), deps));
    expect(stale.json.proposal).toEqual({
      item: "@team/kit",
      baseVersion: "1.0.0",
      stale: "1.1.0",
    });
    const same = await body(await postDraft(post(proposal("1.1.0", "A kit.")), deps));
    expect(same.status).toBe(201);
    expect(same.json.submitIssues.map((i: { code: string }) => i.code)).toEqual(["no_changes"]);
  });

  it("answers item_not_found, version_not_found and type_changed, and creates nothing", async () => {
    await publish(["1.0.0"]);
    const cases: [unknown, number, string][] = [
      [{ ...proposal("1.0.0"), name: "@team/nothing" }, 404, "item_not_found"],
      [proposal("9.9.9"), 404, "version_not_found"],
      [proposal("1.0.0", "A kit.", "rule"), 400, "type_changed"],
      [{ ...proposal("1.0.0"), base: "" }, 400, "invalid_request"],
    ];
    for (const [payload, status, code] of cases) {
      const { json, ...rest } = await body(await postDraft(post(payload), deps));
      expect([rest.status, json.error.code]).toEqual([status, code]);
    }
    expect(await kyselySubmissionRepository(t.db, t.dialect, UNFILTERED).listByAuthor("x")).toEqual(
      [],
    );
    expect(
      Number(
        (
          await t.db
            .selectFrom("submissions")
            .select((eb) => eb.fn.countAll().as("n"))
            .executeTakeFirstOrThrow()
        ).n,
      ),
    ).toBe(0);
  });

  it("counts proposals towards the draft limit", async () => {
    await publish(["1.0.0"]);
    const user = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "u@example.com")
      .executeTakeFirstOrThrow();
    const repo = kyselySubmissionRepository(t.db, t.dialect, UNFILTERED);
    for (let i = 0; i < 50; i += 1)
      await repo.insert({
        authorId: user.id,
        scopeId: teamId,
        name: `d${i}`,
        type: "rule",
        status: "draft",
        createdAt: new Date(),
      });
    const { status, json } = await body(await postDraft(post(proposal("1.0.0")), deps));
    expect([status, json.error.code]).toEqual([409, "draft_limit"]);
  });
});

describe("workspaces: only members draft and submit there (091)", () => {
  let acme: string;
  let memberId: string;
  let memberToken: string;
  const skill = (name: string) => ({
    name,
    type: "skill",
    files: [
      {
        path: "ronne.yaml",
        encoding: "utf8",
        content: `name: "${name}"\ntype: skill\ndescription: Checks code.\n`,
      },
      {
        path: "SKILL.md",
        encoding: "utf8",
        content: `---\nname: ${name.split("/")[1]}\ndescription: Checks code.\n---\nGo.\n`,
      },
    ],
  });
  const send = (method: "POST" | "PUT", path: string, payload: unknown, auth: string) =>
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify(payload),
    });
  const drafts = async () =>
    Number(
      (
        await t.db
          .selectFrom("submissions")
          .select((eb) => eb.fn.countAll().as("n"))
          .executeTakeFirstOrThrow()
      ).n,
    );

  beforeEach(async () => {
    acme = await kyselyWorkspaceRepository(t.db, t.dialect).insert({
      name: "acme",
      description: "Acme's team.",
      visibility: "public",
      createdBy: null,
      createdAt: new Date(),
    });
    await kyselyScopeRepository(t.db, t.dialect).insert({
      name: "acme",
      description: "Acme's tools.",
      workspaceId: acme,
      createdBy: null,
      createdAt: new Date(),
    });
    memberId = await createTestUser(app, { email: "a@example.com", password });
    await setWorkspaceRole(app, memberId, "user", acme);
    memberToken = await tokenFor("a@example.com");
  });

  it("lists acme's scope to its members, with their role, and to root; not to others", async () => {
    const scopes = async (token: string) =>
      (await body(await getScopes(get("/scopes", token), deps))).json.scopes.map(
        (s: { name: string; role: string }) => `${s.name}:${s.role}`,
      );
    expect(await scopes(memberToken)).toEqual([
      "acme:user",
      "platform:user",
      "security:user",
      "team:user",
    ]);
    expect(await scopes(tokens.root)).toContain("acme:root");
    for (const token of [tokens.user, tokens.moderator])
      expect(await scopes(token)).not.toContain(expect.stringMatching(/^acme:/));
  });

  it("refuses a non-member's upload with not_a_member, creating nothing; a member's goes", async () => {
    for (const token of [tokens.user, tokens.moderator]) {
      const { status, json } = await body(
        await postDraft(send("POST", "/drafts", skill("@acme/fmt"), token), deps),
      );
      expect([status, json.error.code, json.error.details]).toEqual([
        403,
        "not_a_member",
        { workspace: "acme" },
      ]);
      expect(json.error.message).toContain("Ask to join acme");
    }
    expect(await drafts()).toBe(0);
    const made = await postDraft(send("POST", "/drafts", skill("@acme/fmt"), memberToken), deps);
    expect(made.status).toBe(201);
    const byRoot = await postDraft(send("POST", "/drafts", skill("@acme/lint"), tokens.root), deps);
    expect(byRoot.status).toBe(201);
  });

  it("a removed member still lists their draft, but can't replace or submit it", async () => {
    const { json } = await body(
      await postDraft(send("POST", "/drafts", skill("@acme/fmt"), memberToken), deps),
    );
    await t.db.deleteFrom("workspace_members").where("workspace_id", "=", acme).execute();

    const listed = await body(await getDrafts(get("/drafts?name=@acme/fmt", memberToken), deps));
    expect(listed.json.drafts.map((d: { id: string }) => d.id)).toEqual([json.id]);

    const replaced = await body(
      await putDraft(
        send("PUT", `/drafts/${json.id}`, skill("@acme/fmt"), memberToken),
        { id: json.id },
        deps,
      ),
    );
    expect([replaced.status, replaced.json.error.code]).toEqual([403, "not_a_member"]);

    const submitted = await body(
      await submitDrafts(send("POST", "/drafts/submit", { ids: [json.id] }, memberToken), deps),
    );
    expect(submitted.json.results).toEqual([
      expect.objectContaining({
        id: json.id,
        result: "not_a_member",
        issues: [expect.objectContaining({ code: "not_a_member", severity: "error" })],
      }),
    ]);
    const checked = await body(
      await checkDrafts(send("POST", "/drafts/check", { ids: [json.id] }, memberToken), deps),
    );
    expect(checked.json.drafts).toEqual([
      expect.objectContaining({ id: json.id, result: "not_a_member", ready: false }),
    ]);
    const status = await t.db
      .selectFrom("submissions")
      .select("status")
      .where("id", "=", json.id)
      .executeTakeFirstOrThrow();
    expect(status.status).toBe("draft");
  });
});
