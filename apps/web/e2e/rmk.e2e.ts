import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_PROPOSAL_ITEM, E2E_RMK_ITEMS, E2E_SCOPE, E2E_USERS } from "./users";

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

/**
 * `rmk` against the running instance (features 022 and 023): a token from the API, then install,
 * update, outdated and remove in a temporary project, with the Claude Code renderer.
 */
test("rmk installs an agent with its skill and MCP server into a project, updates a hook, and removes them", async ({
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".claude"));
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.installer, password: E2E_PASSWORD, name: "e2e rmk" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };
  const read = (path: string) => readFileSync(join(project, path), "utf8");
  const name = (item: string) => `@${E2E_SCOPE}/${item}`;

  try {
    expect(rmk("whoami").out).toContain(E2E_USERS.installer);

    // The agent brings the skill and the MCP server it depends on.
    const install = rmk("install", name(E2E_RMK_ITEMS.agent), "--target", "claude-code");
    expect(install.code, install.out).toBe(0);
    expect(install.out).toContain(
      "Set these environment variables before using the MCP servers: KIT_TOKEN.",
    );
    expect(read(`.claude/agents/${E2E_RMK_ITEMS.agent}.md`)).toContain("tools: Read, mcp__kit-mcp");
    expect(read(`.claude/skills/${E2E_PROPOSAL_ITEM}/SKILL.md`)).toContain("Write the why");
    expect(JSON.parse(read(".mcp.json")).mcpServers[E2E_RMK_ITEMS.mcp]).toEqual({
      command: "npx",
      args: ["-y", "@example/mcp"],
      env: { KIT_TOKEN: "${KIT_TOKEN}" },
    });
    // The skill's version depends on what other tests released before this one ran.
    const dependencies = JSON.parse(read("rmk.lock")).items[name(E2E_RMK_ITEMS.agent)].dependencies;
    expect(dependencies[name(E2E_RMK_ITEMS.mcp)]).toBe("1.0.0");
    expect(dependencies[name(E2E_PROPOSAL_ITEM)]).toMatch(/^1\.\d+\.\d+$/);
    expect(JSON.parse(read(".rmk/state.json")).entries).toHaveLength(3);

    // A hook pinned at 1.0.0, then updated within ^1.0.0 to 1.1.0.
    expect(rmk("install", `${name(E2E_RMK_ITEMS.hook)}@1.0.0`).code).toBe(0);
    expect(JSON.parse(read(".claude/settings.json")).hooks.PostToolUse[0].hooks[0].command).toBe(
      "echo kit 1.0.0",
    );
    const config = JSON.parse(read("rmk.config.json"));
    config.dependencies[name(E2E_RMK_ITEMS.hook)] = "^1.0.0";
    writeFileSync(join(project, "rmk.config.json"), JSON.stringify(config));
    const outdated = rmk("outdated");
    expect(outdated.out).toContain(`${name(E2E_RMK_ITEMS.hook)}  ^1.0.0  1.0.0  1.1.0  1.1.0`);
    const update = rmk("update", name(E2E_RMK_ITEMS.hook));
    expect(update.code, update.out).toBe(0);
    expect(update.out).toContain(`${name(E2E_RMK_ITEMS.hook)}: 1.0.0 → 1.1.0`);
    const hooks = JSON.parse(read(".claude/settings.json")).hooks.PostToolUse;
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hooks[0].command).toBe("echo kit 1.1.0");

    // Something of the user's next to rmk's things is never touched.
    writeFileSync(join(project, ".claude/agents/mine.md"), "mine\n");
    const settings = JSON.parse(read(".claude/settings.json"));
    settings.permissions = { allow: ["Read"] };
    writeFileSync(join(project, ".claude/settings.json"), JSON.stringify(settings, null, 2));
    const remove = rmk("remove", name(E2E_RMK_ITEMS.agent), name(E2E_RMK_ITEMS.hook));
    expect(remove.code, remove.out).toBe(0);
    expect(existsSync(join(project, `.claude/agents/${E2E_RMK_ITEMS.agent}.md`))).toBe(false);
    expect(existsSync(join(project, `.claude/skills/${E2E_PROPOSAL_ITEM}`))).toBe(false);
    expect(JSON.parse(read(".mcp.json"))).toEqual({});
    expect(JSON.parse(read(".claude/settings.json"))).toEqual({ permissions: { allow: ["Read"] } });
    expect(read(".claude/agents/mine.md")).toBe("mine\n");
    expect(JSON.parse(read(".rmk/state.json")).entries).toEqual([]);
    expect(rmk("list", "--installed").out).toContain("Nothing is installed here");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

