import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseManifest } from "@ronneai/core";
import { packItem } from "@ronneai/core/pack";
import { type Change, claudeCodeRenderer } from "@ronneai/core/render";
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "./api.js";
import { diskHash, writeState } from "./apply.js";
import { RmkError } from "./errors.js";
import {
  describeLocalItems,
  discoverLocalItems,
  type ExportPlan,
  findSkills,
  mcpConfigs,
  ownershipOf,
  planExport,
  readMcpServers,
  uploadExport,
  walkItemFolder,
} from "./export.js";
import { previewText } from "./export-command.js";
import { places } from "./install.js";
import {
  exportRoutes,
  type FakeIo,
  type FakeOpenDraft,
  fakeIo,
  REGISTRY,
  type Route,
} from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const write = (root: string, path: string, content = "x", mode?: number) => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  if (mode !== undefined) chmodSync(full, mode);
};
const skill = (root: string, folder: string, name: string) =>
  write(root, `${folder}/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${name}.\n---\n`);

describe("findSkills", () => {
  it("finds skills in both folders of a scope, by name, and only folders with a SKILL.md", () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    skill(io.cwd, ".agents/skills", "deploy");
    skill(io.cwd, ".agents/skills", "review");
    write(io.cwd, ".claude/skills/notes/README.md");
    write(io.cwd, ".claude/skills/stray.md");
    skill(io.home, ".claude/skills", "personal");

    expect(findSkills(io, "project").map((s) => [s.name, s.display])).toEqual([
      ["deploy", ".agents/skills/deploy"],
      ["review", ".agents/skills/review"],
      ["review", ".claude/skills/review"],
    ]);
    expect(findSkills(io, "user").map((s) => [s.name, s.display, s.scope])).toEqual([
      ["personal", ".claude/skills/personal", "user"],
    ]);
  });

  it("lists a folder once when one path links to the other", () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    mkdirSync(join(io.cwd, ".agents/skills"), { recursive: true });
    symlinkSync(join(io.cwd, ".claude/skills/review"), join(io.cwd, ".agents/skills/review"));
    expect(findSkills(io, "project").map((s) => s.display)).toEqual([".claude/skills/review"]);
  });

  it("finds a skill folder that is itself a link, and none when the folders are missing", () => {
    io = fakeIo({});
    expect(findSkills(io, "project")).toEqual([]);
    skill(io.home, "elsewhere", "linked");
    mkdirSync(join(io.cwd, ".claude/skills"), { recursive: true });
    symlinkSync(join(io.home, "elsewhere/linked"), join(io.cwd, ".claude/skills/linked"));
    symlinkSync(join(io.home, "nowhere"), join(io.cwd, ".claude/skills/broken"));
    expect(findSkills(io, "project").map((s) => s.name)).toEqual(["linked"]);
  });
});

describe("walkItemFolder", () => {
  it("reads every file with its executable bit, and skips what's never uploaded, saying why", () => {
    io = fakeIo({});
    const dir = join(io.cwd, "skill");
    write(dir, "SKILL.md", "---\nname: a\n---\n");
    write(dir, "scripts/run.sh", "#!/bin/sh\n", 0o755);
    write(dir, "docs/guide.md");
    for (const path of [
      ".git/config",
      "node_modules/x/index.js",
      "sub/__pycache__/a.pyc",
      ".ronne/notes",
      ".hg/x",
      ".svn/x",
    ])
      write(dir, path);
    for (const path of [".DS_Store", "docs/Thumbs.db"]) write(dir, path);
    for (const path of [
      ".env",
      ".env.local",
      "certs/server.pem",
      "deploy.key",
      "id_rsa",
      "id_rsa.pub",
      ".npmrc",
      ".netrc",
    ])
      write(dir, path, "secret");
    symlinkSync(join(dir, "docs/guide.md"), join(dir, "guide-link.md"));
    symlinkSync(join(dir, "docs"), join(dir, "docs-link"));

    const walked = walkItemFolder(dir);
    expect(walked.over).toBeNull();
    expect(walked.files.map((f) => [f.path, f.executable])).toEqual([
      ["SKILL.md", false],
      ["docs/guide.md", false],
      ["scripts/run.sh", true],
    ]);
    expect(walked.skipped).toEqual([
      { path: ".DS_Store", reason: "not_item" },
      { path: ".env", reason: "secret_file" },
      { path: ".env.local", reason: "secret_file" },
      { path: ".git/", reason: "not_item" },
      { path: ".hg/", reason: "not_item" },
      { path: ".netrc", reason: "secret_file" },
      { path: ".npmrc", reason: "secret_file" },
      { path: ".ronne/", reason: "not_item" },
      { path: ".svn/", reason: "not_item" },
      { path: "certs/server.pem", reason: "secret_file" },
      { path: "deploy.key", reason: "secret_file" },
      { path: "docs-link", reason: "link" },
      { path: "docs/Thumbs.db", reason: "not_item" },
      { path: "guide-link.md", reason: "link" },
      { path: "id_rsa", reason: "secret_file" },
      { path: "id_rsa.pub", reason: "secret_file" },
      { path: "node_modules/", reason: "not_item" },
      { path: "sub/__pycache__/", reason: "not_item" },
    ]);
    expect(new TextDecoder().decode(walked.files[0]?.bytes)).toBe("---\nname: a\n---\n");
  });

  it("reads a folder that is itself a link from where it points", () => {
    io = fakeIo({});
    write(io.home, "real/SKILL.md", "hi");
    symlinkSync(join(io.home, "real"), join(io.cwd, "linked"));
    expect(walkItemFolder(join(io.cwd, "linked")).files.map((f) => f.path)).toEqual(["SKILL.md"]);
  });

  it("stops at the first limit it passes, without reading on", () => {
    io = fakeIo({});
    const dir = join(io.cwd, "big");
    for (let i = 0; i < 5; i += 1) write(dir, `f${i}.md`, "x".repeat(10));
    const limits = { maxFiles: 500, maxFileBytes: 100, maxTotalBytes: 1000, maxPackedBytes: 1000 };
    expect(walkItemFolder(dir, { ...limits, maxFiles: 4 })).toEqual({
      files: [],
      skipped: [],
      over: { limit: "files", max: 4 },
    });
    expect(walkItemFolder(dir, { ...limits, maxTotalBytes: 45 }).over).toEqual({
      limit: "total",
      max: 45,
    });
    write(dir, "huge.bin", "x".repeat(101));
    expect(walkItemFolder(dir, limits).over).toEqual({
      limit: "file",
      path: "huge.bin",
      size: 101,
      max: 100,
    });
  });
});

