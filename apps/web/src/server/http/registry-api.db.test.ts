import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ItemType } from "@ronneai/core";
import { packItem, unpackItem } from "@ronneai/core/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../domains/workspaces/models/workspace";
import { localStorage } from "../storage/local-storage";
import type { StorageAdapter } from "../storage/storage-adapter";
import {
  getItem,
  getTarball,
  getVersion,
  listItems,
  postResolve,
  type RegistryApiDeps,
} from "./registry-api";

let t: TestDb;
let app: AppAuth;
let deps: RegistryApiDeps;
let token: string;
let publisher: string;
let scopeId: string;
let storageRoot: string;
let storage: StorageAdapter;
const BASE = "http://localhost:3000/api/v1";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-api-"));
  storage = localStorage(storageRoot);
  deps = {
    app,
    storage,
    guard: { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
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
    workspaceId: GLOBAL_WORKSPACE_ID,
    createdBy: null,
    createdAt: new Date(),
  });
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

let clock = Date.UTC(2026, 8, 1);
const tick = () => {
  clock += 60_000;
  return new Date(clock);
};

/** Releases versions through the repository, `latest` on the last stable one. */
const release = async (
  name: string,
  {
    type = "skill" as ItemType,
    versions = ["1.0.0"],
    keywords = [] as string[],
    dependsOn = {} as Record<string, string>,
  } = {},
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
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
      dependencies: await Promise.all(
        Object.entries(dependsOn).map(async ([dependency, range]) => ({
          itemId: (await items.findByName("team", dependency.replace("@team/", "")))?.id ?? "",
          range,
        })),
      ),
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
      support: { "claude-code": "native", codex: "native", cursor: "native" },
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
    await release("styled", { type: "output-style" });
    expect(await names("?tool=codex&sort=name")).not.toContain("@team/styled");
    expect(await names("?tool=claude-code&type=output-style")).toEqual(["@team/styled"]);
  });

  it("refuses what it doesn't understand, and requests without a valid token", async () => {
    for (const query of [
      "?type=widget",
      "?tool=copilot",
      "?sort=stars",
      "?limit=0",
      "?limit=101",
    ]) {
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
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
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
    expect(json.versions[0].support).toEqual({
      "claude-code": "native",
      codex: "native",
      cursor: "native",
    });
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
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertItem({
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

/** @team/kit released as 1.0.0 with a real artifact in storage; returns its bytes and ids. */
const releaseWithArtifact = async () => {
  const text = (value: string) => new TextEncoder().encode(value);
  const files = [
    {
      path: "ronne.yaml",
      bytes: text(
        'name: "@team/kit"\ntype: skill\ndescription: A kit.\nlicense: MIT\nskill:\n  entry: SKILL.md\n',
      ),
    },
    { path: "SKILL.md", bytes: text("---\nname: kit\ndescription: A kit.\n---\n\nDo it.\n") },
  ];
  const packed = await packItem(files, { version: "1.0.0" });
  await storage.put("team/kit/1.0.0.tgz", packed.tgz);
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const itemId = await items.insertItem({
    scopeId,
    name: "kit",
    type: "skill",
    description: "A kit.",
    ownerId: publisher,
    createdAt: tick(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: {
      name: "@team/kit",
      type: "skill",
      description: "A kit.",
      license: "MIT",
      version: "1.0.0",
    },
    readme: "# Kit\n",
    files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
    notes: "First.",
    artifactPath: "team/kit/1.0.0.tgz",
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: publisher,
    publishedAt: tick(),
    submissionId: null,
    dependencies: [],
    riskFlags: [{ kind: "network", message: "It mentions `example.com`." }],
  });
  await items.setTag(itemId, "latest", versionId);
  return { packed, itemId, versionId };
};

const kit = { scope: "team", name: "kit", version: "1.0.0" };
const tarball = (headers: Record<string, string> = {}, method = "GET") =>
  new Request(`${BASE}/items/team/kit/1.0.0/tarball`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
const downloads = async () =>
  (await body(await getItem(get("/items/team/kit"), kit, deps))).json.downloads;

describe("GET /items/{scope}/{name}/{version}", () => {
  it("answers the version's manifest, README, files, risk flags and notes", async () => {
    await releaseWithArtifact();
    const { status, json } = await body(await getVersion(get("/items/team/kit/1.0.0"), kit, deps));
    expect(status).toBe(200);
    expect(json).toMatchObject({
      name: "@team/kit",
      version: "1.0.0",
      tags: ["latest"],
      yanked: false,
      manifest: { license: "MIT", version: "1.0.0" },
      readme: "# Kit\n",
      notes: "First.",
      riskFlags: [{ kind: "network" }],
      support: { "claude-code": "native", codex: "native", cursor: "native" },
    });
    expect(json.files.map((f: { path: string }) => f.path)).toEqual(["ronne.yaml", "SKILL.md"]);
    const missing = await body(
      await getVersion(get("/items/team/kit/9.9.9"), { ...kit, version: "9.9.9" }, deps),
    );
    expect([missing.status, missing.json.error.code]).toEqual([404, "version_not_found"]);
  });
});

describe("GET /items/{scope}/{name}/{version}/tarball", () => {
  it("downloads the artifact with its checksum, and counts it", async () => {
    const { packed } = await releaseWithArtifact();
    const response = await getTarball(tarball(), kit, deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-checksum-sha256")).toBe(packed.sha256);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("etag")).toBe(`"${packed.sha256}"`);
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(packed.tgz);
    expect((await unpackItem(bytes)).map((f) => f.path).sort()).toEqual(["SKILL.md", "ronne.yaml"]);
    expect(await downloads()).toBe(1);
  });

  it("doesn't count HEAD or a matching If-None-Match, and still downloads a yanked version", async () => {
    const { packed, versionId } = await releaseWithArtifact();
    const head = await getTarball(tarball({}, "HEAD"), kit, deps);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(packed.size));
    expect(await head.text()).toBe("");
    const cached = await getTarball(tarball({ "if-none-match": `"${packed.sha256}"` }), kit, deps);
    expect(cached.status).toBe(304);
    expect(await downloads()).toBe(0);
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).setYanked(versionId, {
      at: new Date(),
      reason: "x",
    });
    expect((await getTarball(tarball(), kit, deps)).status).toBe(200);
    expect(await downloads()).toBe(1);
  });

  it("counts every one of many downloads at once", async () => {
    await releaseWithArtifact();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => getTarball(tarball(), kit, deps)),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(await downloads()).toBe(8);
  });

  it("is a 500 for a missing or corrupt artifact, and doesn't count it", async () => {
    await releaseWithArtifact();
    const empty = { ...deps, storage: localStorage(join(storageRoot, "empty")) };
    const missing = await body(await getTarball(tarball(), kit, empty));
    expect([missing.status, missing.json.error.code]).toEqual([500, "artifact_unavailable"]);
    const otherRoot = join(storageRoot, "other");
    await localStorage(otherRoot).put("team/kit/1.0.0.tgz", new Uint8Array([1, 2, 3]));
    const corrupt = await getTarball(tarball(), kit, { ...deps, storage: localStorage(otherRoot) });
    expect(corrupt.status).toBe(500);
    expect(await downloads()).toBe(0);
    const unknown = await getTarball(
      new Request(`${BASE}/items/team/kit/2.0.0/tarball`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      { ...kit, version: "2.0.0" },
      deps,
    );
    expect(unknown.status).toBe(404);
  });
});

describe("POST /resolve", () => {
  const post = (payload: unknown, auth: string | null = token) =>
    new Request(`${BASE}/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });

  it("resolves tags and ranges to one version each, with dependencies pinned and warnings", async () => {
    const { ids } = await release("mcp", { type: "mcp-server", versions: ["1.0.0", "1.2.0"] });
    await kyselyItemRepository(t.db, t.dialect, UNFILTERED).setDeprecated(
      ids["1.2.0"] ?? "",
      "Use 2.x.",
    );
    await release("skill", { dependsOn: { "@team/mcp": "^1.0.0" } });
    const { status, json } = await body(
      await postResolve(post({ dependencies: { "@team/skill": "latest" } }), deps),
    );
    expect(status).toBe(200);
    expect(json.items).toEqual({
      "@team/mcp": {
        version: "1.2.0",
        type: "mcp-server",
        sha256: "a".repeat(64),
        dependencies: {},
      },
      "@team/skill": {
        version: "1.0.0",
        type: "skill",
        sha256: "a".repeat(64),
        dependencies: { "@team/mcp": "1.2.0" },
      },
    });
    expect(json.warnings).toEqual([
      { item: "@team/mcp", version: "1.2.0", code: "deprecated", message: "Use 2.x." },
    ]);
    // A locked version that still fits is kept.
    const locked = await body(
      await postResolve(
        post({ dependencies: { "@team/skill": "latest" }, locked: { "@team/mcp": "1.0.0" } }),
        deps,
      ),
    );
    expect(locked.json.items["@team/mcp"].version).toBe("1.0.0");
  });

  it("answers conflicts with who asked, and missing items, tags and versions", async () => {
    await release("mcp", { type: "mcp-server", versions: ["1.0.0", "2.0.0"] });
    await release("skill", { dependsOn: { "@team/mcp": "^2.0.0" } });
    const conflict = await body(
      await postResolve(
        post({ dependencies: { "@team/skill": "^1.0.0", "@team/mcp": "^1.0.0" } }),
        deps,
      ),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.json.error).toMatchObject({
      code: "resolve_conflict",
      details: {
        item: "@team/mcp",
        ranges: [{ range: "^1.0.0" }, { range: "^2.0.0", from: "@team/skill@1.0.0" }],
      },
    });
    for (const [dependencies, code] of [
      [{ "@team/nope": "^1.0.0" }, "item_not_found"],
      [{ "@team/mcp": "beta" }, "tag_not_found"],
      [{ "@team/mcp": "^9.0.0" }, "no_matching_version"],
    ] as const) {
      const { status, json } = await body(await postResolve(post({ dependencies }), deps));
      expect([status, json.error.code]).toEqual([404, code]);
    }
  });

  it("refuses a malformed body, too many items, and requests without a token", async () => {
    for (const payload of [
      "not json",
      [],
      { dependencies: [] },
      { dependencies: { "@team/x": 1 } },
      { dependencies: {}, locked: "x" },
    ]) {
      const { status, json } = await body(await postResolve(post(payload), deps));
      expect([status, json.error.code]).toEqual([400, "invalid_request"]);
    }
    const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`@team/i${i}`, "*"]));
    expect((await postResolve(post({ dependencies: many }), deps)).status).toBe(400);
    expect((await postResolve(post({ dependencies: {} }, null), deps)).status).toBe(401);
    const empty = await body(await postResolve(post({ dependencies: {} }), deps));
    expect(empty).toEqual({ status: 200, json: { items: {}, warnings: [] } });
  });

  it("answers 413 for a body over 1 MiB, with or without content-length", async () => {
    const big = JSON.stringify({ dependencies: {}, padding: "x".repeat(1024 * 1024) });
    const withLength = post(big);
    withLength.headers.set("content-length", String(big.length));
    for (const request of [post(big), withLength]) {
      const { status, json } = await body(await postResolve(request, deps));
      expect([status, json.error.code]).toEqual([413, "body_too_large"]);
    }
  });
});
