import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import { configPath } from "./config.js";
import { exportRoutes, type FakeIo, fakeIo, identityRoutes, REGISTRY } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const rmk = (...argv: string[]) => run(argv, io);
const config = () => JSON.parse(readFileSync(configPath(io), "utf8"));

describe("rmk basics", () => {
  it("prints the version and usage (help with exit 0), and refuses unknown commands and options with exit 2", async () => {
    io = fakeIo({});
    expect((await rmk("--version")).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(await rmk()).toMatchObject({ exitCode: 2 });
    expect((await rmk()).stdout).toContain("Usage: rmk");
    expect(await rmk("--help")).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Usage: rmk"),
    });
    expect(await rmk("fly")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("`fly`"),
    });
    expect(await rmk("--nope")).toMatchObject({ exitCode: 2 });
    const json = await rmk("fly", "--json");
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(json.stderr).toBe("");
  });
});

describe("rmk login", () => {
  it("asks for the email and password, stores the token with mode 0600, and makes the registry the default", async () => {
    io = fakeIo(identityRoutes("rmk_secret"));
    io.answers.push("dev@example.com", "correct horse");
    const result = await rmk("login", "--registry", `${REGISTRY}/`);
    expect(result).toEqual({
      exitCode: 0,
      stdout: `Logged in to ${REGISTRY} as dev@example.com.\n`,
      stderr: "",
    });
    expect(io.requests[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/auth/token",
      body: {
        email: "dev@example.com",
        password: "correct horse",
        name: expect.stringContaining("rmk on "),
      },
    });
    expect(io.requests[0]?.headers["user-agent"]).toMatch(/^rmk\//);
    expect(config()).toEqual({
      defaultRegistry: REGISTRY,
      registries: { [REGISTRY]: { email: "dev@example.com", token: "rmk_secret" } },
      version: 1,
    });
    expect(statSync(configPath(io)).mode & 0o777).toBe(0o600);
  });

  it("takes a token made in the web app, after checking it", async () => {
    io = fakeIo(identityRoutes("rmk_web"));
    expect(
      await rmk("login", "--registry", REGISTRY, "--token", "rmk_web", "--json"),
    ).toMatchObject({ exitCode: 0 });
    expect(config().registries[REGISTRY]).toEqual({ email: "dev@example.com", token: "rmk_web" });
    const wrong = await rmk("login", "--registry", REGISTRY, "--token", "rmk_nope");
    expect(wrong).toMatchObject({ exitCode: 1, stderr: "The access token isn't valid.\n" });
  });

  it("says when the password is wrong, and refuses to ask without a terminal", async () => {
    io = fakeIo(identityRoutes());
    io.answers.push("dev@example.com", "wrong");
    expect(await rmk("login", "--registry", REGISTRY)).toMatchObject({
      exitCode: 1,
      stderr: "Email or password is wrong.\n",
    });
    expect(existsSync(configPath(io))).toBe(false);
    io.interactive = false;
    expect(await rmk("login", "--registry", REGISTRY)).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--token"),
    });
  });

  it("refuses http registries except localhost, unless --insecure", async () => {
    io = fakeIo(identityRoutes());
    expect(await rmk("login", "--registry", "http://ronne.example", "--token", "x")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--insecure"),
    });
    io = fakeIo(identityRoutes("x"));
    expect(await rmk("login", "--registry", "http://localhost:3000", "--token", "x")).toMatchObject(
      { exitCode: 0 },
    );
    expect(
      await rmk("login", "--registry", "http://ronne.example", "--token", "x", "--insecure"),
    ).toMatchObject({ exitCode: 0 });
    expect(await rmk("login", "--registry", "not a url", "--token", "x")).toMatchObject({
      exitCode: 2,
    });
  });
});