describe("ownershipOf", () => {
  /** Records the folder in a scope's state file, as `rmk install` does. */
  const recordInstall = async (scope: "project" | "user", path: string, item = "@team/review") => {
    const { root, state } = places(io, scope);
    const sha256 = (await diskHash(root, { kind: "dir", path })) ?? "";
    writeState(state, {
      version: 1,
      entries: [{ item, version: "1.2.0", targets: ["claude-code"], kind: "dir", path, sha256 }],
    });
  };
  const ownership = (dir: string) => ownershipOf(io, dir, walkItemFolder(dir).files);

  it("says written here when nothing else applies", async () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    expect(await ownership(join(io.cwd, ".claude/skills/review"))).toEqual({ owner: "local" });
  });

  it("finds an installed folder in the state file, and whether it was edited since", async () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    const dir = join(io.cwd, ".claude/skills/review");
    await recordInstall("project", ".claude/skills/review");
    expect(await ownership(dir)).toEqual({
      owner: "installed",
      item: "@team/review",
      version: "1.2.0",
      edited: false,
      scope: "project",
    });
    write(dir, "notes.md", "mine");
    expect(await ownership(dir)).toMatchObject({ owner: "installed", edited: true });
  });

  it("finds a user-scope install when the home folder is the project", async () => {
    io = fakeIo({});
    io.cwd = io.home;
    skill(io.home, ".claude/skills", "review");
    await recordInstall("user", ".claude/skills/review");
    const [found] = findSkills(io, "project");
    expect(found?.display).toBe(".claude/skills/review");
    expect(await ownership(found?.path ?? "")).toMatchObject({ owner: "installed", scope: "user" });
  });

  it("calls a folder whose ronne.yaml has a version a registry copy", async () => {
    io = fakeIo({});
    const dir = join(io.cwd, "copied");
    write(dir, "SKILL.md", "---\nname: tool\n---\n");
    write(dir, "ronne.yaml", 'name: "@other/tool"\nversion: 1.4.0\ntype: skill\n');
    expect(await ownership(dir)).toEqual({
      owner: "registry_copy",
      item: "@other/tool",
      version: "1.4.0",
    });
    write(dir, "ronne.yaml", "name: [\n");
    expect(await ownership(dir)).toEqual({ owner: "local" });
  });

  it("calls a SKILL.md with rmk's marker rendered: a rule or command written as a skill", async () => {
    io = fakeIo({});
    const dir = join(io.cwd, ".claude/skills/house-style");
    write(
      dir,
      "SKILL.md",
      "---\nname: house-style\n---\n<!-- managed by rmk: @examples/house-style@1.0.0 -->\n\nBody.\n",
    );
    expect(await ownership(dir)).toEqual({
      owner: "rendered",
      item: "@examples/house-style",
      version: "1.0.0",
    });
  });
});

