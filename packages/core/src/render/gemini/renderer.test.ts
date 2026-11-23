import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { tomlString } from "../codex/toml.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { hookMatcher, TOOLS, toolOf } from "./mappings.js";
import { geminiRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  geminiRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};
const withFile = (item: ReturnType<typeof example>, path: string, content: string) => ({
  ...item,
  files: [...item.files, { path, bytes: new TextEncoder().encode(content) }],
});

describe("the Gemini CLI renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(geminiRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by .gemini or GEMINI.md", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    expect(await geminiRenderer.detect(probe([".gemini"]))).toBe(true);
    expect(await geminiRenderer.detect(probe(["GEMINI.md"]))).toBe(true);
    expect(await geminiRenderer.detect(probe([".agents", ".agents/rules", "AGENTS.md"]))).toBe(
      false,
    );
  });

  it("writes skills byte for byte as the shared copy, in both scopes", () => {
    for (const scope of ["project", "user"] as const)
      expect(render("secure-coding", { scope }).changes).toEqual(
        codexRenderer.render(example("secure-coding"), { scope }).changes,
      );
  });

  it("writes a command as TOML, its one argument as {{args}}", () => {
    const { changes, warnings } = render("review-diff");
    expect(changes.map((c) => c.path)).toEqual([".gemini/commands/review-diff.toml"]);
    const toml = text(changes[0]);
    expect(toml).toMatch(/^# managed by rmk: @examples\/review-diff@1\.0\.0\ndescription = "/);
    expect(toml).toContain("prompt = '''\nReview the uncommitted changes in {{args}} ");
    expect(toml).not.toContain("{{target}}");
    expect(warnings).toEqual([]);
    expect(render("review-diff", { scope: "user" }).changes[0]?.path).toBe(
      ".gemini/commands/review-diff.toml",
    );
  });

  it("keeps several arguments' placeholders with a note and a warning", () => {
    const item = withFile(
      withBlock("review-diff", "command", {
        body: "two.md",
        args: [
          { name: "from", required: true, description: "Base ref." },
          { name: "to", description: "Head ref." },
        ],
      }),
      "two.md",
      "Compare {{from}} with {{to}}.",
    );
    const { changes, warnings } = geminiRenderer.render(item, { scope: "project" });
    const toml = text(changes[0]);
    expect(toml).toContain("Compare {{from}} with {{to}}.");
    expect(toml).toContain("What the person typed after the command is in {{args}}.");
    expect(toml).toContain("- `from`: Base ref.\n- `to` (optional): Head ref.");
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
  });

  it("warns about text Gemini CLI would run as a shell command or read as a file", () => {
    for (const body of ["Run !{git status} first.", "Read @{src/index.ts}."]) {
      const item = withFile(withBlock("review-diff", "command", { body: "x.md" }), "x.md", body);
      const { warnings } = geminiRenderer.render(item, { scope: "project" });
      expect(warnings[0]?.message).toContain("runs as a shell command or reads as a file");
    }
  });

  it("writes a prompt TOML can't hold as a literal block as a basic string", () => {
    const item = withFile(
      withBlock("review-diff", "command", { body: "q.md" }),
      "q.md",
      "Say '''hi''' then stop.",
    );
    const toml = text(geminiRenderer.render(item, { scope: "project" }).changes[0]);
    expect(toml).toContain(`prompt = "Say '''hi''' then stop.\\n"`);
  });

  it("maps an agent's tools, and takes a model only from the override", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes.map((c) => c.path)).toEqual([".gemini/agents/code-reviewer.md"]);
    expect(text(changes[0])).toContain(
      'tools:\n  - read_file\n  - read_many_files\n  - grep_search\n  - glob\n  - run_shell_command\n  - "mcp_github-mcp_*"\n---\n',
    );
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    expect(warnings[0]?.message).toContain("targets.gemini.overrides.model");
    const item = withBlock("code-reviewer", "agent", { prompt: "prompt.md", model: "fast" });
    const overridden = {
      ...item,
      manifest: {
        ...item.manifest,
        targets: { gemini: { overrides: { model: "gemini-3-pro", temperature: 0.2 } } },
      },
    };
    const result = geminiRenderer.render(overridden, { scope: "user" });
    expect(result.changes[0]?.path).toBe(".gemini/agents/code-reviewer.md");
    expect(text(result.changes[0])).not.toContain("tools:");
    expect(text(result.changes[0])).toContain("model: gemini-3-pro\n");
    expect(result.warnings.map((w) => w.code)).toEqual(["invalid_override"]);
  });

  it("maps every canonical tool, and only MCP names Gemini CLI can parse", () => {
    const expected = {
      read: "read_file",
      edit: "replace",
      write: "write_file",
      grep: "grep_search",
      glob: "glob",
      shell: "run_shell_command",
      "web-fetch": "web_fetch",
      "web-search": "google_web_search",
    };
    expect(TOOLS).toEqual(expected);
    for (const [canonical, name] of Object.entries(expected)) expect(toolOf(canonical)).toBe(name);
    expect(toolOf("mcp:github-mcp")).toBe("mcp_github-mcp_*");
    expect(toolOf("mcp:github-mcp/search_issues")).toBe("mcp_github-mcp_search_issues");
    for (const bad of ["mcp:git_hub", "mcp:github/___", "mcp:github/a b", "teleport", "__proto__"])
      expect(toolOf(bad)).toBeNull();
    const item = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: ["read", "mcp:git_hub", "read"],
    });
    const { changes, warnings } = geminiRenderer.render(item, { scope: "project" });
    expect(text(changes[0])).toContain("tools:\n  - read_file\n  - read_many_files\n---\n");
    expect(warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
  });

  it("writes always and glob rules as GEMINI.md sections, the rest as the shared skills", () => {
    const rule = (block: Record<string, unknown>, scope: "project" | "user" = "project") =>
      geminiRenderer.render(withBlock("house-style", "rule", block), { scope });
    expect(rule({ body: "rule.md", activation: "always" }).changes[0]).toMatchObject({
      kind: "section",
      path: "GEMINI.md",
      key: "@examples/house-style",
    });
    const glob = rule({ body: "rule.md", activation: "glob", globs: ["**/*.ts"] });
    expect(glob.changes[0]).toMatchObject({ kind: "section", path: "GEMINI.md" });
    expect(glob.changes[0]?.kind === "section" ? glob.changes[0].text : "").toMatch(
      /^These rules apply to files matching `\*\*\/\*\.ts`\.\n\n/,
    );
    expect(rule({ body: "rule.md" }, "user").changes[0]?.path).toBe(".gemini/GEMINI.md");
    for (const activation of ["model", "manual"]) {
      const block = { body: "rule.md", activation };
      expect(rule(block).changes).toEqual(
        codexRenderer.render(withBlock("house-style", "rule", block), { scope: "project" }).changes,
      );
    }
  });

  it("says which types it can't take, and which only in part", () => {
    expect(geminiRenderer.supports("statusline")).toBe("none");
    expect(geminiRenderer.supports("output-style")).toBe("none");
    expect(geminiRenderer.supports("lsp-server")).toBe("none");
    expect(geminiRenderer.supports("permission-policy")).toBe("degraded");
    for (const type of [
      "skill",
      "agent",
      "rule",
      "command",
      "hook",
      "mcp-server",
      "bundle",
    ] as const)
      expect(geminiRenderer.supports(type)).toBe("native");
  });

  const hook = (block: Record<string, unknown>, scope: "project" | "user" = "project") =>
    geminiRenderer.render(withBlock("format-on-edit", "hook", block), { scope });
  const arrayItem = (change: Change | undefined) =>
    change?.kind === "json-array-item" ? (change.item as Record<string, unknown>) : {};

  it("maps the seven events Gemini CLI has, and warns about the rest", () => {
    const events: Record<string, string> = {
      "session.start": "SessionStart",
      "session.end": "SessionEnd",
      "prompt.submit": "BeforeAgent",
      "tool.before": "BeforeTool",
      "tool.after": "AfterTool",
      "agent.stop": "AfterAgent",
      "compact.before": "PreCompress",
    };
    for (const [event, name] of Object.entries(events)) {
      const { changes, warnings } = hook({ event, run: { command: "x" }, timeout: 5 });
      expect(warnings).toEqual([]);
      expect(changes).toEqual([
        {
          kind: "json-array-item",
          path: ".gemini/settings.json",
          key: ["hooks", name],
          item: {
            hooks: [{ type: "command", command: "x", name: "format-on-edit", timeout: 5000 }],
          },
        },
      ]);
    }
    for (const event of ["permission.request", "subagent.start", "subagent.stop", "constructor"]) {
      const { changes, warnings } = hook({ event, run: { command: "x" } });
      expect(changes).toEqual([]);
      expect(warnings[0]?.message).toContain("no event for");
    }
  });

  it("anchors a matcher on Gemini CLI's tool names, MCP tools included", () => {
    const matchers: Record<string, string> = {
      read: "^(?:read_file|read_many_files)$",
      edit: "^(?:replace)$",
      write: "^(?:write_file)$",
      grep: "^(?:grep_search)$",
      glob: "^(?:glob)$",
      shell: "^(?:run_shell_command)$",
      "web-fetch": "^(?:web_fetch)$",
      "web-search": "^(?:google_web_search)$",
      "mcp:github-mcp": "^(?:mcp_github-mcp_.*)$",
      "mcp:github-mcp/search_issues": "^(?:mcp_github-mcp_search_issues)$",
      "mcp:a.b/x.y": "^(?:mcp_a\\.b_x\\.y)$",
    };
    for (const [tool, matcher] of Object.entries(matchers)) {
      expect(hookMatcher(tool)).toBe(matcher);
      const { changes } = hook({ event: "tool.before", matcher: { tool }, run: { command: "x" } });
      expect(arrayItem(changes[0]).matcher).toBe(matcher);
    }
    expect(new RegExp(hookMatcher("glob") ?? "").test("glob_extra")).toBe(false);
    const unknown = hook({
      event: "tool.after",
      matcher: { tool: "mcp:git_hub" },
      run: { command: "x" },
    });
    expect(arrayItem(unknown.changes[0])).not.toHaveProperty("matcher");
    expect(unknown.warnings[0]?.message).toContain("runs for every tool");
    const other = hook({
      event: "session.start",
      matcher: { tool: "shell" },
      run: { command: "x" },
    });
    expect(arrayItem(other.changes[0])).not.toHaveProperty("matcher");
    expect(other.warnings[0]?.message).toContain("doesn't filter `SessionStart` by tool");
  });

  it("runs a hook script from the project folder, unquoted where Gemini CLI quotes it", () => {
    const item = withFile(
      withBlock("format-on-edit", "hook", { event: "tool.after", run: { script: "fmt.sh" } }),
      "fmt.sh",
      "#!/bin/sh\n",
    );
    for (const [scope, command] of [
      ["project", "$GEMINI_PROJECT_DIR/.gemini/hooks/format-on-edit/fmt.sh"],
      ["user", '"$HOME"/.gemini/hooks/format-on-edit/fmt.sh'],
    ] as const) {
      const { changes } = geminiRenderer.render(item, { scope });
      expect(changes[0]).toMatchObject({
        kind: "file",
        path: ".gemini/hooks/format-on-edit/fmt.sh",
        executable: true,
      });
      expect(arrayItem(changes[1])).toEqual({
        hooks: [{ type: "command", command, name: "format-on-edit" }],
      });
    }
  });

  it("writes MCP servers with ${NAME} references, never a value", () => {
    expect(render("github-mcp", { scope: "user" }).changes).toEqual([
      {
        kind: "json-key",
        path: ".gemini/settings.json",
        key: ["mcpServers", "github-mcp"],
        value: {
          httpUrl: "https://api.githubcopilot.com/mcp/",
          headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
        },
      },
    ]);
    const stdio = geminiRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        env: [{ name: "API_TOKEN", secret: true }, { name: "REGION" }],
      }),
      { scope: "project" },
    );
    expect(stdio.changes).toEqual([
      {
        kind: "json-key",
        path: ".gemini/settings.json",
        key: ["mcpServers", "github-mcp"],
        value: {
          command: "npx",
          args: ["-y", "server"],
          env: { API_TOKEN: "${API_TOKEN}", REGION: "${REGION}" },
        },
      },
    ]);
    expect(stdio.warnings).toEqual([]);
  });

  it("writes a policy file in the home folder only, one [[rule]] each, deny over ask over allow", () => {
    expect(render("safe-git").changes).toEqual([]);
    expect(render("safe-git").warnings[0]?.message).toContain("--scope user");
    const { changes, warnings } = geminiRenderer.render(
      withBlock("safe-git", "permission-policy", {
        rules: [
          { tool: "shell", pattern: "git push*", decision: "ask" },
          { tool: "shell", pattern: "*", decision: "deny" },
          { tool: "read", decision: "allow" },
          { tool: "mcp:github-mcp/search", decision: "allow" },
          { tool: "mcp:github-mcp", decision: "deny" },
          { tool: "read", pattern: ".env", decision: "deny" },
          { tool: "shell", pattern: "git * --force", decision: "deny" },
          { tool: "mcp:git_hub", decision: "deny" },
          { tool: "shell", decision: "__proto__" },
        ],
      }),
      { scope: "user" },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe(".gemini/policies/safe-git.toml");
    expect(text(changes[0])).toBe(
      [
        "# managed by rmk: @examples/safe-git@1.0.0",
        "",
        "[[rule]]",
        'toolName = "run_shell_command"',
        'commandPrefix = "git push"',
        'decision = "ask_user"',
        "priority = 2",
        'modes = ["default","autoEdit","yolo"]',
        "",
        "[[rule]]",
        'toolName = "run_shell_command"',
        'decision = "deny"',
        "priority = 3",
        "",
        "[[rule]]",
        'toolName = ["read_file", "read_many_files"]',
        'decision = "allow"',
        "priority = 1",
        'modes = ["default","autoEdit","yolo"]',
        "",
        "[[rule]]",
        'mcpName = "github-mcp"',
        'toolName = "search"',
        'decision = "allow"',
        "priority = 1",
        'modes = ["default","autoEdit","yolo"]',
        "",
        "[[rule]]",
        'mcpName = "github-mcp"',
        'toolName = "*"',
        'decision = "deny"',
        "priority = 3",
        "",
      ].join("\n"),
    );
    expect(warnings).toHaveLength(4);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("writes no value from the environment, even when the variables are set", () => {
    vi.stubEnv("GITHUB_TOKEN", "leak-github");
    vi.stubEnv("API_TOKEN", "leak-api");
    const outputs = [
      render("github-mcp"),
      render("github-mcp", { scope: "user" }),
      geminiRenderer.render(
        withBlock("github-mcp", "mcp-server", {
          transport: "stdio",
          command: "npx",
          env: [{ name: "API_TOKEN", secret: true }],
        }),
        { scope: "project" },
      ),
    ];
    expect(JSON.stringify(outputs)).not.toContain("leak-");
  });

  it("writes a shell pattern without * as that command exactly", () => {
    const policy = (pattern: string) =>
      text(
        geminiRenderer.render(
          withBlock("safe-git", "permission-policy", {
            rules: [{ tool: "shell", pattern, decision: "allow" }],
          }),
          { scope: "user" },
        ).changes[0],
      );
    expect(policy("git status")).toContain('commandRegex = "git status\\""\n');
    expect(policy('echo "a.b"')).toContain(
      'commandRegex = "echo \\\\\\\\\\"a\\\\.b\\\\\\\\\\"\\""\n',
    );
    expect(policy("git status*")).toContain('commandPrefix = "git status"\n');
  });

  it("leaves out MCP names Gemini CLI would cut to 63 characters", () => {
    const longTool = `mcp:srv/${"t".repeat(60)}`;
    expect(toolOf(longTool)).toBeNull();
    expect(toolOf(`mcp:srv/${"t".repeat(55)}`)).toBe(`mcp_srv_${"t".repeat(55)}`);
    expect(toolOf(`mcp:${"s".repeat(26)}`)).toBeNull();
    expect(toolOf(`mcp:${"s".repeat(25)}`)).toBe(`mcp_${"s".repeat(25)}_*`);
    const { changes, warnings } = geminiRenderer.render(
      withBlock("safe-git", "permission-policy", { rules: [{ tool: longTool, decision: "deny" }] }),
      { scope: "user" },
    );
    expect(changes).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("refuses a policy pattern TOML can't hold, and writes TOML that stays valid", () => {
    const { changes, warnings } = geminiRenderer.render(
      withBlock("safe-git", "permission-policy", {
        rules: [
          { tool: "shell", pattern: "git\u007f push*", decision: "deny" },
          { tool: "shell", pattern: "git \ud800push*", decision: "deny" },
          { tool: "shell", pattern: "echo ok", decision: "deny" },
        ],
      }),
      { scope: "user" },
    );
    expect(warnings).toHaveLength(2);
    expect(text(changes[0])).toContain('commandRegex = "echo ok\\""');
  });

  it("warns about variables in a hook command, and leaves out a script whose name has $", () => {
    const named = hook({ event: "tool.after", run: { command: "notify $SLACK_TOKEN" } });
    expect(named.changes).toHaveLength(1);
    expect(named.warnings[0]?.message).toContain("trusted_hooks.json");
    expect(hook({ event: "tool.after", run: { command: "notify ok" } }).warnings).toEqual([]);
    const dollar = hook({ event: "tool.after", run: { script: "run$HOME.sh" } });
    expect(dollar.changes).toEqual([]);
    expect(dollar.warnings[0]?.message).toContain("`run$HOME.sh`");
  });

  it("warns about a variable in a hook command even beside an $RMK_ one", () => {
    const { warnings } = hook({
      event: "tool.after",
      run: { command: 'fmt $RMK_FILE_PATHS; curl -H "$SLACK_TOKEN"' },
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.message).join("\n")).toMatch(/\$RMK_[\s\S]*trusted_hooks\.json/);
    expect(
      hook({ event: "tool.after", run: { command: "fmt $RMK_FILE_PATHS" } }).warnings,
    ).toHaveLength(1);
  });

  it("writes TOML strings any TOML reader takes, whatever characters they hold", () => {
    const controls = Array.from({ length: 0x20 }, (_, code) => String.fromCharCode(code)).join("");
    const values: [string, string][] = [
      [`a${controls}\u007fz`, `a${controls}\u007fz`],
      ["pair \ud83d\ude00", "pair \ud83d\ude00"],
      ["lone \ud800 and \udc00", "lone \ufffd and \ufffd"],
      ['"quoted" \\', '"quoted" \\'],
    ];
    for (const [value, expected] of values)
      expect((parse(`key = ${tomlString(value)}\n`) as { key: string }).key).toBe(expected);
    const description = withFile(
      {
        ...withBlock("review-diff", "command", { body: "b.md" }),
        manifest: {
          ...example("review-diff").manifest,
          command: { body: "b.md" },
          description: "del\u007f lone\ud800",
        },
      },
      "b.md",
      "Body.",
    );
    const toml = text(geminiRenderer.render(description, { scope: "project" }).changes[0]);
    expect((parse(toml) as { description: string }).description).toBe("del\u007f lone�");
  });
});
