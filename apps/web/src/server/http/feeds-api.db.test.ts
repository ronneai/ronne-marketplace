import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest } from "@ronneai/core";
import { packItem } from "@ronneai/core/pack";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken, exchangePassword } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../domains/items/repositories/kysely-scope-repository";
import { GLOBAL_WORKSPACE_ID } from "../domains/workspaces/models/workspace";
import { localStorage } from "../storage/local-storage";
import type { StorageAdapter } from "../storage/storage-adapter";
import { type FeedsApiDeps, getMarketplace, getPluginZip } from "./feeds-api";

let t: TestDb;
let app: AppAuth;
let deps: FeedsApiDeps;
let token: string;
let storageRoot: string;
let storage: StorageAdapter;
let itemId: string;
const BASE = "https://registry.example.com/api/v1/feeds";
const password = "correct horse battery";
const text = (value: string) => new TextEncoder().encode(value);

const MANIFEST = [
  'name: "@team/style"',
  "type: skill",
  "description: House style.",
  "skill:",
  "  entry: SKILL.md",
  "",
].join("\n");

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  storageRoot = await mkdtemp(join(tmpdir(), "ronne-feeds-api-"));
  storage = localStorage(storageRoot);
  deps = {
    app,
    storage,
    guard: { ready: async () => true, authenticate: (value) => authenticateToken(value, app) },
    publicUrl: () => "https://registry.example.com",
  };
  const { id: publisher } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  });
  await createTestUser(app, { email: "u@example.com", password });
  const result = await exchangePassword(
    { email: "u@example.com", password, name: "test" },
    new Headers(),
    app,
  );
  if (!result.ok) throw new Error("no token");
  token = result.token.token;
  const scopeId = await kyselyScopeRepository(t.db, t.dialect).insert({
    name: "team",
    description: "A team.",
    workspaceId: GLOBAL_WORKSPACE_ID,
    createdBy: null,
    createdAt: new Date(),
  });
  const items = kyselyItemRepository(t.db, t.dialect);
  itemId = await items.insertItem({
    scopeId,
    name: "style",
    type: "skill",
    description: "House style.",
    ownerId: publisher,
    createdAt: new Date(),
  });
  const files = [
    { path: "ronne.yaml", bytes: text(MANIFEST) },
    {
      path: "SKILL.md",
      bytes: text("---\nname: style\ndescription: House style.\n---\nBe tidy.\n"),
    },
  ];
  const packed = await packItem(files, { version: "1.0.0" });
  await storage.put("team/style/1.0.0.tgz", packed.tgz);
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name: "@team/style", type: "skill", description: "House style.", version: "1.0.0" },
    readme: null,
    files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
    notes: null,
    artifactPath: "team/style/1.0.0.tgz",
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: publisher,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
});
afterEach(async () => {
  await t.cleanup();
  await rm(storageRoot, { recursive: true, force: true });
});

const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
  });

const ZIP = { tool: "claude-code", scope: "team", name: "style", file: "1.0.0.zip" };
const downloads = async () =>
  (await kyselyItemRepository(t.db, t.dialect).findByName("team", "style"))?.downloadCount;