describe("planExport", () => {
  const SCOPES = [
    { name: "team", description: "A team." },
    { name: "platform", description: "Shared tools." },
  ];
  const routes = (published: string[] = []): Record<string, Route> => ({
    "GET /scopes": () => ({ json: { scopes: SCOPES, nextCursor: null } }),
    ...Object.fromEntries(
      ["team", "platform"].flatMap((scope) =>
        ["review", "copied", "big", "keys", "deploy"].map((name) => [
          `GET /items/${scope}/${name}`,
          () =>
            published.includes(`@${scope}/${name}`)
              ? { json: { name: `@${scope}/${name}` } }
              : { status: 404, json: { error: { code: "item_not_found", message: "No." } } },
        ]),
      ),
    ),
  });
  const setup = (published: string[] = []) => {
    io = fakeIo(routes(published));
    return apiClient(io.fetch, REGISTRY, "rmk_test_token");
  };
  const plan = (api: ReturnType<typeof setup>, request: Parameters<typeof planExport>[2]) =>
    planExport(io, api, request);
  const reviewSkill = () => {
    skill(io.cwd, ".claude/skills", "review");
    write(io.cwd, ".claude/skills/review/checklist.md", "Check it.\n");
  };

  it("plans a hand-written skill without sending anything but reads", async () => {
    const api = setup();
    reviewSkill();
    const result = await plan(api, { items: ["review"], to: "@team" });
    expect(result).toMatchObject({ registry: REGISTRY, to: "team", refused: [] });
    const [item] = result.items;
    expect(item).toMatchObject({
      local: ".claude/skills/review",
      name: "@team/review",
      type: "skill",
      skipped: [],
      warnings: [],
      issues: [],
      published: false,
    });
    expect(item?.files.map((f) => f.path)).toEqual(["SKILL.md", "checklist.md", "ronne.yaml"]);
    expect(item?.manifestText).toBe(
      'name: "@team/review"\ntype: skill\ndescription: review.\nskill:\n  entry: SKILL.md\n',
    );
    expect(io.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("takes the scope from --to, else the folder's ronne.yaml, and never picks one itself", async () => {
    const api = setup();
    reviewSkill();
    await expect(plan(api, { items: ["review"] })).rejects.toMatchObject({
      code: "scope_required",
      exitCode: 2,
      details: { scopes: SCOPES },
    });
    await expect(plan(api, { items: ["review"], to: "nowhere" })).rejects.toMatchObject({
      code: "scope_not_found",
      exitCode: 2,
    });
    write(
      io.cwd,
      ".claude/skills/review/ronne.yaml",
      'name: "@platform/review"\ntype: skill\ndescription: R.\n',
    );
    expect((await plan(api, { items: ["review"] })).items[0]?.name).toBe("@platform/review");
    expect((await plan(api, { items: ["review"], to: "team" })).items[0]?.name).toBe(
      "@team/review",
    );
  });

  it("takes a folder path or a name, --name for one item, and says when a name is ambiguous", async () => {
    const api = setup();
    reviewSkill();
    write(io.cwd, "loose/My Tool/SKILL.md", "---\ndescription: Loose.\n---\n");
    const byPath = await plan(api, { items: ["loose/My Tool"], to: "team" });
    expect(byPath.items[0]).toMatchObject({ local: "loose/My Tool", name: "@team/my-tool" });
    const named = await plan(api, { items: ["review"], to: "team", name: "code-review" });
    expect(named.items[0]?.name).toBe("@team/code-review");
    await expect(
      plan(api, { items: ["review", "loose/My Tool"], to: "team", name: "x" }),
    ).rejects.toMatchObject({ exitCode: 2 });
    await expect(plan(api, { items: ["missing"], to: "team" })).rejects.toMatchObject({
      exitCode: 2,
    });
    skill(io.cwd, ".agents/skills", "review");
    await expect(plan(api, { items: ["review"], to: "team" })).rejects.toMatchObject({
      code: "ambiguous",
      details: { paths: [".agents/skills/review", ".claude/skills/review"] },
    });
  });

  it("refuses what isn't the person's, the empty and the oversized, and goes on with the rest", async () => {
    const api = setup();
    reviewSkill();
    const copied = join(io.cwd, "copied");
    write(copied, "SKILL.md", "---\nname: copied\ndescription: C.\n---\n");
    write(
      copied,
      "ronne.yaml",
      'name: "@other/copied"\nversion: 1.4.0\ntype: skill\ndescription: C.\n',
    );
    const rendered = join(io.cwd, "rendered");
    write(
      rendered,
      "SKILL.md",
      "---\nname: r\n---\n<!-- managed by rmk: @examples/house-style@1.0.0 -->\n",
    );
    write(io.cwd, "empty/.env", "X=1");
    write(io.cwd, "big/SKILL.md", "---\nname: big\ndescription: B.\n---\n");
    write(io.cwd, "big/data.bin", "x".repeat(1024 * 1024 + 1));
    const result = await plan(api, {
      items: ["review", "copied", "rendered", "empty", "big"],
      to: "team",
    });
    expect(result.items.map((i) => i.name)).toEqual(["@team/review"]);
    expect(result.refused.map((r) => [r.local, r.code])).toEqual([
      // A registry copy is a proposal now (042); this one's item isn't in the registry.
      ["copied", "base_not_found"],
      ["rendered", "rendered"],
      ["empty", "empty"],
      ["big", "too_large"],
    ]);
    expect(result.refused[1]?.message).toContain(`${REGISTRY}/items/examples/house-style`);

    const forced = await plan(api, { items: ["copied"], to: "team", force: true });
    expect(forced.items[0]?.warnings.map((w) => w.code)).toEqual(["version_removed"]);
    expect(forced.items[0]?.manifestText).not.toContain("version");
  });

  it("refuses an installed skill, pointing to its page", async () => {
    const api = setup();
    reviewSkill();
    const sha256 = (await diskHash(io.cwd, { kind: "dir", path: ".claude/skills/review" })) ?? "";
    writeState(places(io, "project").state, {
      version: 1,
      entries: [
        {
          item: "@team/review",
          version: "1.0.0",
          targets: ["claude-code"],
          kind: "dir",
          path: ".claude/skills/review",
          sha256,
        },
      ],
    });
    const result = await plan(api, { items: ["review"], to: "team" });
    expect(result.items).toEqual([]);
    expect(result.refused).toEqual([
      {
        local: ".claude/skills/review",
        code: "installed",
        message:
          "This is @team/review 1.0.0, installed by rmk and unchanged since: there's nothing to export.",
      },
    ]);
  });

  it("stops an item with a certain secret, naming the file but not the value", async () => {
    const api = setup();
    const secret = `ghp_${"a1B2".repeat(9)}`;
    write(io.cwd, "keys/SKILL.md", "---\nname: keys\ndescription: K.\n---\n");
    write(io.cwd, "keys/config.md", `token: ${secret}\n`);
    const result = await plan(api, { items: ["keys"], to: "team" });
    expect(result.refused).toEqual([
      expect.objectContaining({ code: "secret", message: expect.stringContaining("config.md") }),
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect((await plan(api, { items: ["keys"], to: "team", force: true })).items).toHaveLength(1);
  });

  it("never puts a skipped file's bytes in the plan", async () => {
    const api = setup();
    reviewSkill();
    const marker = "NEVER-UPLOAD-THIS-VALUE";
    for (const path of [".env", "id_rsa", ".git/config", "node_modules/a/x.js", "server.pem"])
      write(io.cwd, `.claude/skills/review/${path}`, marker);
    symlinkSync(join(io.home, "outside.md"), join(io.cwd, ".claude/skills/review/link.md"));
    write(io.home, "outside.md", marker);
    const result = await plan(api, { items: ["review"], to: "team" });
    const everything = (p: ExportPlan) =>
      JSON.stringify(p, (_key, value) =>
        value instanceof Uint8Array ? new TextDecoder().decode(value) : value,
      );
    expect(everything(result)).not.toContain(marker);
    expect(result.items[0]?.skipped.map((s) => s.path)).toEqual([
      ".env",
      ".git/",
      "id_rsa",
      "link.md",
      "node_modules/",
      "server.pem",
    ]);
  });

  it("gives the same fingerprint for the same files, and another for any change", async () => {
    const api = setup();
    reviewSkill();
    const fingerprint = async () =>
      (await plan(api, { items: ["review"], to: "team" })).fingerprint;
    const first = await fingerprint();
    expect(await fingerprint()).toBe(first);
    write(io.cwd, ".claude/skills/review/checklist.md", "Check it!\n");
    const edited = await fingerprint();
    expect(edited).not.toBe(first);
    chmodSync(join(io.cwd, ".claude/skills/review/checklist.md"), 0o755);
    expect(await fingerprint()).not.toBe(edited);
    expect((await plan(api, { items: ["review"], to: "platform" })).fingerprint).not.toBe(
      await fingerprint(),
    );
  });

  it("says when the name is already published, and when the registry has no scopes", async () => {
    const api = setup(["@team/review"]);
    reviewSkill();
    expect((await plan(api, { items: ["review"], to: "team" })).items[0]?.published).toBe(true);
    const bare = fakeIo({ "GET /scopes": () => ({ json: { scopes: [], nextCursor: null } }) });
    try {
      const err = await planExport(bare, apiClient(bare.fetch, REGISTRY, "t"), {
        items: ["x"],
        to: "team",
      }).catch((e) => e);
      expect(err).toBeInstanceOf(RmkError);
      expect(err.code).toBe("no_scopes");
    } finally {
      bare.cleanup();
    }
  });
});

describe("uploadExport", () => {
  const notPublished: Route = () => ({
    status: 404,
    json: { error: { code: "item_not_found", message: "No." } },
  });
  const setup = (options: Parameters<typeof exportRoutes>[0] = {}) => {
    const registry = exportRoutes(options);
    io = fakeIo({
      ...registry.routes,
      "GET /items/team/one": notPublished,
      "GET /items/team/two": notPublished,
    });
    write(io.cwd, ".claude/skills/one/SKILL.md", "---\nname: one\ndescription: One.\n---\n");
    write(io.cwd, ".claude/skills/one/run.sh", "#!/bin/sh\n", 0o755);
    write(io.cwd, ".claude/skills/one/logo.png", "\u0000PNG");
    write(io.cwd, ".claude/skills/two/SKILL.md", "---\nname: two\ndescription: Two.\n---\n");
    return { api: apiClient(io.fetch, REGISTRY, "rmk_test_token"), drafts: registry.drafts };
  };
  const posts = () => io.requests.filter((r) => r.method === "POST");

  it("sends one POST /drafts per item, with text as utf8 and anything else as base64", async () => {
    const { api, drafts } = setup();
    const plan = await planExport(io, api, { items: ["one", "two"], to: "team" });
    expect(posts()).toEqual([]);
    const exported = await uploadExport(api, plan);
    expect(posts().map((r) => r.path)).toEqual(["/api/v1/drafts", "/api/v1/drafts"]);
    expect(drafts.map((d) => d.name)).toEqual(["@team/one", "@team/two"]);
    expect(posts()[0]?.body).toEqual({
      name: "@team/one",
      type: "skill",
      files: [
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: "---\nname: one\ndescription: One.\n---\n",
          executable: false,
        },
        {
          path: "logo.png",
          encoding: "base64",
          content: Buffer.from("\u0000PNG").toString("base64"),
          executable: false,
        },
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: expect.stringContaining('name: "@team/one"'),
          executable: false,
        },
        { path: "run.sh", encoding: "utf8", content: "#!/bin/sh\n", executable: true },
      ],
    });
    expect(exported).toEqual([
      expect.objectContaining({
        local: ".claude/skills/one",
        name: "@team/one",
        id: drafts[0]?.id,
        url: `${REGISTRY}/submissions/${drafts[0]?.id}`,
        issues: [],
        submitIssues: [],
      }),
      expect.objectContaining({ name: "@team/two" }),
    ]);
  });

  it("stops at a failed upload, saying which drafts already exist", async () => {
    const { api, drafts } = setup({
      fail: {
        "@team/two": {
          status: 409,
          json: {
            error: {
              code: "draft_limit",
              message: "You already have 50 drafts.",
              details: { limit: 50 },
            },
          },
        },
      },
    });
    const plan = await planExport(io, api, { items: ["one", "two"], to: "team" });
    const error = await uploadExport(api, plan).catch((e) => e);
    expect(error).toBeInstanceOf(RmkError);
    expect(error).toMatchObject({ code: "draft_limit", exitCode: 1 });
    expect(error.message).toBe(
      `.claude/skills/two: You already have 50 drafts. Drafts already uploaded: @team/one (${REGISTRY}/submissions/${drafts[0]?.id}).`,
    );
    expect(error.details.exported.map((e: { name: string }) => e.name)).toEqual(["@team/one"]);
  });

  it("explains a 413 from a proxy in front of the registry", async () => {
    const { api } = setup({ fail: { "@team/one": { status: 413 } } });
    const plan = await planExport(io, api, { items: ["one"], to: "team" });
    const error = await uploadExport(api, plan).catch((e) => e);
    expect(error.message).toContain(
      "the server in front of the registry refused a request this size",
    );
  });
});

describe("the other types (040)", () => {
  const agentMd = (name: string) =>
    `---\nname: ${name}\ndescription: The ${name} agent.\n---\nDo it.\n`;
  /** A project with one of each type, as a person writes them. */
  const project = () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    write(io.cwd, ".claude/agents/reviewer.md", agentMd("code-reviewer"));
    write(io.cwd, ".claude/agents/team/helper.md", agentMd("helper"));
    write(io.cwd, ".claude/commands/review/diff.md", "---\ndescription: Diffs.\n---\nGo.\n");
    write(io.cwd, ".claude/rules/style.md", "# Style\n");
    write(io.cwd, ".claude/rules/notes.txt", "not a rule");
    write(
      io.cwd,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          github: { type: "http", url: "https://x.example/mcp" },
          "ronne-registry": { command: "rmk-mcp" },
        },
      }),
    );
  };
  /** Records an install, as rmk does: the entry and the hash of what's on disk. */
  const recordInstall = async (
    entries: { item: string; kind: "dir" | "file" | "json-key"; path: string; key?: string[] }[],
  ) => {
    const { root, state } = places(io, "project");
    writeState(state, {
      version: 1,
      entries: await Promise.all(
        entries.map(async (e) => ({
          ...e,
          version: "1.0.0",
          targets: ["claude-code"],
          sha256: (await diskHash(root, e)) ?? "",
        })),
      ),
    });
  };

  it("finds every type, named as the readers name them, and never rmk-mcp's own server", () => {
    project();
    expect(discoverLocalItems(io, "project").map((i) => [i.type, i.name, i.display])).toEqual([
      ["agent", "code-reviewer", ".claude/agents/reviewer.md"],
      ["mcp-server", "github", ".mcp.json (mcpServers.github)"],
      ["agent", "helper", ".claude/agents/team/helper.md"],
      ["skill", "review", ".claude/skills/review"],
      ["command", "review-diff", ".claude/commands/review/diff.md"],
      ["rule", "style", ".claude/rules/style.md"],
    ]);
  });

  it("finds the user-scope servers at the top of ~/.claude.json only", () => {
    io = fakeIo({});
    write(
      io.home,
      ".claude.json",
      JSON.stringify({
        mcpServers: { personal: { command: "p" } },
        projects: { "/x": { mcpServers: { local: { command: "l" } } } },
      }),
    );
    write(io.home, ".claude/agents/mine.md", agentMd("mine"));
    expect(discoverLocalItems(io, "user").map((i) => [i.type, i.name])).toEqual([
      ["agent", "mine"],
      ["mcp-server", "personal"],
    ]);
  });

  it("tells written here, installed, and installed and edited for files and keys", async () => {
    project();
    await recordInstall([
      { item: "@team/code-reviewer", kind: "file", path: ".claude/agents/reviewer.md" },
      { item: "@team/github", kind: "json-key", path: ".mcp.json", key: ["mcpServers", "github"] },
    ]);
    const owners = async () =>
      Object.fromEntries(
        (await describeLocalItems(io, "project")).map(({ item, ownership }) => [
          item.name,
          ownership.owner === "installed"
            ? `installed${ownership.edited ? " and edited" : ""}`
            : ownership.owner,
        ]),
      );
    expect(await owners()).toEqual({
      "code-reviewer": "installed",
      github: "installed",
      helper: "local",
      review: "local",
      "review-diff": "local",
      style: "local",
    });
    write(io.cwd, ".claude/agents/reviewer.md", `${agentMd("code-reviewer")}Mine now.\n`);
    const mcp = JSON.parse(readFileSync(join(io.cwd, ".mcp.json"), "utf8"));
    mcp.mcpServers.github.url = "https://y.example/mcp";
    writeFileSync(join(io.cwd, ".mcp.json"), JSON.stringify(mcp));
    expect(await owners()).toMatchObject({
      "code-reviewer": "installed and edited",
      github: "installed and edited",
    });
  });

  it("calls a Markdown file with rmk's marker rendered", async () => {
    project();
    write(
      io.cwd,
      ".claude/rules/house-style.md",
      "---\npaths:\n  - src/**\n---\n<!-- managed by rmk: @examples/house-style@1.0.0 -->\n\nBody.\n",
    );
    const found = (await describeLocalItems(io, "project")).find(
      (d) => d.item.name === "house-style",
    );
    expect(found?.ownership).toEqual({
      owner: "rendered",
      item: "@examples/house-style",
      version: "1.0.0",
    });
  });

  it("leaves out a server rmk mcp-setup recorded under another name, and a config that doesn't parse", async () => {
    project();
    const mcp = JSON.parse(readFileSync(join(io.cwd, ".mcp.json"), "utf8"));
    mcp.mcpServers.registry = { command: "node", args: ["mcp/dist/bin.js"] };
    writeFileSync(join(io.cwd, ".mcp.json"), JSON.stringify(mcp));
    await recordInstall([
      {
        item: "rmk mcp-setup",
        kind: "json-key",
        path: ".mcp.json",
        key: ["mcpServers", "registry"],
      },
    ]);
    expect(
      discoverLocalItems(io, "project")
        .filter((i) => i.type === "mcp-server")
        .map((i) => i.key),
    ).toEqual(["github"]);
    writeFileSync(join(io.cwd, ".mcp.json"), "{ not json");
    expect(discoverLocalItems(io, "project").some((i) => i.type === "mcp-server")).toBe(false);
    expect(readMcpServers(io, "project").problem).toContain(".mcp.json isn't valid JSON");
  });
});