describe("rmk whoami and logout", () => {
  it("uses the stored token, or RMK_TOKEN and RMK_REGISTRY over it", async () => {
    io = fakeIo(identityRoutes("rmk_stored"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_stored");
    expect((await rmk("whoami")).stdout).toBe(
      `Dev <dev@example.com> (user) at ${REGISTRY}, with the token "rmk on laptop".\n`,
    );
    const json = JSON.parse((await rmk("whoami", "--json")).stdout);
    expect(json).toMatchObject({
      ok: true,
      registry: REGISTRY,
      user: { email: "dev@example.com" },
    });
    io.env.RMK_TOKEN = "rmk_env";
    expect(await rmk("whoami")).toMatchObject({
      exitCode: 1,
      stderr: "The access token isn't valid.\n",
    });
    expect(io.requests.at(-1)?.headers.authorization).toBe("Bearer rmk_env");
  });

  it("needs a login first, and refuses a config other users can read", async () => {
    io = fakeIo(identityRoutes());
    expect(await rmk("whoami")).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("rmk login"),
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_test_token");
    chmodSync(configPath(io), 0o644);
    expect(await rmk("whoami")).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("chmod 600"),
    });
  });

  it("revokes the token on the server and removes it locally, even when the server can't be reached", async () => {
    io = fakeIo(identityRoutes("rmk_a"));
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_a");
    expect((await rmk("logout")).stdout).toBe(`Logged out of ${REGISTRY}.\n`);
    expect(io.requests.at(-1)).toMatchObject({ method: "DELETE", path: "/api/v1/auth/token" });
    expect(config()).toEqual({ registries: {}, version: 1 });
    expect(await rmk("whoami")).toMatchObject({ exitCode: 2 });

    io = fakeIo({
      ...identityRoutes("rmk_b"),
      "DELETE /auth/token": () => {
        throw new TypeError("fetch failed");
      },
    });
    await rmk("login", "--registry", REGISTRY, "--token", "rmk_b");
    const offline = await rmk("logout");
    expect(offline.exitCode).toBe(0);
    expect(offline.stdout).toContain("removed here anyway");
    expect(config().registries).toEqual({});
  });
});

