import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../db/dates";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { listAuditEvents } from "../domains/audit/actions/audit";
import { createRoot } from "../domains/identity/actions/root-account";
import { createScimLimiters, type ScimLimiters } from "../domains/identity/actions/scim";
import type { CurrentUser } from "../domains/identity/models/user";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyScimTokenRepository } from "../domains/identity/repositories/kysely-scim-token-repository";
import {
  createScimToken,
  disableScim,
  enableScim,
  revokeScimTokens,
  rotateScimToken,
  type ScimTokenDeps,
} from "../domains/identity/services/scim-tokens";
import { testAppAuth } from "../domains/identity/testing/test-auth";
import { setLoggerForTests } from "../log";
import { handleScim, type ScimResources } from "./scim-api";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let limiters: ScimLimiters;
let clock: Date;
let root: CurrentUser;
let tokens: ScimTokenDeps;
let token: string;
const BASE = "http://localhost:3000/api/v1/scim/v2";
const HOUR = 60 * 60 * 1000;

// Users and Groups come in tasks 4 and 5: a stand-in shows what reached them.
const reached: {
  kind: string;
  providerId: string;
  method?: string;
  id: string | null;
  base: string;
}[] = [];
const resources: ScimResources = {
  Users: async (_request, { caller, method, id, base }) => {
    reached.push({ kind: "Users", providerId: caller.providerId, method, id, base });
    return new Response(null, { status: 204 });
  },
  Groups: async (_request, { caller, method, id, base }) => {
    reached.push({ kind: "Groups", providerId: caller.providerId, method, id, base });
    return new Response(null, { status: 204 });
  },
};

const insertProvider = async (id: string) => {
  const at = toDbDate(clock, t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "entra",
      name: "Acme",
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: at,
      updated_at: at,
    })
    .execute();
};

const actor = () => ({ user: root, ip: null });

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date("2026-10-18T12:00:00.000Z");
  limiters = createScimLimiters(() => clock.getTime());
  reached.length = 0;
  const a = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id: a.id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  tokens = { repo: kyselyScimTokenRepository(t.db, t.dialect), now: () => clock };
  await insertProvider("acme");
  await enableScim(tokens, actor(), "acme");
  token = (await createScimToken(tokens, actor(), "acme")).token;
});
afterEach(() => t.cleanup());

const call = (
  path: string,
  init: { method?: string; token?: string | null; headers?: Record<string, string> } = {},
  a = app,
) =>
  handleScim(
    new Request(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.token === null ? {} : { authorization: `Bearer ${init.token ?? token}` }),
        ...init.headers,
      },
    }),
    a,
    { limiters, now: () => clock, resources },
  );

const body = async (response: Response) => JSON.parse(await response.text());

const refusals = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events
    .filter((e) => e.action === "scim.request_refused")
    .map((e) => e.metadata)
    .reverse();

/** A refusal in SCIM's error format (RFC 7644 §3.12), never cached. */
const expectScimError = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/scim+json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const json = await body(response);
  expect(json.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
  expect(json.status).toBe(String(status));
  expect(typeof json.detail).toBe("string");
  return json;
};