describe("dependencies on export (041)", () => {
  /** An agent using a skill (which uses a server), a server, an installed skill and a plugin's server. */
  const setup = async (
    fail: Record<string, { status: number; json?: unknown }> = {},
    published: Record<string, Route> = {},
  ) => {
    const registry = exportRoutes({ fail });
    io = fakeIo({ ...registry.routes, ...published });
    write(
      io.cwd,
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviews.\nskills: [secure, installed-skill]\ntools: Read, mcp__github__search, mcp__plugin-thing__x\n---\nReview.\n",
    );
    write(
      io.cwd,
      ".claude/skills/secure/SKILL.md",
      "---\nname: secure\ndescription: Secure.\nallowed-tools: mcp__jira__x\n---\nGo.\n",
    );
    write(
      io.cwd,
      ".claude/skills/installed-skill/SKILL.md",
      "---\nname: installed-skill\ndescription: I.\n---\nGo.\n",
    );
    write(
      io.cwd,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          github: { type: "http", url: "https://g.example/mcp" },
          jira: { command: "jira" },
        },
      }),
    );
    const path = ".claude/skills/installed-skill";
    writeState(places(io, "project").state, {
      version: 1,
      entries: [
        {
          item: "@team/installed-skill",
          version: "1.3.0",
          targets: ["claude-code"],
          kind: "dir",
          path,
          sha256: (await diskHash(io.cwd, { kind: "dir", path })) ?? "",
        },
      ],
    });
    return { api: apiClient(io.fetch, REGISTRY, "rmk_test_token"), drafts: registry.drafts };
  };
  const plan = (api: ReturnType<typeof apiClient>, dependencies?: "include" | "omit") =>
    planExport(io, api, {
      items: ["reviewer"],
      to: "team",
      ...(dependencies ? { dependencies } : {}),
    });

  it("stops for a decision when the item uses items of the person's own", async () => {
    const { api } = await setup();
    const error = await plan(api).catch((e) => e);
    expect(error).toMatchObject({ code: "dependencies_required", exitCode: 2 });
    expect(
      error.details.findings.map(
        (f: { status: string; reference: { name: string } }) => `${f.status}:${f.reference.name}`,
      ),
    ).toEqual([
      "yours:github",
      "not_found:plugin-thing",
      "yours:secure",
      "installed:installed-skill",
      "yours:jira",
    ]);
    expect(io.requests.filter((r) => r.method === "POST")).toEqual([]);
  });

  it("exports them too: one item each, dependencies first, declared at ^1.0.0 and installed ones at their version", async () => {
    const { api } = await setup();
    const result = await plan(api, "include");
    expect(result.items.map((i) => [i.name, i.asDependency])).toEqual([
      ["@team/github", true],
      ["@team/jira", true],
      ["@team/secure", true],
      ["@team/reviewer", false],
    ]);
    const reviewer = result.items.at(-1);
    expect(reviewer?.dependencies).toEqual({
      "@team/github": "^1.0.0",
      "@team/secure": "^1.0.0",
      "@team/installed-skill": "^1.3.0",
    });
    expect(reviewer?.manifestText).toContain('dependencies:\n  "@team/github": ^1.0.0');
    expect(result.items.find((i) => i.name === "@team/secure")?.dependencies).toEqual({
      "@team/jira": "^1.0.0",
    });
    expect(reviewer?.warnings.map((w) => w.code)).toEqual(["dependency_missing"]);
    expect(reviewer?.warnings[0]?.message).toContain("plugin-thing");
    // The manifests pass the checks; only the servers lack the description no file holds.
    for (const item of result.items)
      expect(
        item.issues.filter((i) => i.severity === "error").map((i) => i.path),
        item.name,
      ).toEqual(item.type === "mcp-server" ? ["/description"] : []);
  });

  it("exports without them: only the item, the installed one still declared, and a warning", async () => {
    const { api } = await setup();
    const result = await plan(api, "omit");
    expect(result.items.map((i) => i.name)).toEqual(["@team/reviewer"]);
    const [reviewer] = result.items;
    expect(reviewer?.dependencies).toEqual({ "@team/installed-skill": "^1.3.0" });
    expect(reviewer?.warnings.map((w) => w.code)).toEqual([
      "dependency_omitted",
      "dependency_missing",
      "dependency_omitted",
    ]);
    expect(reviewer?.warnings[0]?.message).toContain("may not work where that's missing");
  });

  it("uploads dependencies first, and nothing that depends on one that failed", async () => {
    const { api, drafts } = await setup({
      "@team/github": {
        status: 409,
        json: { error: { code: "draft_limit", message: "Too many drafts." } },
      },
    });
    const planned = await plan(api, "include");
    const error = await uploadExport(api, planned).catch((e) => e);
    expect(error).toMatchObject({
      code: "draft_limit",
      details: { failed: ["@team/github"], notUploaded: ["@team/reviewer"] },
    });
    // jira and secure don't need github; the reviewer does.
    expect(drafts.map((d) => d.name)).toEqual(["@team/jira", "@team/secure"]);
    expect(error.message).toContain("Not uploaded, since they depend on it: @team/reviewer.");
  });

  it("sends nothing else when the first upload fails and everything depends on it", async () => {
    const { api, drafts } = await setup({
      "@team/jira": {
        status: 409,
        json: { error: { code: "draft_limit", message: "Too many drafts." } },
      },
    });
    write(
      io.cwd,
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: R.\nskills: [secure]\n---\nR.\n",
    );
    const planned = await plan(api, "include");
    expect(planned.items.map((i) => i.name)).toEqual([
      "@team/jira",
      "@team/secure",
      "@team/reviewer",
    ]);
    await uploadExport(api, planned).catch(() => undefined);
    expect(io.requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(drafts).toEqual([]);
  });

  it("depends on a published item of the same name and type instead of uploading a copy", async () => {
    const { api } = await setup(
      {},
      {
        "GET /items/team/secure": () => ({
          json: { type: "skill", tags: { latest: "2.1.0" }, versions: [{ version: "2.1.0" }] },
        }),
        "GET /items/team/github": () => ({
          json: { type: "agent", tags: { latest: "1.0.0" }, versions: [{ version: "1.0.0" }] },
        }),
      },
    );
    const result = await plan(api, "include");
    expect(result.findings.map((f) => `${f.status}:${f.reference.name}`)).toEqual([
      "name_taken:github",
      "not_found:plugin-thing",
      "published:secure",
      "installed:installed-skill",
    ]);
    // secure is the registry's now, so its own server isn't followed or uploaded either.
    expect(result.items.map((i) => i.name)).toEqual(["@team/reviewer"]);
    const [reviewer] = result.items;
    expect(reviewer?.dependencies).toEqual({
      "@team/secure": "^2.1.0",
      "@team/installed-skill": "^1.3.0",
    });
    expect(reviewer?.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining("@team/github is already published as an agent"),
      expect.stringContaining("plugin-thing"),
      expect.stringContaining("@team/secure is already published, so it depends on that at ^2.1.0"),
    ]);
  });
});

