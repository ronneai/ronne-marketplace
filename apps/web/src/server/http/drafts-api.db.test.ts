import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { type DraftsApiDeps, getScopes } from "./drafts-api";

let t: TestDb;
let app: AppAuth;
let deps: DraftsApiDeps;
/** A token for each role. */
let tokens: { user: string; moderator: string; root: string };
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
  };
  await createRoot(t.db, t.dialect, { email: "root@example.com", name: "Root", password });
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
  ] as const)
    await scopes.insert({ name, description, createdBy: null, createdAt: new Date() });
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
