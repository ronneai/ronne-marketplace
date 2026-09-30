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
      "1. deploy  (.claude/skills/deploy)\n  2. review  (.claude/skills/review)",
    );
    expect(io.questions[1]).toContain("1. @team  A team.");
    const preview = io.questions[2] ?? "";
    expect(preview).toContain(`Registry: ${REGISTRY}, as dev@example.com`);
    expect(preview).toContain("@team/review  (from .claude/skills/review)");
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
    expect(result.stdout).toContain("@team/deploy  (from .claude/skills/deploy)");
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
    expect(result.stdout).toContain("1. deploy  (.claude/skills/deploy)");
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