describe("Codex's and Cursor's files (043)", () => {
  const project = () => {
    io = fakeIo(exportRoutes().routes);
    write(
      io.cwd,
      ".codex/agents/planner.toml",
      'name = "planner"\ndescription = "Plans."\ndeveloper_instructions = "Plan it."\nmodel = "gpt-5"\n',
    );
    write(
      io.cwd,
      ".codex/config.toml",
      '[mcp_servers.jira]\ncommand = "jira-mcp"\n\n[mcp_servers.ronne-registry]\ncommand = "rmk-mcp"\n',
    );
    write(
      io.cwd,
      ".cursor/agents/auditor.md",
      "---\nname: auditor\ndescription: Audits.\nreadonly: true\n---\nAudit.\n",
    );
    write(
      io.cwd,
      ".cursor/rules/frontend/style.mdc",
      "---\nglobs: src/**/*.tsx\nalwaysApply: false\n---\n# Style\n",
    );
    write(io.cwd, ".cursor/rules/notes.md", "ignored by Cursor");
    write(io.cwd, ".cursor/commands/ship.txt", "Ship the release.\n");
    write(
      io.cwd,
      ".cursor/mcp.json",
      JSON.stringify({ mcpServers: { tracker: { url: "https://t.example/mcp" } } }),
    );
  };
  const listed = () =>
    discoverLocalItems(io, "project").map((i) => `${i.tool}:${i.type}:${i.name}:${i.display}`);

  it("finds each tool's items, with the tool, and never rmk-mcp's server", () => {
    project();
    expect(listed()).toEqual([
      "cursor:agent:auditor:.cursor/agents/auditor.md",
      "cursor:rule:frontend-style:.cursor/rules/frontend/style.mdc",
      "codex:mcp-server:jira:.codex/config.toml (mcp_servers.jira)",
      "codex:agent:planner:.codex/agents/planner.toml",
      "cursor:command:ship:.cursor/commands/ship.txt",
      "cursor:mcp-server:tracker:.cursor/mcp.json (mcpServers.tracker)",
    ]);
  });

  it("finds the home folder's items, but no Cursor rules there", () => {
    io = fakeIo({});
    write(io.home, ".codex/config.toml", '[mcp_servers.personal]\ncommand = "p"\n');
    write(io.home, ".cursor/rules/mine.mdc", "---\nalwaysApply: true\n---\nMine.\n");
    write(io.home, ".cursor/agents/helper.md", "---\nname: helper\n---\nHelp.\n");
    expect(discoverLocalItems(io, "user").map((i) => `${i.tool}:${i.type}:${i.name}`)).toEqual([
      "cursor:agent:helper",
      "codex:mcp-server:personal",
    ]);
  });

  it("tells installed, and installed and edited, for Codex files and TOML keys", async () => {
    project();
    const { root, state } = places(io, "project");
    const entries = [
      { item: "@team/planner", kind: "file" as const, path: ".codex/agents/planner.toml" },
      {
        item: "@team/jira",
        kind: "toml-key" as const,
        path: ".codex/config.toml",
        key: ["mcp_servers", "jira"],
      },
      {
        item: "@team/tracker",
        kind: "json-key" as const,
        path: ".cursor/mcp.json",
        key: ["mcpServers", "tracker"],
      },
    ];
    writeState(state, {
      version: 1,
      entries: await Promise.all(
        entries.map(async (e) => ({
          ...e,
          version: "1.0.0",
          targets: ["codex"],
          sha256: (await diskHash(root, e)) ?? "",
        })),
      ),
    });
    const owners = async () =>
      Object.fromEntries(
        (await describeLocalItems(io, "project")).map(({ item, ownership }) => [
          item.name,
          ownership.owner === "installed"
            ? `installed${ownership.edited ? " and edited" : ""}`
            : ownership.owner,
        ]),
      );
    expect(await owners()).toMatchObject({
      planner: "installed",
      jira: "installed",
      tracker: "installed",
      auditor: "local",
    });
    write(io.cwd, ".codex/config.toml", '[mcp_servers.jira]\ncommand = "jira-mcp-2"\n');
    write(
      io.cwd,
      ".codex/agents/planner.toml",
      'name = "planner"\ndescription = "Plans more."\ndeveloper_instructions = "Plan."\n',
    );
    expect(await owners()).toMatchObject({
      planner: "installed and edited",
      jira: "installed and edited",
    });
  });

  it("calls a TOML file with rmk's marker rendered, and leaves out rmk mcp-setup's entries", async () => {
    project();
    write(
      io.cwd,
      ".codex/agents/reviewer.toml",
      '# managed by rmk: @examples/code-reviewer@1.0.0\nname = "reviewer"\ndescription = "R."\ndeveloper_instructions = "R."\n',
    );
    write(
      io.cwd,
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: { registry: { command: "node" }, tracker: { url: "https://t.example" } },
      }),
    );
    writeState(places(io, "project").state, {
      version: 1,
      entries: [
        {
          item: "rmk mcp-setup",
          version: "0.1.0",
          targets: ["cursor"],
          kind: "json-key",
          path: ".cursor/mcp.json",
          key: ["mcpServers", "registry"],
          sha256: "",
        },
      ],
    });
    const described = await describeLocalItems(io, "project");
    expect(described.find((d) => d.item.name === "reviewer")?.ownership).toMatchObject({
      owner: "rendered",
    });
    expect(described.filter((d) => d.item.type === "mcp-server").map((d) => d.item.key)).toEqual([
      "jira",
      "tracker",
    ]);
  });

  it("skips a config that doesn't parse, with the reason, and lists the rest", () => {
    project();
    write(io.cwd, ".codex/config.toml", "[mcp_servers.jira\ncommand = ");
    expect(listed().some((l) => l.startsWith("codex:mcp-server"))).toBe(false);
    expect(listed()).toContain("codex:agent:planner:.codex/agents/planner.toml");
    expect(mcpConfigs(io, "project").find((c) => c.tool === "codex")?.problem).toContain(
      "config.toml isn't valid TOML",
    );
  });

  it("plans each tool's items with its own reader", async () => {
    project();
    const api = apiClient(io.fetch, REGISTRY, "rmk_test_token");
    const plan = await planExport(io, api, {
      items: ["planner", "frontend-style", "ship", "jira", "tracker", "auditor"],
      to: "team",
      description: undefined,
    });
    expect(plan.refused).toEqual([]);
    const manifest = (name: string) =>
      plan.items.find((i) => i.name === `@team/${name}`)?.manifestText ?? "";
    expect(manifest("planner")).toContain("model: gpt-5");
    expect(manifest("frontend-style")).toContain("activation: glob");
    expect(manifest("ship")).toContain("description: Ship the release.");
    expect(manifest("jira")).toContain("command: jira-mcp");
    expect(manifest("tracker")).toContain("transport: http");
    expect(manifest("auditor")).toContain("- read");
  });
});