describe("discovery", () => {
  it("is public, and says what Ronne supports", async () => {
    const response = await call("/ServiceProviderConfig", { token: null });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/scim+json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const config = await body(response);
    expect(config).toMatchObject({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 100 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", primary: true }],
      meta: { location: `${BASE}/ServiceProviderConfig` },
    });
    // A bad token changes nothing for a public document.
    expect((await call("/ServiceProviderConfig", { token: "nope" })).status).toBe(200);
    expect(await refusals()).toEqual([]);
  });

  it("lists the User and Group resource types and schemas, and finds each by id", async () => {
    const types = await body(await call("/ResourceTypes", { token: null }));
    expect(types).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
    });
    expect(
      types.Resources.map((r: { id: string; endpoint: string }) => [r.id, r.endpoint]),
    ).toEqual([
      ["User", "/Users"],
      ["Group", "/Groups"],
    ]);
    expect(await body(await call("/ResourceTypes/Group", { token: null }))).toMatchObject({
      id: "Group",
      meta: { location: `${BASE}/ResourceTypes/Group` },
    });

    const schemas = await body(await call("/Schemas", { token: null }));
    expect(schemas.Resources.map((s: { id: string }) => s.id)).toEqual([
      "urn:ietf:params:scim:schemas:core:2.0:User",
      "urn:ietf:params:scim:schemas:core:2.0:Group",
    ]);
    const user = await body(
      await call(`/Schemas/${encodeURIComponent("urn:ietf:params:scim:schemas:core:2.0:User")}`, {
        token: null,
      }),
    );
    expect(user.attributes.map((a: { name: string }) => a.name)).toEqual([
      "userName",
      "name",
      "displayName",
      "emails",
      "active",
      "groups",
    ]);

    await expectScimError(await call("/ResourceTypes/Device", { token: null }), 404);
    await expectScimError(await call("/Schemas/urn:nope", { token: null }), 404);
    await expectScimError(await call("/ServiceProviderConfig/x", { token: null }), 404);
  });

  it("only answers GET", async () => {
    const response = await call("/ServiceProviderConfig", { method: "POST", token: null });
    await expectScimError(response, 405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("the guard", () => {
  it("lets a working token through to Users and Groups, with its provider, the id and the base", async () => {
    expect((await call("/Users")).status).toBe(204);
    expect((await call("/Groups/g-1", { method: "PATCH" })).status).toBe(204);
    expect(reached).toEqual([
      { kind: "Users", providerId: "acme", method: "GET", id: null, base: BASE },
      { kind: "Groups", providerId: "acme", method: "PATCH", id: "g-1", base: BASE },
    ]);
    expect(await refusals()).toEqual([]);
  });

  it("passes each provider's token on as that provider, never another", async () => {
    await insertProvider("other");
    await enableScim(tokens, actor(), "other");
    const otherToken = (await createScimToken(tokens, actor(), "other")).token;
    expect((await call("/Users", { token: otherToken })).status).toBe(204);
    expect((await call("/Users")).status).toBe(204);
    expect(reached.map((r) => r.providerId)).toEqual(["other", "acme"]);
    // Turning one provider's SCIM off doesn't touch the other's.
    await disableScim(tokens, actor(), "other");
    await expectScimError(await call("/Users", { token: otherToken }), 401);
    expect((await call("/Users")).status).toBe(204);
  });

  it("refuses every bad token the same way, 401 with a Bearer challenge, and audits why", async () => {
    await insertProvider("other");
    await enableScim(tokens, actor(), "other");
    const otherToken = (await createScimToken(tokens, actor(), "other")).token;
    await disableScim(tokens, actor(), "other");

    const cases: [string, { token?: string | null; headers?: Record<string, string> }][] = [
      ["no header", { token: null }],
      ["another scheme", { token: null, headers: { authorization: `Basic ${token}` } }],
      ["an access token", { token: `rmk_${"a".repeat(43)}` }],
      ["an unknown token", { token: `scim_${"a".repeat(43)}` }],
      ["SCIM off for its provider", { token: otherToken }],
    ];
    const answers = [];
    for (const [, init] of cases) {
      const response = await call("/Users", init);
      const json = await expectScimError(response, 401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      answers.push(json.detail);
    }
    // Nothing tells the reasons apart.
    expect(new Set(answers).size).toBe(1);
    expect(reached).toEqual([]);
    expect(await refusals()).toEqual([
      { reason: "missing" },
      { reason: "missing" },
      { reason: "format" },
      { reason: "unknown" },
      { reason: "scim_off", provider: "other" },
    ]);
  });

  it("refuses a revoked token, and a rotated one once its 24 hours are up", async () => {
    const rotated = await rotateScimToken(tokens, actor(), "acme");
    expect((await call("/Users")).status).toBe(204);
    clock = new Date(clock.getTime() + 24 * HOUR);
    await expectScimError(await call("/Users"), 401);
    expect((await call("/Users", { token: rotated.token })).status).toBe(204);
    await revokeScimTokens(tokens, actor(), "acme");
    await expectScimError(await call("/Users", { token: rotated.token }), 401);
    expect(await refusals()).toEqual([
      { reason: "expired", provider: "acme" },
      { reason: "revoked", provider: "acme" },
    ]);
  });

  it("ignores cookies: a signed-in browser gets no further without a token", async () => {
    const response = await call("/Users", {
      token: null,
      headers: { cookie: "ronne.session_token=anything" },
    });
    await expectScimError(response, 401);
  });

  it("refuses a 21st bad token in a minute from one address with 429, and stops auditing them", async () => {
    const proxied = testAppAuth(t, { trustProxy: true });
    const from = (ip: string) => ({
      token: `scim_${"b".repeat(43)}`,
      headers: { "x-forwarded-for": ip },
    });
    for (let i = 0; i < 20; i++)
      await expectScimError(await call("/Users", from("203.0.113.5"), proxied), 401);
    const limited = await call("/Users", from("203.0.113.5"), proxied);
    await expectScimError(limited, 429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another address isn't held up, and neither is the provider's own token.
    await expectScimError(await call("/Users", from("203.0.113.6"), proxied), 401);
    expect((await call("/Users", {}, proxied)).status).toBe(204);
    expect((await refusals()).length).toBe(21);
    // A minute later, the address may try again.
    clock = new Date(clock.getTime() + 60_000);
    await expectScimError(await call("/Users", from("203.0.113.5"), proxied), 401);
  });

  it("shares 100 bad tokens a minute between every caller when the address can't be trusted", async () => {
    for (let i = 0; i < 100; i++)
      await expectScimError(await call("/Users", { token: `scim_${"c".repeat(43)}` }), 401);
    await expectScimError(await call("/Users", { token: `scim_${"c".repeat(43)}` }), 429);
  });

  it("lets a token make 600 requests a minute, then answers 429", async () => {
    for (let i = 0; i < 600; i++) expect((await call("/Users")).status).toBe(204);
    const limited = await call("/Users");
    await expectScimError(limited, 429);
    expect(limited.headers.get("retry-after")).toBe("60");
    clock = new Date(clock.getTime() + 60_000);
    expect((await call("/Users")).status).toBe(204);
  });
});

describe("paths and methods", () => {
  it("answers unknown paths with a SCIM 404, before asking for a token", async () => {
    for (const path of ["", "/", "/Devices", "/Users/a/b", "/users"])
      await expectScimError(await call(path, { token: null }), 404);
    expect(await refusals()).toEqual([]);
  });

  it("answers HEAD as GET, as Next sends it (GET's handler, the request still HEAD)", async () => {
    const config = await call("/ServiceProviderConfig", { method: "HEAD", token: null });
    expect(config.status).toBe(200);
    expect(config.headers.get("content-type")).toBe("application/scim+json");
    expect((await call("/Schemas", { method: "HEAD", token: null })).status).toBe(200);
    expect((await call("/Users", { method: "HEAD" })).status).toBe(204);
    expect((await call("/Groups/g-1", { method: "HEAD" })).status).toBe(204);
    expect(reached.map((r) => [r.kind, r.method])).toEqual([
      ["Users", "GET"],
      ["Groups", "GET"],
    ]);
    // Still behind the guard.
    await expectScimError(await call("/Users", { method: "HEAD", token: null }), 401);
  });

  it("answers OPTIONS as a SCIM 405", async () => {
    for (const method of ["OPTIONS"]) {
      await expectScimError(await call("/Users", { method }), 405);
      await expectScimError(await call("/ServiceProviderConfig", { method, token: null }), 405);
    }
    expect(reached).toEqual([]);
  });

  it("reads only paths under the base, not one that merely starts with it", async () => {
    const response = await handleScim(
      new Request("http://localhost:3000/api/v1/scim/v2Users", {
        headers: { authorization: `Bearer ${token}` },
      }),
      app,
      { limiters, now: () => clock, resources },
    );
    await expectScimError(response, 404);
    expect(reached).toEqual([]);
  });

  it("says Bulk and Me aren't supported", async () => {
    await expectScimError(await call("/Bulk", { method: "POST" }), 501);
    await expectScimError(await call("/Me"), 501);
  });

  it("allows only the methods each path takes", async () => {
    const collection = await call("/Users", { method: "DELETE" });
    await expectScimError(collection, 405);
    expect(collection.headers.get("allow")).toBe("GET, HEAD, POST");
    const one = await call("/Groups/g-1", { method: "POST" });
    await expectScimError(one, 405);
    expect(one.headers.get("allow")).toBe("DELETE, GET, HEAD, PATCH, PUT");
    expect(reached).toEqual([]);
  });

  it("serves Groups as not yet there without stand-ins (task 5)", async () => {
    const response = await handleScim(
      new Request(`${BASE}/Groups`, { headers: { authorization: `Bearer ${token}` } }),
      app,
      { limiters, now: () => clock },
    );
    await expectScimError(response, 501);
  });

  it("never writes a token to the audit log or a log line", async () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    vi.stubEnv("LOG_FORMAT", "json");
    const out: string[] = [];
    const write = (chunk: unknown) => {
      out.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(write);
    vi.spyOn(process.stderr, "write").mockImplementation(write);
    setLoggerForTests();
    try {
      const wrong = `scim_${"d".repeat(43)}`;
      await call("/Users");
      await call("/Users", { token: wrong });
      await call("/Users", { token: `${token}x` });
      await revokeScimTokens(tokens, actor(), "acme");
      await call("/Users");
      const audit = JSON.stringify(await t.db.selectFrom("audit_log").selectAll().execute());
      const logs = out.join("");
      expect(logs).toContain("scim.request_refused");
      for (const text of [audit, logs]) {
        expect(text).not.toContain(token);
        expect(text).not.toContain(wrong);
      }
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      setLoggerForTests();
    }
  });
});