/**
 * The same against Codex (024): the shared skills folder, a TOML agent, `config.toml`, `hooks.json`
 * and a section in `AGENTS.md`, next to the person's own text and keys, which rmk leaves alone.
 */
test("rmk installs for Codex, next to the person's AGENTS.md and config.toml, and removes cleanly", async ({
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".codex"));
  writeFileSync(join(project, "AGENTS.md"), "# Our project\n\nUse pnpm.\n");
  writeFileSync(join(project, ".codex/config.toml"), 'model = "o3"\n');
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.installer, password: E2E_PASSWORD, name: "e2e rmk codex" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };
  const read = (path: string) => readFileSync(join(project, path), "utf8");
  const name = (item: string) => `@${E2E_SCOPE}/${item}`;

  try {
    // Only .codex/ is here, so rmk picks Codex on its own.
    const install = rmk(
      "install",
      name(E2E_RMK_ITEMS.agent),
      name(E2E_RMK_ITEMS.hook),
      name(E2E_RMK_ITEMS.rule),
    );
    expect(install.code, install.out).toBe(0);
    expect(install.out).toContain("for codex.");
    expect(install.out).toContain("Note: Codex reads .codex/config.toml");
    expect(install.out).toContain("open /hooks in Codex");
    expect(read(`.codex/agents/${E2E_RMK_ITEMS.agent}.toml`)).toContain(
      `name = "${E2E_RMK_ITEMS.agent}"`,
    );
    expect(read(`.agents/skills/${E2E_PROPOSAL_ITEM}/SKILL.md`)).toContain("Write the why");
    const config = read(".codex/config.toml");
    expect(config).toContain('model = "o3"');
    expect(config).toContain(`[mcp_servers.${E2E_RMK_ITEMS.mcp}]`);
    expect(config).toContain('env_vars = [ "KIT_TOKEN" ]');
    expect(JSON.parse(read(".codex/hooks.json")).hooks.PostToolUse[0].hooks[0].command).toBe(
      "echo kit 1.1.0",
    );
    const agentsMd = read("AGENTS.md");
    expect(agentsMd.startsWith("# Our project\n\nUse pnpm.\n")).toBe(true);
    expect(agentsMd).toContain(`<!-- rmk:begin ${name(E2E_RMK_ITEMS.rule)} -->`);
    expect(agentsMd).toContain("Keep functions small.");
    expect(JSON.parse(read("rmk.config.json")).targets).toBeUndefined();

    const remove = rmk(
      "remove",
      name(E2E_RMK_ITEMS.agent),
      name(E2E_RMK_ITEMS.hook),
      name(E2E_RMK_ITEMS.rule),
    );
    expect(remove.code, remove.out).toBe(0);
    expect(read("AGENTS.md")).toBe("# Our project\n\nUse pnpm.\n");
    expect(read(".codex/config.toml")).toBe('model = "o3"\n');
    expect(existsSync(join(project, `.codex/agents/${E2E_RMK_ITEMS.agent}.toml`))).toBe(false);
    expect(existsSync(join(project, `.agents/skills/${E2E_PROPOSAL_ITEM}`))).toBe(false);
    expect(JSON.parse(read(".codex/hooks.json"))).toEqual({});
    expect(JSON.parse(read(".rmk/state.json")).entries).toEqual([]);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

/**
 * Cursor (025): its own files alone, then with Claude Code, where Cursor reads Claude Code's skill
 * and hook, so each is written once.
 */
test("rmk installs for Cursor, alone and with Claude Code, and removes cleanly", async ({
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".cursor"));
  writeFileSync(
    join(project, ".cursor/mcp.json"),
    '{ "mcpServers": { "mine": { "url": "x" } } }\n',
  );
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.installer, password: E2E_PASSWORD, name: "e2e rmk cursor" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };
  const read = (path: string) => readFileSync(join(project, path), "utf8");
  const name = (item: string) => `@${E2E_SCOPE}/${item}`;
  const items = [name(E2E_RMK_ITEMS.agent), name(E2E_RMK_ITEMS.hook), name(E2E_RMK_ITEMS.rule)];

  try {
    // Only .cursor/ is here, so rmk picks Cursor on its own.
    const install = rmk("install", ...items);
    expect(install.code, install.out).toBe(0);
    expect(install.out).toContain("for cursor.");
    expect(read(`.cursor/agents/${E2E_RMK_ITEMS.agent}.md`)).toContain(
      `name: ${E2E_RMK_ITEMS.agent}`,
    );
    expect(read(`.agents/skills/${E2E_PROPOSAL_ITEM}/SKILL.md`)).toContain("Write the why");
    expect(read(`.cursor/rules/${E2E_RMK_ITEMS.rule}.mdc`)).toMatch(/^---\nalwaysApply: true\n/);
    const mcp = JSON.parse(read(".cursor/mcp.json")).mcpServers;
    expect(mcp.mine).toEqual({ url: "x" });
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor's own reference syntax
    expect(mcp[E2E_RMK_ITEMS.mcp].env).toEqual({ KIT_TOKEN: "${env:KIT_TOKEN}" });
    const hooks = JSON.parse(read(".cursor/hooks.json"));
    expect(hooks.version).toBe(1);
    expect(hooks.hooks.postToolUse).toEqual([{ command: "echo kit 1.1.0", matcher: "Write" }]);

    // With Claude Code too, Cursor leaves the skill and the hook to Claude Code's copies.
    const both = rmk("install", "--target", "claude-code,cursor");
    expect(both.code, both.out).toBe(0);
    expect(both.out).toContain("Cursor reads Claude Code's copy");
    expect(existsSync(join(project, `.agents/skills/${E2E_PROPOSAL_ITEM}`))).toBe(false);
    expect(read(`.claude/skills/${E2E_PROPOSAL_ITEM}/SKILL.md`)).toContain("Write the why");
    expect(JSON.parse(read(".cursor/hooks.json"))).toEqual({});
    expect(JSON.parse(read(".claude/settings.json")).hooks.PostToolUse).toHaveLength(1);

    const remove = rmk("remove", ...items, "--target", "claude-code,cursor");
    expect(remove.code, remove.out).toBe(0);
    expect(JSON.parse(read(".cursor/mcp.json"))).toEqual({ mcpServers: { mine: { url: "x" } } });
    expect(existsSync(join(project, `.cursor/agents/${E2E_RMK_ITEMS.agent}.md`))).toBe(false);
    expect(existsSync(join(project, `.cursor/rules/${E2E_RMK_ITEMS.rule}.mdc`))).toBe(false);
    expect(JSON.parse(read(".rmk/state.json")).entries).toEqual([]);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

/**
 * `rmk export` (038): a skill the person wrote in `.claude/skills/`, uploaded with the built `rmk`
 * as a draft, which its author opens in the web editor with the same files. The folder on disk
 * isn't changed, and what's never uploaded stays behind.
 */
test("rmk exports a hand-written skill as a draft that opens in the web editor", async ({
  browser,
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  const folder = join(project, ".claude/skills/e2e-cli-export");
  mkdirSync(join(folder, "scripts"), { recursive: true });
  // No name in the frontmatter: the uploaded copy gets one, the file on disk doesn't.
  const skillMd =
    "---\ndescription: Checks a diff before it's pushed.\n---\n\nRun scripts/check.sh.\n";
  writeFileSync(join(folder, "SKILL.md"), skillMd);
  writeFileSync(join(folder, "scripts/check.sh"), "#!/bin/sh\necho ok\n", { mode: 0o755 });
  writeFileSync(join(folder, ".env"), "TOKEN=never-uploaded\n");
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.cliExporter, password: E2E_PASSWORD, name: "e2e rmk export" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };

  try {
    const dryRun = rmk("export", "e2e-cli-export", "--to", `@${E2E_SCOPE}`, "--dry-run");
    expect(dryRun.code, dryRun.out).toBe(0);
    expect(dryRun.out).toContain(
      `@${E2E_SCOPE}/e2e-cli-export  skill  (from .claude/skills/e2e-cli-export)`,
    );
    expect(dryRun.out).toContain(".env  (may hold a secret)");

    const exported = rmk("export", "e2e-cli-export", "--to", `@${E2E_SCOPE}`, "--yes", "--json");
    expect(exported.code, exported.out).toBe(0);
    const result = JSON.parse(exported.out);
    expect(result.exported).toHaveLength(1);
    const [draft] = result.exported;
    expect(draft).toMatchObject({
      name: `@${E2E_SCOPE}/e2e-cli-export`,
      type: "skill",
      issues: [],
      skipped: [{ path: ".env", reason: "secret_file" }],
    });
    expect(draft.url).toMatch(new RegExp(`^${baseURL}/submissions/[0-9A-Z]{26}$`));
    expect(readFileSync(join(folder, "SKILL.md"), "utf8")).toBe(skillMd);

    const author = await browser.newPage();
    await author.goto("/sign-in");
    await author.getByLabel("Email").fill(E2E_USERS.cliExporter);
    await author.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await author.getByRole("button", { name: "Sign in" }).click();
    await expect(author).not.toHaveURL(/\/sign-in/);
    await author.goto(draft.url);
    const files = author.getByRole("list", { name: "Files" });
    for (const path of [/SKILL\.md/, /ronne\.yaml/, /check\.sh/])
      await expect(files.getByRole("button", { name: path })).toBeVisible();
    await expect(files.getByRole("button", { name: /\.env/ })).toHaveCount(0);
    await files.getByRole("button", { name: /SKILL\.md/ }).click();
    await expect(author.getByLabel("Contents of SKILL.md")).toContainText("name: e2e-cli-export");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

/**
 * `rmk export` for the other types (040): an agent and an MCP server from Claude Code's own files,
 * uploaded with the built `rmk`. The server's credentials never leave the machine: the draft
 * declares variables instead.
 */
test("rmk exports an agent and an MCP server, keeping the server's credentials out", async ({
  browser,
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  const secret = `ghp_${"e2E9".repeat(9)}`;
  mkdirSync(join(project, ".claude/agents"), { recursive: true });
  writeFileSync(
    join(project, ".claude/agents/e2e-agent.md"),
    "---\nname: e2e-agent\ndescription: Reviews diffs before they're pushed.\ntools: Read, Grep\nmodel: opus\ncolor: green\n---\nYou review diffs.\n",
  );
  writeFileSync(
    join(project, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "e2e-tracker": {
          type: "http",
          url: "https://tracker.example/mcp",
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    }),
  );
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.typesExporter, password: E2E_PASSWORD, name: "e2e rmk export types" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };

  try {
    const listed = JSON.parse(rmk("export", "--json").out);
    expect(listed.found).toEqual([
      { name: "e2e-agent", type: "agent", path: ".claude/agents/e2e-agent.md" },
      { name: "e2e-tracker", type: "mcp-server", path: ".mcp.json (mcpServers.e2e-tracker)" },
    ]);

    const agent = rmk("export", "e2e-agent", "--to", `@${E2E_SCOPE}`, "--yes", "--json");
    expect(agent.code, agent.out).toBe(0);
    const [agentDraft] = JSON.parse(agent.out).exported;
    expect(agentDraft).toMatchObject({
      name: `@${E2E_SCOPE}/e2e-agent`,
      type: "agent",
      issues: [],
    });
    expect(agentDraft.warnings.map((w: { message: string }) => w.message)).toEqual([
      expect.stringContaining("`color` was left out"),
    ]);

    const server = rmk(
      "export",
      "e2e-tracker",
      "--to",
      `@${E2E_SCOPE}`,
      "--description",
      "Tracks issues.",
      "--yes",
      "--json",
    );
    expect(server.code, server.out).toBe(0);
    expect(server.out).not.toContain(secret);
    const [serverDraft] = JSON.parse(server.out).exported;
    expect(serverDraft).toMatchObject({
      name: `@${E2E_SCOPE}/e2e-tracker`,
      type: "mcp-server",
      issues: [],
    });

    const author = await browser.newPage();
    await author.goto("/sign-in");
    await author.getByLabel("Email").fill(E2E_USERS.typesExporter);
    await author.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await author.getByRole("button", { name: "Sign in" }).click();
    await expect(author).not.toHaveURL(/\/sign-in/);

    await author.goto(agentDraft.url);
    const agentFiles = author.getByRole("list", { name: "Files" });
    await expect(agentFiles.getByRole("button", { name: /prompt\.md/ })).toBeVisible();
    await expect(agentFiles.getByRole("button", { name: /ronne\.yaml/ })).toBeVisible();

    await author.goto(serverDraft.url);
    const serverFiles = author.getByRole("list", { name: "Files" });
    await serverFiles.getByRole("button", { name: /ronne\.yaml/ }).click();
    await author.getByRole("button", { name: "YAML", exact: true }).click();
    const manifest = author.getByLabel("Contents of ronne.yaml");
    await expect(manifest).toContainText("Bearer ${E2E_TRACKER_TOKEN}");
    await expect(manifest).not.toContainText(secret);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

/**
 * Dependencies on export (041): an agent that loads a skill of the person's own, exported with
 * it. The agent can't be submitted until the skill is released; then it can.
 */
test("rmk exports an agent with its skill, and the agent is submitted once the skill is released", async ({
  browser,
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".claude/agents"), { recursive: true });
  mkdirSync(join(project, ".claude/skills/e2e-dep-skill"), { recursive: true });
  writeFileSync(
    join(project, ".claude/agents/e2e-dep-agent.md"),
    "---\nname: e2e-dep-agent\ndescription: Reviews with the house checklist.\nskills: [e2e-dep-skill]\ntools: Read\n---\nReview the diff.\n",
  );
  writeFileSync(
    join(project, ".claude/skills/e2e-dep-skill/SKILL.md"),
    "---\nname: e2e-dep-skill\ndescription: The house review checklist.\n---\nCheck names and tests.\n",
  );
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.depsExporter, password: E2E_PASSWORD, name: "e2e rmk export deps" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };
  const signIn = async (email: string) => {
    const page = await browser.newPage();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);
    return page;
  };
  const skillName = `@${E2E_SCOPE}/e2e-dep-skill`;
  const agentName = `@${E2E_SCOPE}/e2e-dep-agent`;

  try {
    // Without a terminal, the choice is required.
    const undecided = rmk("export", "e2e-dep-agent", "--to", `@${E2E_SCOPE}`, "--yes", "--json");
    expect(undecided.code).toBe(2);

    const exported = rmk(
      "export",
      "e2e-dep-agent",
      "--to",
      `@${E2E_SCOPE}`,
      "--yes",
      "--with-deps",
      "--json",
    );
    expect(exported.code, exported.out).toBe(0);
    const result = JSON.parse(exported.out);
    expect(result.exported.map((e: { name: string }) => e.name)).toEqual([skillName, agentName]);
    expect(result.order).toEqual([{ item: agentName, after: [skillName] }]);
    const [skillDraft, agentDraft] = result.exported as { id: string; url: string }[];

    // The agent can't be submitted before the skill is released.
    const author = await signIn(E2E_USERS.depsExporter);
    await author.goto(agentDraft?.url ?? "");
    await author.getByRole("button", { name: "Submit for review" }).click();
    const refused = author.getByRole("dialog", { name: "Submit for review" });
    await expect(refused.getByText("Fix these before submitting:")).toBeVisible();
    await expect(
      refused.getByText(new RegExp(`${skillName} isn't a published item`)),
    ).toBeVisible();
    await refused.getByRole("button", { name: "Close" }).first().click();

    // The skill: submitted, approved by a moderator, and published as 1.0.0.
    await author.goto(skillDraft?.url ?? "");
    await author.getByRole("button", { name: "Submit for review" }).click();
    const submitSkill = author.getByRole("dialog", { name: "Submit for review" });
    await expect(submitSkill.getByText("All checks passed.")).toBeVisible();
    await submitSkill.getByRole("button", { name: "Submit for review" }).click();
    await expect(author.getByText(/Submitted for review on/)).toBeVisible();

    const moderator = await signIn(E2E_USERS.depsModerator);
    await moderator.goto(`/reviews/${skillDraft?.id}`);
    await moderator.getByRole("button", { name: "Approve", exact: true }).click();
    const approve = moderator.getByRole("dialog", { name: "Approve this submission?" });
    await approve.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(moderator.getByText("approved it")).toBeVisible();

    await author.goto(skillDraft?.url ?? "");
    await author.getByRole("button", { name: "Publish", exact: true }).click();
    const publish = author.getByRole("dialog", { name: new RegExp(`Publish ${skillName}`) });
    await publish.getByRole("button", { name: "Publish 1.0.0" }).click();
    await expect(publish.getByText(`Published ${skillName} 1.0.0 as latest.`)).toBeVisible();
    await publish.getByRole("button", { name: "Done" }).click();

    // Now the agent's checks pass, and it's submitted.
    await author.goto(agentDraft?.url ?? "");
    await author.getByRole("button", { name: "Submit for review" }).click();
    const submitAgent = author.getByRole("dialog", { name: "Submit for review" });
    await expect(submitAgent.getByText("All checks passed.")).toBeVisible();
    await submitAgent.getByRole("button", { name: "Submit for review" }).click();
    await expect(author.getByText(/Submitted for review on/)).toBeVisible();
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