describe("updating your drafts (051)", () => {
  const notPublished: Route = () => ({
    status: 404,
    json: { error: { code: "item_not_found", message: "No." } },
  });
  const setup = (open: FakeOpenDraft[]) => {
    const registry = exportRoutes({ open });
    io = fakeIo({
      ...registry.routes,
      "GET /items/team/one": notPublished,
      "GET /items/team/two": notPublished,
    });
    write(io.cwd, ".claude/skills/one/SKILL.md", "---\nname: one\ndescription: One.\n---\n");
    write(io.cwd, ".claude/skills/two/SKILL.md", "---\nname: two\ndescription: Two.\n---\n");
    return { api: apiClient(io.fetch, REGISTRY, "rmk_test_token"), ...registry };
  };
  const draft = (id: string, status: FakeOpenDraft["status"], extra: Partial<FakeOpenDraft> = {}) =>
    ({ id, name: "@team/one", type: "skill", status, ...extra }) as FakeOpenDraft;
  const sent = () =>
    io.requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`);

  it("updates your newest draft of the item, says so, and makes no new draft", async () => {
    const { api, drafts, replaced } = setup([
      draft("01NEWER", "draft", { updatedAt: "2026-10-01T12:30:00.000Z" }),
      draft("01OLDER", "draft", { updatedAt: "2026-09-30T08:00:00.000Z" }),
    ]);
    const plan = await planExport(io, api, { items: ["one", "two"], to: "team" });
    expect(plan.items.find((i) => i.name === "@team/one")?.updates).toEqual({
      id: "01NEWER",
      url: `${REGISTRY}/submissions/01NEWER`,
      status: "draft",
      updatedAt: "2026-10-01T12:30:00.000Z",
    });
    expect(plan.items.find((i) => i.name === "@team/two")?.updates).toBeUndefined();
    expect(previewText(plan, "dev@example.com")).toContain(
      `Updates your draft ${REGISTRY}/submissions/01NEWER (a draft, last changed 2026-10-01 12:30 UTC): its files are replaced`,
    );
    const exported = await uploadExport(api, plan);
    expect(sent()).toEqual(["PUT /api/v1/drafts/01NEWER", "POST /api/v1/drafts"]);
    expect(replaced.map((r) => [r.id, r.name])).toEqual([["01NEWER", "@team/one"]]);
    expect(drafts.map((d) => d.name)).toEqual(["@team/two"]);
    expect(exported.map((e) => [e.name, e.id, e.updated])).toEqual([
      ["@team/one", "01NEWER", true],
      ["@team/two", drafts[0]?.id, false],
    ]);
  });

  it("updates one sent back for changes, and prefers a draft to one in review", async () => {
    let { api } = setup([draft("01BACK", "changes_requested")]);
    let plan = await planExport(io, api, { items: ["one"], to: "team" });
    expect(plan.items[0]?.updates?.status).toBe("changes_requested");
    expect(previewText(plan, "dev@example.com")).toContain("(sent back for changes, last changed");

    io.cleanup();
    ({ api } = setup([draft("01REVIEW", "submitted"), draft("01DRAFT", "draft")]));
    plan = await planExport(io, api, { items: ["one"], to: "team" });
    expect(plan.items[0]?.updates?.id).toBe("01DRAFT");
  });

  it("refuses an item that's only in review, and goes on with the rest", async () => {
    const { api } = setup([draft("01REVIEW", "submitted")]);
    const plan = await planExport(io, api, { items: ["one", "two"], to: "team" });
    expect(plan.items.map((i) => i.name)).toEqual(["@team/two"]);
    expect(plan.refused).toEqual([
      {
        local: ".claude/skills/one",
        code: "in_review",
        message:
          "@team/one is in review: withdraw it in the web app to change it, or export with --new-draft for a separate draft.",
      },
    ]);
  });

  it("doesn't match a draft of another type, or a proposal", async () => {
    const { api } = setup([
      draft("01RULE", "draft", { type: "rule" }),
      draft("01PROPOSAL", "draft", { baseVersion: "1.0.0" }),
      draft("01INREVIEW", "submitted", { type: "rule" }),
    ]);
    const plan = await planExport(io, api, { items: ["one"], to: "team" });
    expect(plan.items[0]?.updates).toBeUndefined();
    expect(plan.refused).toEqual([]);
    await uploadExport(api, plan);
    expect(sent()).toEqual(["POST /api/v1/drafts"]);
  });

  it("makes a new draft with newDraft, without looking", async () => {
    const { api } = setup([draft("01DRAFT", "draft"), draft("01REVIEW", "submitted")]);
    const plan = await planExport(io, api, { items: ["one"], to: "team", newDraft: true });
    expect(plan.items[0]?.updates).toBeUndefined();
    expect(io.requests.some((r) => r.path.startsWith("/api/v1/drafts"))).toBe(false);
    await uploadExport(api, plan);
    expect(sent()).toEqual(["POST /api/v1/drafts"]);
  });

  it("makes new drafts against a registry older than 051", async () => {
    const registry = exportRoutes();
    io = fakeIo({ ...registry.routes, "GET /items/team/one": notPublished });
    write(io.cwd, ".claude/skills/one/SKILL.md", "---\nname: one\ndescription: One.\n---\n");
    const api = apiClient(io.fetch, REGISTRY, "rmk_test_token");
    const plan = await planExport(io, api, { items: ["one"], to: "team" });
    expect(plan.items[0]?.updates).toBeUndefined();
    expect((await uploadExport(api, plan))[0]?.updated).toBe(false);
  });
});

describe("change proposals (042)", () => {
  const encoder = new TextEncoder();
  const AGENT_YAML = (description: string) =>
    `name: "@team/reviewer"\ntype: agent\ndescription: ${description}\nkeywords: [review]\nagent:\n  prompt: prompt.md\n  tools: [read]\n`;
  const agentFiles = (description = "Reviews.") => [
    { path: "ronne.yaml", bytes: encoder.encode(AGENT_YAML(description)) },
    { path: "prompt.md", bytes: encoder.encode("Review it.\n") },
  ];

  /** The registry: @team/reviewer at each version, with scopes and drafts. */
  const setup = async (versions: string[]) => {
    const registry = exportRoutes();
    const routes: Record<string, Route> = { ...registry.routes };
    for (const version of versions) {
      const packed = await packItem(agentFiles(), { version });
      routes[`GET /items/team/reviewer/${version}`] = () => ({
        json: { version, sha256: packed.sha256 },
      });
      routes[`GET /items/team/reviewer/${version}/tarball`] = () => ({
        bytes: packed.tgz,
        headers: { "x-checksum-sha256": packed.sha256 },
      });
    }
    routes["GET /items/team/reviewer"] = () => ({
      json: {
        type: "agent",
        tags: { latest: versions.at(-1) },
        versions: versions.map((version) => ({ version })),
      },
    });
    io = fakeIo(routes);
    return { api: apiClient(io.fetch, REGISTRY, "rmk_test_token"), drafts: registry.drafts };
  };

  /** Installs version 1.0.0 for Claude Code, as rmk would, and returns the file's path. */
  const install = async () => {
    const files = agentFiles();
    const { changes } = claudeCodeRenderer.render(
      {
        name: "@team/reviewer",
        version: "1.0.0",
        manifest: { ...(parseManifest(AGENT_YAML("Reviews.")).manifest ?? {}), version: "1.0.0" },
        files,
      },
      { scope: "project" },
    );
    const [change] = changes as Extract<Change, { kind: "file" }>[];
    write(io.cwd, change?.path ?? "", String(change?.content));
    const entry = { item: "@team/reviewer", kind: "file" as const, path: change?.path ?? "" };
    writeState(places(io, "project").state, {
      version: 1,
      entries: [
        {
          ...entry,
          version: "1.0.0",
          targets: ["claude-code"],
          sha256: (await diskHash(io.cwd, entry)) ?? "",
        },
      ],
    });
    return join(io.cwd, change?.path ?? "");
  };

  it("plans an edited install as a proposal from the installed version, and says when it's stale", async () => {
    const { api } = await setup(["1.0.0", "1.1.0"]);
    const path = await install();
    writeFileSync(path, readFileSync(path, "utf8").replace("Review it.", "Review it; say why."));
    const plan = await planExport(io, api, { items: ["reviewer"] });
    expect(plan.refused).toEqual([]);
    const [item] = plan.items;
    expect(item).toMatchObject({
      name: "@team/reviewer",
      type: "agent",
      proposal: {
        item: "@team/reviewer",
        baseVersion: "1.0.0",
        stale: "1.1.0",
        changes: { changed: ["prompt.md"], fields: [] },
      },
    });
    expect(parseManifest(item?.manifestText ?? "").manifest?.keywords).toEqual(["review"]);
    expect(item?.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("refuses an edit the item can't carry as nothing changed, saying what was left out", async () => {
    const { api } = await setup(["1.0.0"]);
    const path = await install();
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("tools: Read", "tools: Read\ncolor: blue"),
    );
    const plan = await planExport(io, api, { items: ["reviewer"] });
    expect(plan.items).toEqual([]);
    expect(plan.refused).toEqual([
      expect.objectContaining({ code: "no_changes", message: expect.stringContaining("`color`") }),
    ]);
  });

  it("plans the person's own item whose name is published as a proposal from latest, or a new item with --new", async () => {
    const { api } = await setup(["1.0.0", "1.1.0"]);
    write(
      io.cwd,
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviews better.\ntools: Read\n---\nReview it.\n",
    );
    const plan = await planExport(io, api, { items: ["reviewer"], to: "team" });
    expect(plan.items[0]?.proposal).toMatchObject({
      baseVersion: "1.1.0",
      stale: null,
      changes: { fields: [{ field: "description", to: "Reviews better." }] },
    });
    const asNew = await planExport(io, api, { items: ["reviewer"], to: "team", new: true });
    expect(asNew.items[0]).toMatchObject({ name: "@team/reviewer", published: true });
    expect(asNew.items[0]?.proposal).toBeUndefined();
  });

  it("plans a registry copy as a proposal from its version, and --force as a new item", async () => {
    const { api } = await setup(["1.0.0"]);
    write(io.cwd, "copy/SKILL.md", "---\nname: reviewer\ndescription: R.\n---\nR.\n");
    write(io.cwd, "copy/ronne.yaml", 'name: "@team/reviewer"\nversion: 1.0.0\ntype: agent\n');
    const plan = await planExport(io, api, { items: ["copy"], to: "team" });
    // A skill folder holding an agent's manifest: its type isn't the item's, so it's refused.
    expect(plan.refused.map((r) => r.code)).toEqual(["type_mismatch"]);
  });
});
