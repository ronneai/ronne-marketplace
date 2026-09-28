import type { ItemType } from "@ronneai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { getItem, listItems, type RegistryApiDeps } from "./registry-api";

let t: TestDb;
let app: AppAuth;
let deps: RegistryApiDeps;
let token: string;
let publisher: string;
let scopeId: string;
const BASE = "http://localhost:3000/api/v1";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  deps = {
    app,
    guard: { configured: () => true, authenticate: (value) => authenticateToken(value, app) },
  };
  ({ id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  await createTestUser(app, { email: "u@example.com", password });
  const result = await exchangePassword(
    { email: "u@example.com", password, name: "test" },
    new Headers(),
    app,
  );
  if (!result.ok) throw new Error("no token");
  token = result.token.token;
  scopeId = await kyselyScopeRepository(t.db, t.dialect).insert({
    name: "team",
    description: "A team.",
    createdBy: null,
    createdAt: new Date(),
  });
});
afterEach(() => t.cleanup());

let clock = Date.UTC(2026, 8, 1);
const tick = () => {
  clock += 60_000;
  return new Date(clock);
};

/** Releases versions through the repository, `latest` on the last stable one. */
const release = async (
  name: string,
  { type = "skill" as ItemType, versions = ["1.0.0"], keywords = [] as string[] } = {},
) => {
  const items = kyselyItemRepository(t.db, t.dialect);
  const itemId = await items.insertItem({
    scopeId,
    name,
    type,
    description: `The ${name} item.`,
    ownerId: publisher,
    createdAt: tick(),
  });
  const ids: Record<string, string> = {};
  for (const version of versions) {
    ids[version] = await items.insertVersion({
      itemId,
      version,
      manifest: { name: `@team/${name}`, type, description: `The ${name} item.`, keywords },
      readme: null,
      files: [],
      notes: null,
      artifactPath: `team/${name}/${version}.tgz`,
      sha256: "a".repeat(64),
      size: 10,
      publishedBy: publisher,
      publishedAt: tick(),
      submissionId: null,
      dependencies: [],
      riskFlags: [],
    });
    await items.setTag(itemId, version.includes("-") ? "next" : "latest", ids[version] ?? "");
  }
  return { itemId, ids };
};

const get = (path: string, auth: string | null = token) =>
  new Request(`${BASE}${path}`, {
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
  });
const body = async (response: Response) => ({
  status: response.status,
  json: await response.json(),
});

describe("GET /items", () => {
  it("lists published items, newest first, as summaries", async () => {
    await release("older", { keywords: ["a"] });
    await release("newer");
    const { status, json } = await body(await listItems(get("/items"), deps));
    expect(status).toBe(200);
    expect(json.items.map((i: { name: string }) => i.name)).toEqual(["@team/newer", "@team/older"]);
    expect(json.items[1]).toMatchObject({
      type: "skill",
      version: "1.0.0",
      keywords: ["a"],
      installable: true,
      downloads: 0,
    });
    expect(json.nextCursor).toBeNull();
  });

  it("searches, filters, sorts and pages with a limit", async () => {
    for (const name of ["alpha", "beta", "gamma"]) await release(name);
    await release("hooky", { type: "hook" });
    const names = async (query: string) =>
      (await body(await listItems(get(`/items${query}`), deps))).json.items.map(
        (i: { name: string }) => i.name,
      );
    expect(await names("?q=GAMMA")).toEqual(["@team/gamma"]);
    expect(await names("?type=hook")).toEqual(["@team/hooky"]);
    expect(await names("?scope=@team&sort=name&limit=2")).toEqual(["@team/alpha", "@team/beta"]);
    const first = await body(await listItems(get("/items?sort=name&limit=2"), deps));
    const second = await body(
      await listItems(get(`/items?sort=name&limit=2&cursor=${first.json.nextCursor}`), deps),
    );
    expect(second.json.items.map((i: { name: string }) => i.name)).toEqual([
      "@team/gamma",
      "@team/hooky",
    ]);
    expect(second.json.nextCursor).toBeNull();
  });

  it("refuses what it doesn't understand, and requests without a valid token", async () => {
    for (const query of ["?type=widget", "?sort=stars", "?limit=0", "?limit=101"]) {
      const { status, json } = await body(await listItems(get(`/items${query}`), deps));
      expect([status, json.error.code]).toEqual([400, "invalid_request"]);
    }
    const missing = await body(await listItems(get("/items", null), deps));
    expect([missing.status, missing.json.error.code]).toEqual([401, "token_missing"]);
    const wrong = await body(await listItems(get("/items", "rmk_nope"), deps));
    expect([wrong.status, wrong.json.error.code]).toEqual([401, "token_invalid"]);
  });
});

describe("GET /items/{scope}/{name}", () => {
  it("answers the item, its tags and every version, yanked and deprecated ones marked", async () => {
    const { ids } = await release("tool", { versions: ["1.0.0", "1.1.0", "2.0.0-beta.1"] });
    const items = kyselyItemRepository(t.db, t.dialect);
    await items.setDeprecated(ids["1.0.0"] ?? "", "Use 1.1.0.");
    await items.setYanked(ids["2.0.0-beta.1"] ?? "", { at: new Date(), reason: "Broken." });
    const response = await getItem(get("/items/team/tool"), { scope: "team", name: "tool" }, deps);
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    const { status, json } = await body(response);
    expect(status).toBe(200);
    expect(json).toMatchObject({
      name: "@team/tool",
      type: "skill",
      owner: "Root",
      downloads: 0,
      tags: { latest: "1.1.0", next: "2.0.0-beta.1" },
    });
    expect(
      json.versions.map((v: { version: string; yanked: boolean; deprecated: string | null }) => [
        v.version,
        v.yanked,
        v.deprecated,
      ]),
    ).toEqual([
      ["2.0.0-beta.1", true, null],
      ["1.1.0", false, null],
      ["1.0.0", false, "Use 1.1.0."],
    ]);
    // A leading @ in the path works too.
    expect(
      (await getItem(get("/items/@team/tool"), { scope: "@team", name: "tool" }, deps)).status,
    ).toBe(200);
  });

  it("is a 404 for an unknown item, or one with no published version", async () => {
    const unknown = await body(
      await getItem(get("/items/team/nope"), { scope: "team", name: "nope" }, deps),
    );
    expect([unknown.status, unknown.json.error.code]).toEqual([404, "item_not_found"]);
    await kyselyItemRepository(t.db, t.dialect).insertItem({
      scopeId,
      name: "empty",
      type: "rule",
      description: "",
      ownerId: null,
      createdAt: tick(),
    });
    expect(
      (await getItem(get("/items/team/empty"), { scope: "team", name: "empty" }, deps)).status,
    ).toBe(404);
  });
});
