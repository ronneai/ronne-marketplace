import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "./api.js";
import { diskHash, writeState } from "./apply.js";
import { RmkError } from "./errors.js";
import {
  describeLocalItems,
  discoverLocalItems,
  type ExportPlan,
  findSkills,
  ownershipOf,
  planExport,
  readMcpServers,
  uploadExport,
  walkItemFolder,
} from "./export.js";
import { places } from "./install.js";
import { exportRoutes, type FakeIo, fakeIo, REGISTRY, type Route } from "./testing.js";

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
      ["copied", "registry_copy"],
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
        message: `This is @team/review 1.0.0, installed by rmk. To change it, use Propose a change on its page: ${REGISTRY}/items/team/review`,
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
      `.claude/skills/two: You already have 50 drafts. Drafts already created: @team/one (${REGISTRY}/submissions/${drafts[0]?.id}).`,
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