describe("rmk export", () => {
  const SCOPES = [
    { name: "team", description: "A team." },
    { name: "platform", description: "Shared tools." },
  ];
  const setup = (
    options: {
      interactive?: boolean;
      fail?: Record<string, { status: number; json?: unknown }>;
    } = {},
  ) => {
    const registry = exportRoutes({ scopes: SCOPES, fail: options.fail });
    io = fakeIo(
      {
        ...identityRoutes("rmk_test_token"),
        ...registry.routes,
        ...Object.fromEntries(
          ["team", "platform"].flatMap((scope) =>
            ["review", "deploy"].map((name) => [
              `GET /items/${scope}/${name}`,
              () => ({ status: 404, json: { error: { code: "item_not_found", message: "No." } } }),
            ]),
          ),
        ),
      },
      {
        env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY },
        interactive: options.interactive ?? true,
      },
    );
    for (const name of ["review", "deploy"]) {
      const path = join(io.cwd, ".claude/skills", name, "SKILL.md");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\nname: ${name}\ndescription: The ${name} skill.\n---\nBody.\n`);
    }
    return registry;
  };
  const posts = () => io.requests.filter((r) => r.method === "POST");

  it("lists the skills found, asks which, then the scope, shows the preview in the question, and uploads", async () => {
    const { drafts } = setup();
    writeFileSync(join(io.cwd, ".claude/skills/review/.env"), "TOKEN=x");
    io.answers.push("2", "1", "y");
    const result = await rmk("export");
    expect(io.questions[0]).toContain(
      "1. deploy  skill  (.claude/skills/deploy)\n  2. review  skill  (.claude/skills/review)",
    );
    expect(io.questions[1]).toContain("1. @team  A team.");
    const preview = io.questions[2] ?? "";
    expect(preview).toContain(`Registry: ${REGISTRY}, as dev@example.com`);
    expect(preview).toContain("@team/review  skill  (from .claude/skills/review)");
    expect(preview).toContain(".env  (may hold a secret)");
    expect(preview).toContain('name: "@team/review"');
    expect(preview).toMatch(/Upload 1 item as drafts to https:\/\/ronne\.example\? \[y\/N\] $/);
    expect(result.exitCode).toBe(0);
    expect(drafts.map((d) => d.name)).toEqual(["@team/review"]);
    expect(result.stdout).toContain(
      `@team/review: draft created at ${REGISTRY}/submissions/${drafts[0]?.id}`,
    );
    expect(result.stdout).toContain("Nothing is submitted");
  });

  it("uploads nothing when the answer is no, or when nothing is chosen, and exits 0", async () => {
    setup();
    io.answers.push("n");
    expect(await rmk("export", "review", "--to", "@team")).toMatchObject({
      exitCode: 0,
      stdout: "Nothing uploaded.\n",
    });
    io.answers.push("");
    expect(await rmk("export")).toMatchObject({ exitCode: 0, stdout: "Nothing exported.\n" });
    expect(posts()).toEqual([]);
  });

  it("--dry-run shows the plan and sends no POST, in a terminal or not", async () => {
    setup({ interactive: false });
    const result = await rmk("export", "review", "deploy", "--to", "team", "--dry-run");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("@team/deploy  skill  (from .claude/skills/deploy)");
    expect(result.stdout).toContain("Dry run: nothing was uploaded.");
    const json = JSON.parse(
      (await rmk("export", "review", "--to", "team", "--dry-run", "--json")).stdout,
    );
    expect(json).toMatchObject({
      ok: true,
      registry: REGISTRY,
      to: "team",
      exported: [],
      refused: [],
      planned: [{ local: ".claude/skills/review", name: "@team/review", published: false }],
    });
    expect(posts()).toEqual([]);
  });

  it("without a terminal, needs --yes and a scope, exits 2 and sends nothing; with them, uploads", async () => {
    setup({ interactive: false });
    const noYes = await rmk("export", "review", "--to", "team", "--json");
    expect(noYes.exitCode).toBe(2);
    expect(JSON.parse(noYes.stdout).error).toMatchObject({ code: "usage", scopes: SCOPES });
    const noScope = await rmk("export", "review", "--yes", "--json");
    expect(noScope.exitCode).toBe(2);
    expect(JSON.parse(noScope.stdout).error).toMatchObject({
      code: "scope_required",
      scopes: SCOPES,
    });
    expect(posts()).toEqual([]);

    const json = JSON.parse(
      (await rmk("export", "review", "--to", "team", "--yes", "--json")).stdout,
    );
    expect(json).toMatchObject({
      ok: true,
      registry: REGISTRY,
      to: "team",
      exported: [
        {
          local: ".claude/skills/review",
          name: "@team/review",
          type: "skill",
          id: expect.any(String),
          url: expect.stringContaining("/submissions/"),
          issues: [],
          submitIssues: [],
          warnings: [],
          skipped: [],
        },
      ],
      refused: [],
    });
    expect(io.questions).toEqual([]);
  });

  it("lists the skills without a terminal, and exports nothing", async () => {
    setup({ interactive: false });
    const result = await rmk("export");
    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain("1. deploy  skill  (.claude/skills/deploy)");
    expect(posts()).toEqual([]);
  });

  it("exits 1 when everything is refused, and on a partial upload, naming the drafts made", async () => {
    setup({
      interactive: false,
      fail: {
        "@team/review": {
          status: 409,
          json: { error: { code: "draft_limit", message: "You already have 50 drafts." } },
        },
      },
    });
    writeFileSync(
      join(io.cwd, ".claude/skills/deploy/ronne.yaml"),
      'name: "@x/deploy"\nversion: 1.0.0\ntype: skill\n',
    );
    const refused = await rmk("export", "deploy", "--to", "team", "--yes", "--json");
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      ok: false,
      refused: [{ path: ".claude/skills/deploy", code: "registry_copy" }],
      error: { code: "nothing_to_export" },
    });

    const partial = await rmk("export", "deploy", "review", "--to", "team", "--yes", "--force");
    expect(partial.exitCode).toBe(1);
    expect(partial.stdout).toContain("@team/deploy: draft created at");
    expect(partial.stderr).toContain("Drafts already created: @team/deploy");
  });

  it("needs a login before reading anything", async () => {
    io = fakeIo({}, { env: { RMK_REGISTRY: REGISTRY } });
    const result = await rmk("export", "review", "--to", "team", "--json");
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).error.code).toBe("not_logged_in");
    expect(io.requests).toEqual([]);
  });
});

describe("rmk export for agents, commands, rules and MCP servers (040)", () => {
  const SECRETS = { env: `sk-ant-${"a1B2c3D4".repeat(4)}`, header: `ghp_${"a1B2".repeat(9)}` };
  const NAMES = ["reviewer", "review", "style", "github"];
  const setup = (interactive = false) => {
    const registry = exportRoutes({ scopes: [{ name: "team", description: "A team." }] });
    io = fakeIo(
      {
        ...identityRoutes("rmk_test_token"),
        ...registry.routes,
        ...Object.fromEntries(
          NAMES.map((name) => [
            `GET /items/team/${name}`,
            () => ({ status: 404, json: { error: { code: "item_not_found", message: "No." } } }),
          ]),
        ),
      },
      { env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY }, interactive },
    );
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(io.cwd, path)), { recursive: true });
      writeFileSync(join(io.cwd, path), text);
    };
    write(
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviews diffs.\ntools: Read, Grep, Skill\nmodel: sonnet\ncolor: blue\n---\nReview it.\n",
    );
    write(".claude/skills/review/SKILL.md", "---\nname: review\ndescription: Reviews.\n---\nGo.\n");
    write(
      ".claude/commands/review.md",
      "---\ndescription: Reviews a file.\narguments: [file]\nallowed-tools: Read\n---\nReview $file.\n",
    );
    write(".claude/rules/style.md", "---\npaths: src/**/*.ts\n---\n# Style\n\nUse tabs.\n");
    write(
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          github: {
            type: "http",
            url: "https://api.example.com/mcp",
            headers: { Authorization: `Bearer ${SECRETS.header}` },
            env: { GITHUB_API_KEY: SECRETS.env },
            timeout: 600000,
          },
        },
      }),
    );
    return registry;
  };
  const json = async (...argv: string[]) => {
    const result = await rmk(...argv, "--json");
    return { code: result.exitCode, body: JSON.parse(result.stdout) };
  };

  it("lists every type, narrows with --type, and says a name two types have is ambiguous", async () => {
    setup();
    const all = await json("export");
    expect(
      all.body.found.map((f: { name: string; type: string }) => `${f.type}:${f.name}`),
    ).toEqual([
      "mcp-server:github",
      "skill:review",
      "command:review",
      "agent:reviewer",
      "rule:style",
    ]);
    const agents = await json("export", "--type", "agent");
    expect(agents.body.found).toEqual([
      { name: "reviewer", type: "agent", path: ".claude/agents/reviewer.md" },
    ]);
    const ambiguous = await json("export", "review", "--to", "team", "--dry-run");
    expect(ambiguous.code).toBe(2);
    expect(ambiguous.body.error).toMatchObject({
      code: "ambiguous",
      types: ["skill", "command"],
    });
    const command = await json(
      "export",
      "review",
      "--type",
      "command",
      "--to",
      "team",
      "--dry-run",
    );
    expect(command.body.planned).toMatchObject([{ name: "@team/review", type: "command" }]);
    expect((await json("export", "--type", "hook")).code).toBe(2);
  });

  it("uploads each type, with what it loses in the warnings, and no secret in any request", async () => {
    const { drafts } = setup();
    const dryRun = await rmk(
      "export",
      "reviewer",
      "style",
      "github",
      "--to",
      "team",
      "--description",
      "GitHub.",
      "--dry-run",
    );
    expect(dryRun.exitCode).toBe(2);
    expect(dryRun.stderr).toContain("--description describes one item");
    const preview = (await rmk("export", "reviewer", "--to", "team", "--dry-run")).stdout;
    expect(preview).toContain("@team/reviewer  agent  (from .claude/agents/reviewer.md)");
    expect(preview).toContain("`Skill` was left out");
    expect(preview).toContain("`sonnet` was read as the default");
    expect(preview).toContain("`color` was left out");

    for (const argv of [
      ["reviewer"],
      ["review", "--type", "command"],
      ["style"],
      ["github", "--description", "GitHub's issues and pull requests."],
    ]) {
      const result = await json("export", ...argv, "--to", "team", "--yes");
      expect(result.code, argv.join(" ")).toBe(0);
    }
    expect(drafts.map((d) => [d.name, d.type])).toEqual([
      ["@team/reviewer", "agent"],
      ["@team/review", "command"],
      ["@team/style", "rule"],
      ["@team/github", "mcp-server"],
    ]);
    const github = drafts[3]?.files.find((f) => (f as { path: string }).path === "ronne.yaml") as {
      content: string;
    };
    expect(github.content).toContain("Authorization: Bearer ${GITHUB_TOKEN}");
    expect(github.content).toContain("name: GITHUB_API_KEY");
    expect(github.content).toContain("GitHub's issues and pull requests.");
    const sent = JSON.stringify(io.requests);
    for (const secret of Object.values(SECRETS)) expect(sent).not.toContain(secret);
  });

  it("asks for an MCP server's description in a terminal", async () => {
    const { drafts } = setup(true);
    io.answers.push("Talks to GitHub.", "y");
    const result = await rmk("export", "github", "--to", "team");
    expect(result.exitCode).toBe(0);
    expect(io.questions[0]).toContain(".mcp.json (mcpServers.github) has no description");
    expect(io.questions[1]).toContain(
      "A credential in mcpServers.github.headers.Authorization was taken out",
    );
    const manifest = drafts[0]?.files.find(
      (f) => (f as { path: string }).path === "ronne.yaml",
    ) as {
      content: string;
    };
    expect(manifest.content).toContain("description: Talks to GitHub.");
  });
});

describe("rmk export with dependencies (041)", () => {
  const setup = (interactive = false) => {
    const registry = exportRoutes({ scopes: [{ name: "team", description: "A team." }] });
    io = fakeIo(
      { ...identityRoutes("rmk_test_token"), ...registry.routes },
      { env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY }, interactive },
    );
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(io.cwd, path)), { recursive: true });
      writeFileSync(join(io.cwd, path), text);
    };
    write(
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviews.\nskills: [secure]\ntools: Read, mcp__github__search\n---\nReview.\n",
    );
    write(".claude/skills/secure/SKILL.md", "---\nname: secure\ndescription: Secure.\n---\nGo.\n");
    write(
      ".mcp.json",
      JSON.stringify({ mcpServers: { github: { type: "http", url: "https://g.example/mcp" } } }),
    );
    return registry;
  };
  const posts = () => io.requests.filter((r) => r.method === "POST");

  it("asks in a terminal, exports them too by default, dependencies first, and says the order", async () => {
    const { drafts } = setup(true);
    io.answers.push("", "GitHub.", "y");
    const result = await rmk("export", "reviewer", "--to", "team");
    expect(result.exitCode).toBe(0);
    expect(io.questions[0]).toContain(
      "  - MCP server github  (.mcp.json (mcpServers.github)): yours",
    );
    expect(io.questions[0]).toContain("  1. Export them too (recommended)");
    expect(io.questions[2]).toContain("Depends on:\n    @team/github ^1.0.0  (exported with it)");
    expect(io.questions[2]).toContain(
      "@team/secure  skill  (from .claude/skills/secure)  used by another item",
    );
    expect(drafts.map((d) => d.name)).toEqual(["@team/github", "@team/secure", "@team/reviewer"]);
    expect(result.stdout).toContain(
      "Submit and release @team/github and @team/secure first; then @team/reviewer can be submitted.",
    );
  });

  it("exports only the item when the answer is 2, and nothing when it's 3", async () => {
    const { drafts } = setup(true);
    io.answers.push("2", "y");
    expect((await rmk("export", "reviewer", "--to", "team")).exitCode).toBe(0);
    expect(drafts.map((d) => d.name)).toEqual(["@team/reviewer"]);
    io.answers.push("3");
    expect(await rmk("export", "reviewer", "--to", "team")).toMatchObject({
      exitCode: 0,
      stdout: "Nothing exported.\n",
    });
    expect(posts()).toHaveLength(1);
  });

  it("without a terminal, needs --with-deps or --no-deps, and takes either", async () => {
    const { drafts } = setup();
    const missing = await rmk("export", "reviewer", "--to", "team", "--yes", "--json");
    expect(missing.exitCode).toBe(2);
    expect(JSON.parse(missing.stdout).error).toMatchObject({
      code: "dependencies_required",
      findings: [
        { status: "yours", reference: { name: "github" } },
        { status: "yours", reference: { name: "secure" } },
      ],
    });
    expect(posts()).toEqual([]);
    const both = await rmk(
      "export",
      "reviewer",
      "--to",
      "team",
      "--yes",
      "--with-deps",
      "--no-deps",
    );
    expect(both.exitCode).toBe(2);

    const withDeps = JSON.parse(
      (await rmk("export", "reviewer", "--to", "team", "--yes", "--with-deps", "--json")).stdout,
    );
    expect(withDeps.exported.map((e: { name: string }) => e.name)).toEqual([
      "@team/github",
      "@team/secure",
      "@team/reviewer",
    ]);
    expect(withDeps.order).toEqual([
      { item: "@team/reviewer", after: ["@team/github", "@team/secure"] },
    ]);
    const noDeps = JSON.parse(
      (await rmk("export", "reviewer", "--to", "team", "--yes", "--no-deps", "--json")).stdout,
    );
    expect(noDeps.exported.map((e: { name: string }) => e.name)).toEqual(["@team/reviewer"]);
    expect(noDeps.order).toBeUndefined();
    expect(drafts).toHaveLength(4);
  });
});
