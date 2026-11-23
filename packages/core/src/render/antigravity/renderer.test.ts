import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { TOOLS } from "./mappings.js";
import { antigravityRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  antigravityRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};
const rule = (block: Record<string, unknown>, scope: "project" | "user" = "project") =>
  antigravityRenderer.render(withBlock("house-style", "rule", block), { scope });

describe("the Antigravity renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(antigravityRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by Antigravity's own files, not by .agents or its skills", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    for (const path of [
      ".agents/rules",
      ".agents/agents",
      ".agents/hooks.json",
      ".agents/mcp_config.json",
    ])
      expect(await antigravityRenderer.detect(probe([".agents", path]))).toBe(true);
    expect(await antigravityRenderer.detect(probe([".agents", ".agents/skills"]))).toBe(false);
    expect(await antigravityRenderer.detect(probe([".gemini", "GEMINI.md", "AGENTS.md"]))).toBe(
      false,
    );
  });

  it("writes skills and commands byte for byte as the shared copy, in the home folder under .gemini/config", () => {
    for (const name of ["secure-coding", "review-diff"]) {
      const shared = codexRenderer.render(example(name), { scope: "project" }).changes;
      expect(render(name).changes).toEqual(shared);
      const user = codexRenderer.render(example(name), { scope: "user" }).changes;
      expect(render(name, { scope: "user" }).changes).toEqual(
        user.map((change) => ({
          ...change,
          path: change.path.replace(".agents/skills/", ".gemini/config/skills/"),
        })),
      );
    }
  });

  it("maps an agent's tools and model hint, and warns about an MCP tool", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes.map((c) => c.path)).toEqual([".agents/agents/code-reviewer.md"]);
    expect(text(changes[0])).toContain(
      "tools:\n  - view_file\n  - grep_search\n  - find_by_name\n  - run_command\nmodel: pro\n",
    );
    expect(warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
    expect(warnings[0]?.message).toContain("mcp:github-mcp");
    const user = render("code-reviewer", { scope: "user" });
    expect(user.changes.map((c) => c.path)).toEqual([".gemini/config/agents/code-reviewer.md"]);
  });

  it("maps every canonical tool once, and every model hint", () => {
    const item = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: [...Object.keys(TOOLS), "read", "teleport"],
      model: "fast",
    });
    const { changes, warnings } = antigravityRenderer.render(item, { scope: "project" });
    expect(text(changes[0])).toContain(
      "tools:\n  - view_file\n  - replace_file_content\n  - write_to_file\n  - grep_search\n  - find_by_name\n  - run_command\n  - read_url_content\n  - search_web\nmodel: flash\n",
    );
    expect(warnings.filter((w) => w.code === "unmapped_tool")).toHaveLength(1);
    const model = (hint: string) =>
      text(
        antigravityRenderer.render(
          withBlock("code-reviewer", "agent", { prompt: "prompt.md", model: hint }),
          { scope: "project" },
        ).changes[0],
      );
    expect(model("default")).toContain("model: inherit\n");
    expect(model("strong")).toContain("model: pro\n");
  });

  it("leaves `tools` out when the manifest names none, and takes a model override", () => {
    const item = withBlock("code-reviewer", "agent", { prompt: "prompt.md", model: "fast" });
    const overridden = {
      ...item,
      manifest: {
        ...item.manifest,
        targets: { antigravity: { overrides: { model: "gemini-3-pro", effort: "high" } } },
      },
    };
    const { changes, warnings } = antigravityRenderer.render(overridden, { scope: "project" });
    expect(text(changes[0])).not.toContain("tools:");
    expect(text(changes[0])).toContain("model: gemini-3-pro\n");
    expect(warnings.map((w) => w.code)).toEqual(["invalid_override"]);
  });

  it("pins each rule's trigger", () => {
    expect(text(rule({ body: "rule.md", activation: "always" }).changes[0])).toMatch(
      /^---\ntrigger: always_on\n/,
    );
    const glob = rule({ body: "rule.md", activation: "glob", globs: ["**/*.ts", "**/*.tsx"] });
    expect(glob.changes[0]?.path).toBe(".agents/rules/house-style.md");
    expect(text(glob.changes[0])).toContain("trigger: glob\n");
    expect(text(glob.changes[0])).toContain('globs: "**/*.ts, **/*.tsx"\n');
    expect(text(rule({ body: "rule.md", activation: "model" }).changes[0])).toMatch(
      /^---\ntrigger: model_decision\ndescription: /,
    );
    expect(rule({ body: "rule.md" }, "user").changes[0]?.path).toBe(
      ".gemini/config/rules/house-style.md",
    );
  });

  it("writes a manual rule as the same skill Codex writes", () => {
    const block = { body: "rule.md", activation: "manual" };
    const codex = codexRenderer.render(withBlock("house-style", "rule", block), {
      scope: "project",
    });
    expect(rule(block).changes).toEqual(codex.changes);
    expect(rule(block, "user").changes[0]?.path).toBe(".gemini/config/skills/house-style");
  });

  it("warns about a rule Antigravity would truncate", () => {
    const item = withBlock("house-style", "rule", { body: "big.md", activation: "always" });
    const big = {
      ...item,
      files: [
        ...item.files,
        { path: "big.md", bytes: new TextEncoder().encode("x".repeat(24_001)) },
      ],
    };
    const { changes, warnings } = antigravityRenderer.render(big, { scope: "project" });
    expect(changes).toHaveLength(1);
    expect(warnings[0]?.message).toContain("24,000 bytes");
  });

  const hook = (block: Record<string, unknown>, scope: "project" | "user" = "project") =>
    antigravityRenderer.render(withBlock("format-on-edit", "hook", block), { scope });
  const keyValue = (change: Change | undefined) =>
    change?.kind === "json-key" ? (change.value as Record<string, unknown[]>) : {};

  it("maps the four events Antigravity has, with bare handlers outside tool events", () => {
    const shapes: Record<string, unknown> = {
      "session.start": { SessionStart: [{ type: "command", command: "cd .. || exit 1\nx" }] },
      "tool.before": {
        PreToolUse: [{ hooks: [{ type: "command", command: "cd .. || exit 1\nx" }] }],
      },
      "tool.after": {
        PostToolUse: [{ hooks: [{ type: "command", command: "cd .. || exit 1\nx" }] }],
      },
      "agent.stop": { Stop: [{ type: "command", command: "cd .. || exit 1\nx" }] },
    };
    for (const [event, value] of Object.entries(shapes)) {
      const { changes, warnings } = hook({ event, run: { command: "x" } });
      expect(warnings).toEqual([]);
      expect(changes).toEqual([
        { kind: "json-key", path: ".agents/hooks.json", key: ["format-on-edit"], value },
      ]);
    }
    for (const event of [
      "session.end",
      "prompt.submit",
      "permission.request",
      "subagent.start",
      "subagent.stop",
      "compact.before",
    ]) {
      const { changes, warnings } = hook({ event, run: { command: "x" } });
      expect(changes).toEqual([]);
      expect(warnings[0]?.message).toContain(`no event for \`${event}\``);
    }
  });

  it("matches the CLI's and the app's names for every canonical tool, and warns about MCP tools", () => {
    const matchers: Record<string, string> = {
      read: "^(?:read_file|view_file)$",
      edit: "^(?:edit_file|replace_file_content|multi_replace_file_content)$",
      write: "^(?:write_file|write_to_file)$",
      grep: "^(?:grep_search)$",
      glob: "^(?:find_by_name)$",
      shell: "^(?:run_command)$",
      "web-fetch": "^(?:read_url_content)$",
      "web-search": "^(?:search_web)$",
    };
    for (const [tool, matcher] of Object.entries(matchers)) {
      const { changes } = hook({ event: "tool.before", matcher: { tool }, run: { command: "x" } });
      expect(keyValue(changes[0]).PreToolUse?.[0]).toMatchObject({ matcher });
    }
    for (const tool of ["mcp:github-mcp", "mcp:github-mcp/search", "constructor"]) {
      const { changes, warnings } = hook({
        event: "tool.before",
        matcher: { tool },
        run: { command: "x" },
      });
      expect(keyValue(changes[0]).PreToolUse?.[0]).not.toHaveProperty("matcher");
      expect(warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
    }
    const stop = hook({ event: "agent.stop", matcher: { tool: "shell" }, run: { command: "x" } });
    expect(keyValue(stop.changes[0]).Stop?.[0]).toEqual({
      type: "command",
      command: "cd .. || exit 1\nx",
    });
    expect(stop.warnings[0]?.message).toContain("doesn't filter `Stop` by tool");
  });

  it("runs a hook script from the folder hooks.json is in, in both scopes", () => {
    const item = withBlock("format-on-edit", "hook", {
      event: "tool.after",
      run: { script: "fmt.sh" },
      timeout: 5,
    });
    const withScript = {
      ...item,
      files: [...item.files, { path: "fmt.sh", bytes: new TextEncoder().encode("#!/bin/sh\n") }],
    };
    for (const [scope, root, command] of [
      ["project", ".agents", "cd .. || exit 1\n./.agents/hooks/format-on-edit/fmt.sh"],
      ["user", ".gemini/config", "./hooks/format-on-edit/fmt.sh"],
    ] as const) {
      const { changes } = antigravityRenderer.render(withScript, { scope });
      expect(changes[0]).toMatchObject({
        kind: "file",
        path: `${root}/hooks/format-on-edit/fmt.sh`,
        executable: true,
      });
      expect(changes[1]).toEqual({
        kind: "json-key",
        path: `${root}/hooks.json`,
        key: ["format-on-edit"],
        value: {
          PostToolUse: [{ hooks: [{ type: "command", command, timeout: 5 }] }],
        },
      });
    }
  });

  it("writes no secret: MCP env and headers that name a variable are left out with a warning", () => {
    const http = render("github-mcp");
    expect(http.changes).toEqual([
      {
        kind: "json-key",
        path: ".agents/mcp_config.json",
        key: ["mcpServers", "github-mcp"],
        value: { serverUrl: "https://api.githubcopilot.com/mcp/" },
      },
    ]);
    expect(http.warnings.map((w) => w.message).join("\n")).toMatch(
      /`Authorization`[\s\S]*`GITHUB_TOKEN`/,
    );
    const stdio = antigravityRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        env: [{ name: "API_TOKEN", secret: true }, { name: "REGION" }],
      }),
      { scope: "user" },
    );
    expect(stdio.changes).toEqual([
      {
        kind: "json-key",
        path: ".gemini/config/mcp_config.json",
        key: ["mcpServers", "github-mcp"],
        value: { command: "npx", args: ["-y", "server"] },
      },
    ]);
    expect(JSON.stringify(stdio.changes)).not.toContain("API_TOKEN");
    expect(stdio.warnings[0]?.message).toContain("`API_TOKEN`, `REGION` weren't written");
    const plain = antigravityRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "http",
        url: "https://example.com/mcp",
        headers: { "X-Team": "core", Authorization: "Bearer $TOKEN" },
      }),
      { scope: "project" },
    );
    expect(plain.changes[0]).toMatchObject({
      value: { serverUrl: "https://example.com/mcp", headers: { "X-Team": "core" } },
    });
  });

  it("writes permission rules in the home folder only, as action(target)", () => {
    expect(render("safe-git").changes).toEqual([]);
    expect(render("safe-git").warnings[0]?.message).toContain("--scope user");
    const policy = (rules: Record<string, unknown>[]) =>
      antigravityRenderer.render(withBlock("safe-git", "permission-policy", { rules }), {
        scope: "user",
      });
    const { changes, warnings } = policy([
      { tool: "shell", pattern: "git push*", decision: "ask" },
      { tool: "shell", decision: "deny" },
      { tool: "read", pattern: ".env", decision: "deny" },
      { tool: "edit", decision: "allow" },
      { tool: "write", pattern: "src/", decision: "allow" },
      { tool: "web-fetch", pattern: "github.com", decision: "allow" },
      { tool: "mcp:github-mcp/search", decision: "allow" },
      { tool: "mcp:github-mcp", decision: "ask" },
      { tool: "shell", pattern: "git * --force", decision: "deny" },
      { tool: "web-search", decision: "deny" },
      { tool: "grep", decision: "deny" },
    ]);
    expect(
      changes.map((c) => (c.kind === "json-array-item" ? [c.path, c.key, c.item] : [])),
    ).toEqual(
      [
        ["permissions", "ask", "command(git push)"],
        ["permissions", "deny", "command(*)"],
        ["permissions", "deny", "read_file(.env)"],
        ["permissions", "allow", "write_file(*)"],
        ["permissions", "allow", "write_file(src/)"],
        ["permissions", "allow", "read_url(github.com)"],
        ["permissions", "allow", "mcp(github-mcp/search)"],
        ["permissions", "ask", "mcp(github-mcp/*)"],
      ].map(([a, b, c]) => [".gemini/antigravity-cli/settings.json", [a, b], c]),
    );
    expect(warnings).toHaveLength(3);
  });

  it("writes the status line in the home folder only, run through the shell from $HOME", () => {
    expect(render("git-branch").changes).toEqual([]);
    const { changes } = render("git-branch", { scope: "user" });
    expect(changes[1]).toEqual({
      kind: "json-key",
      path: ".gemini/antigravity-cli/settings.json",
      key: ["statusLine"],
      value: {
        type: "command",
        command: '"$HOME"/.gemini/antigravity-cli/statusline/git-branch/statusline.sh',
      },
    });
  });

  it("runs a project hook's command from the project root, and a home-folder one as written", () => {
    const command = (scope: "project" | "user") =>
      keyValue(hook({ event: "agent.stop", run: { command: "make lint" } }, scope).changes[0])
        .Stop?.[0];
    expect(command("project")).toEqual({ type: "command", command: "cd .. || exit 1\nmake lint" });
    expect(command("user")).toEqual({ type: "command", command: "make lint" });
  });

  it("says which types it can't take, and which only in part", () => {
    const levels = Object.fromEntries(
      (
        [
          "skill",
          "agent",
          "rule",
          "command",
          "hook",
          "mcp-server",
          "permission-policy",
          "statusline",
          "output-style",
          "lsp-server",
          "bundle",
        ] as const
      ).map((type) => [type, antigravityRenderer.supports(type)]),
    );
    expect(levels).toEqual({
      skill: "native",
      agent: "native",
      rule: "native",
      command: "native",
      hook: "native",
      "mcp-server": "degraded",
      "permission-policy": "degraded",
      statusline: "degraded",
      "output-style": "none",
      "lsp-server": "none",
      bundle: "native",
    });
  });

  it("warns about a variable in an MCP server's URL or arguments, and keeps a header with a plain $", () => {
    const server = (block: Record<string, unknown>) =>
      antigravityRenderer.render(withBlock("github-mcp", "mcp-server", block), {
        scope: "project",
      });
    const url = server({ transport: "http", url: "https://x.example/mcp?key=${API_KEY}" });
    expect(url.warnings.map((w) => w.message)).toEqual([
      "Antigravity doesn't expand `${API_KEY}` in @examples/github-mcp's URL, so the server gets it as written.",
    ]);
    const args = server({ transport: "stdio", command: "srv", args: ["--token", "${GH_TOKEN}"] });
    expect(args.warnings[0]?.message).toContain(
      "`${GH_TOKEN}` in @examples/github-mcp's arguments",
    );
    const plain = server({
      transport: "http",
      url: "https://x.example",
      headers: { "X-Lit": "a$b" },
    });
    expect(plain.changes[0]).toMatchObject({ value: { headers: { "X-Lit": "a$b" } } });
    expect(plain.warnings).toEqual([]);
  });

  it("writes a shell rule of `*` as every command", () => {
    const { changes } = antigravityRenderer.render(
      withBlock("safe-git", "permission-policy", {
        rules: [{ tool: "shell", pattern: "*", decision: "ask" }],
      }),
      { scope: "user" },
    );
    expect(changes[0]).toMatchObject({ key: ["permissions", "ask"], item: "command(*)" });
  });

  it("keeps a project hook at the root whatever its command holds, and ignores inherited event names", () => {
    const stop = (command: string) =>
      keyValue(hook({ event: "agent.stop", run: { command } }).changes[0]).Stop?.[0];
    expect(stop("true & pwd")).toEqual({ type: "command", command: "cd .. || exit 1\ntrue & pwd" });
    expect(stop("# note\npwd")).toEqual({
      type: "command",
      command: "cd .. || exit 1\n# note\npwd",
    });
    for (const event of ["constructor", "__proto__", "toString"]) {
      const { changes, warnings } = hook({ event, run: { command: "x" } });
      expect(changes).toEqual([]);
      expect(warnings[0]?.message).toContain("no event for");
    }
  });

  it("never widens an allow: a shell pattern without * is left out of allow, kept as a prefix otherwise", () => {
    const { changes, warnings } = antigravityRenderer.render(
      withBlock("safe-git", "permission-policy", {
        rules: [
          { tool: "shell", pattern: "git status", decision: "allow" },
          { tool: "shell", pattern: "git status*", decision: "allow" },
          { tool: "shell", pattern: "rm -rf /", decision: "deny" },
          { tool: "shell", pattern: "git push", decision: "ask" },
        ],
      }),
      { scope: "user" },
    );
    expect(changes.map((c) => (c.kind === "json-array-item" ? [c.key[1], c.item] : []))).toEqual([
      ["allow", "command(git status)"],
      ["deny", "command(rm -rf /)"],
      ["ask", "command(git push)"],
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("`git status`");
  });
});