describe("GET /api/v1/feeds/claude-code/marketplace.json (077)", () => {
  it("needs a token", async () => {
    const response = await getMarketplace(
      new Request(`${BASE}/claude-code/marketplace.json`),
      { tool: "claude-code" },
      deps,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="ronne"');
  });

  it("lists the released items, with archive URLs and their sha256", async () => {
    const response = await getMarketplace(
      get("/claude-code/marketplace.json"),
      { tool: "claude-code" },
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    const body = await response.json();
    expect(body.name).toBe("ronne-registry-example-com");
    expect(body.plugins).toEqual([
      {
        name: "team.style",
        version: "1.0.0",
        description: "House style.",
        source: {
          source: "archive",
          url: `${BASE}/claude-code/plugins/team/style/1.0.0.zip`,
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    ]);
  });

  it("answers 304 when nothing changed", async () => {
    const first = await getMarketplace(
      get("/claude-code/marketplace.json"),
      { tool: "claude-code" },
      deps,
    );
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const again = await getMarketplace(
      get("/claude-code/marketplace.json", { "if-none-match": etag }),
      { tool: "claude-code" },
      deps,
    );
    expect(again.status).toBe(304);
  });

  it("answers 503 without PUBLIC_URL", async () => {
    const response = await getMarketplace(
      get("/claude-code/marketplace.json"),
      { tool: "claude-code" },
      { ...deps, publicUrl: () => undefined },
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("public_url_missing");
  });

  it("answers 404 for a tool it has no feed for", async () => {
    for (const tool of ["copilot", "nope"]) {
      const response = await getMarketplace(get(`/${tool}/marketplace.json`), { tool }, deps);
      expect(response.status, tool).toBe(404);
      expect((await response.json()).error.code).toBe("feed_not_found");
    }
  });
});

describe("GET /api/v1/feeds/claude-code/plugins/{scope}/{name}/{version}.zip (077)", () => {
  it("needs a token", async () => {
    const response = await getPluginZip(
      new Request(`${BASE}/claude-code/plugins/team/style/1.0.0.zip`),
      ZIP,
      deps,
    );
    expect(response.status).toBe(401);
  });

  it("answers the zip with its sha256 as the ETag, the one the marketplace lists, and counts it", async () => {
    const market = await (
      await getMarketplace(get("/claude-code/marketplace.json"), { tool: "claude-code" }, deps)
    ).json();
    const response = await getPluginZip(
      get("/claude-code/plugins/team/style/1.0.0.zip"),
      ZIP,
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(response.headers.get("etag")).toBe(`"${sha256}"`);
    expect(market.plugins[0].source.sha256).toBe(sha256);
    expect(await downloads()).toBe(1);
  });

  it("answers 304 on a matching If-None-Match, and HEAD, without counting", async () => {
    const first = await getPluginZip(get("/claude-code/plugins/team/style/1.0.0.zip"), ZIP, deps);
    const etag = first.headers.get("etag") ?? "";
    const again = await getPluginZip(
      get("/claude-code/plugins/team/style/1.0.0.zip", { "if-none-match": `W/${etag}` }),
      ZIP,
      deps,
    );
    expect(again.status).toBe(304);
    const head = await getPluginZip(
      get("/claude-code/plugins/team/style/1.0.0.zip", {}, "HEAD"),
      ZIP,
      deps,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("etag")).toBe(etag);
    expect(await downloads()).toBe(1);
  });

  it("answers 404 for a missing version, a yanked one, a bad file name, or another tool", async () => {
    const notFound = async (params: typeof ZIP) =>
      (await getPluginZip(get("/x"), params, deps)).status;
    expect(await notFound({ ...ZIP, file: "9.9.9.zip" })).toBe(404);
    expect(await notFound({ ...ZIP, file: "1.0.0.tgz" })).toBe(404);
    expect(await notFound({ ...ZIP, name: "nope" })).toBe(404);
    expect(await notFound({ ...ZIP, tool: "nope" })).toBe(404);
    const items = kyselyItemRepository(t.db, t.dialect);
    const [version] = await items.versions(itemId);
    if (!version) throw new Error("no version");
    await items.setYanked(version.id, { at: new Date(), reason: "Broken." });
    const yanked = await getPluginZip(get("/x"), ZIP, deps);
    expect(yanked.status).toBe(404);
    expect((await yanked.json()).error.code).toBe("plugin_not_found");
    expect(await downloads()).toBe(0);
  });
});

/** Releases `@team/<name>@1.0.0` as a release leaves it, tagged `latest`. */
const releaseMore = async (name: string, manifest: string, files: Record<string, string>) => {
  const items = kyselyItemRepository(t.db, t.dialect);
  const scope = await t.db.selectFrom("scopes").select("id").executeTakeFirstOrThrow();
  const style = await items.findByName("team", "style");
  const parsed = parseManifest(manifest).manifest as Record<string, unknown>;
  const id = await items.insertItem({
    scopeId: scope.id,
    name,
    type: parsed.type as never,
    description: String(parsed.description),
    ownerId: style?.ownerId ?? null,
    createdAt: new Date(),
  });
  const all = [
    { path: "ronne.yaml", bytes: text(manifest) },
    ...Object.entries(files).map(([path, content]) => ({ path, bytes: text(content) })),
  ];
  const packed = await packItem(all, { version: "1.0.0" });
  await storage.put(`team/${name}/1.0.0.tgz`, packed.tgz);
  const versionId = await items.insertVersion({
    itemId: id,
    version: "1.0.0",
    manifest: { ...parsed, version: "1.0.0" },
    readme: null,
    files: all.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
    notes: null,
    artifactPath: `team/${name}/1.0.0.tgz`,
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: style?.ownerId ?? "",
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(id, "latest", versionId);
};

describe("the Codex and Cursor feeds (078)", () => {
  beforeEach(async () => {
    // An agent: Codex plugins carry no agents, so it's left out of Codex's feed.
    await releaseMore(
      "reviewer",
      [
        'name: "@team/reviewer"',
        "type: agent",
        "description: Reviews diffs.",
        "agent:",
        "  prompt: prompt.md",
        "",
      ].join("\n"),
      { "prompt.md": "You review diffs.\n" },
    );
    // A skill its own manifest turns off for Cursor.
    await releaseMore(
      "no-cursor",
      [
        'name: "@team/no-cursor"',
        "type: skill",
        "description: Not for Cursor.",
        "skill:",
        "  entry: SKILL.md",
        "targets:",
        "  cursor:",
        "    enabled: false",
        "",
      ].join("\n"),
      { "SKILL.md": "---\nname: no-cursor\ndescription: Not for Cursor.\n---\nHi.\n" },
    );
  });

  const names = async (tool: string) => {
    const response = await getMarketplace(get(`/${tool}/marketplace.json`), { tool }, deps);
    expect(response.status, tool).toBe(200);
    const body = await response.json();
    for (const plugin of body.plugins)
      expect(plugin.source.url).toBe(
        `${BASE}/${tool}/plugins/team/${plugin.name.split(".")[1]}/${plugin.version}.zip`,
      );
    return body.plugins.map((p: { name: string }) => p.name);
  };

  it("list each tool's own plugins, with archive entries rmk feed build reads", async () => {
    expect(await names("claude-code")).toEqual(["team.no-cursor", "team.reviewer", "team.style"]);
    expect(await names("codex")).toEqual(["team.no-cursor", "team.style"]);
    expect(await names("cursor")).toEqual(["team.reviewer", "team.style"]);
  });

  it("serve each tool's plugin layout, and 404 for an item left out of that tool's feed", async () => {
    const zip = async (tool: string, name: string) => {
      const response = await getPluginZip(
        get("/x"),
        { tool, scope: "team", name, file: "1.0.0.zip" },
        deps,
      );
      return response.status === 200
        ? Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer()))).sort()
        : response.status;
    };
    expect(await zip("codex", "style")).toEqual([
      "plugin.json",
      "skills/style/SKILL.md",
      "skills/style/ronne.yaml",
    ]);
    expect(await zip("cursor", "style")).toEqual([
      ".cursor-plugin/plugin.json",
      "skills/style/SKILL.md",
      "skills/style/ronne.yaml",
    ]);
    expect(await zip("codex", "reviewer")).toBe(404);
    expect(await zip("cursor", "no-cursor")).toBe(404);
  });
});
