import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexRenderer } from "../codex/renderer.js";
import { checkGolden, describeDifferences, loadItemDir } from "../harness.js";
import type { Change, RenderContext } from "../types.js";
import { copilotRenderer } from "./renderer.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const render = (name: string, context: RenderContext = { scope: "project" }) =>
  copilotRenderer.render(example(name), context);
const text = (change: Change | undefined) =>
  change?.kind === "file" ? String(change.content) : "";
const withBlock = (name: string, type: string, block: Record<string, unknown>) => {
  const item = example(name);
  return { ...item, manifest: { ...item.manifest, [type]: block } };
};

describe("the GitHub Copilot renderer", () => {
  it("writes every example item as the golden files say, in both scopes", () => {
    const differences = checkGolden(copilotRenderer, examplesDir, goldenDir);
    expect(differences, describeDifferences(differences)).toEqual([]);
  });

  it("detects a project by Copilot's own files, not by .github alone", async () => {
    const probe = (paths: string[]) => ({ exists: async (path: string) => paths.includes(path) });
    for (const path of [
      ".github/copilot-instructions.md",
      ".github/copilot",
      ".github/agents",
      ".github/instructions",
      ".github/prompts",
      ".github/hooks",
      ".github/skills",
      ".github/lsp.json",
    ])
      expect(await copilotRenderer.detect(probe([".github", path]))).toBe(true);
    expect(await copilotRenderer.detect(probe([".github", ".github/workflows"]))).toBe(false);
    expect(await copilotRenderer.detect(probe([".vscode", ".mcp.json", ".agents"]))).toBe(false);
  });

  it("writes skills and commands with the same bytes as the shared copy, under .github/skills", () => {
    for (const name of ["secure-coding", "review-diff"])
      for (const scope of ["project", "user"] as const) {
        const root = scope === "project" ? ".github/skills/" : ".copilot/skills/";
        const shared = codexRenderer.render(example(name), { scope }).changes;
        expect(render(name, { scope }).changes).toEqual(
          shared.map((change) => ({
            ...change,
            path: change.path.replace(".agents/skills/", root),
          })),
        );
      }
  });

  it("writes a command as a skill the model doesn't start on its own", () => {
    const [change] = render("review-diff").changes;
    expect(change?.kind).toBe("dir");
    const skill = change?.kind === "dir" ? String(change.files[0]?.content) : "";
    expect(skill).toContain("disable-model-invocation: true");
    expect(skill).toMatch(/^---\nname: review-diff\n/);
  });

  it("maps an agent's tools to Copilot's aliases, once each", () => {
    const { changes, warnings } = render("code-reviewer");
    expect(changes.map((c) => c.path)).toEqual([".github/agents/code-reviewer.agent.md"]);
    expect(text(changes[0])).toContain(
      'tools:\n  - read\n  - search\n  - execute\n  - "github-mcp/*"\n',
    );
    expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    expect(warnings[0]?.message).toContain("targets.copilot.overrides.model");
    const user = copilotRenderer.render(example("code-reviewer"), { scope: "user" });
    expect(user.changes.map((c) => c.path)).toEqual([".copilot/agents/code-reviewer.agent.md"]);
  });

  it("maps every canonical tool", () => {
    const item = withBlock("code-reviewer", "agent", {
      prompt: "prompt.md",
      tools: [
        "read",
        "edit",
        "write",
        "grep",
        "glob",
        "shell",
        "web-fetch",
        "web-search",
        "mcp:github",
        "mcp:github/create_issue",
      ],
    });
    const { changes, warnings } = copilotRenderer.render(item, { scope: "project" });
    expect(text(changes[0])).toContain(
      'tools:\n  - read\n  - edit\n  - search\n  - execute\n  - web\n  - "github/*"\n  - "github/create_issue"\n',
    );
    expect(warnings).toEqual([]);
  });

  it("writes the model only from targets.copilot.overrides, and refuses other overrides", () => {
    const item = example("code-reviewer");
    const manifest = {
      ...item.manifest,
      targets: { copilot: { overrides: { model: "claude-sonnet-4.6", tools: ["read"] } } },
    };
    const { changes, warnings } = copilotRenderer.render(
      { ...item, manifest },
      { scope: "project" },
    );
    expect(text(changes[0])).toContain("model: claude-sonnet-4.6\n");
    expect(warnings).toEqual([
      {
        code: "invalid_override",
        message: "Copilot takes no override `tools` for an agent; only `model`.",
      },
    ]);
  });

  it("says an agent's skills aren't preloaded", () => {
    const item = {
      ...example("code-reviewer"),
      dependencies: [
        { name: "@examples/secure-coding", type: "skill" as const, preload: true },
        { name: "@examples/review-diff", type: "skill" as const, preload: false },
      ],
    };
    const { warnings } = copilotRenderer.render(item, { scope: "project" });
    expect(warnings.map((w) => w.message).join("\n")).toContain("not preloaded");
  });

  it("writes always rules as sections of copilot-instructions.md, glob rules as instructions, and model and manual rules as skills", () => {
    const rule = (activation: string, scope: RenderContext["scope"] = "project") =>
      copilotRenderer.render(
        withBlock("house-style", "rule", {
          body: "rule.md",
          activation,
          globs: ["**/*.ts", "**/*.tsx"],
        }),
        { scope },
      ).changes;
    const [glob] = rule("glob");
    expect(glob?.path).toBe(".github/instructions/house-style.instructions.md");
    expect(text(glob)).toMatch(/^---\napplyTo: "\*\*\/\*\.ts,\*\*\/\*\.tsx"\n---\n/);
    const [always] = rule("always", "user");
    expect(always).toMatchObject({
      kind: "section",
      path: ".copilot/copilot-instructions.md",
      key: "@examples/house-style",
    });
    expect(rule("always")[0]?.path).toBe(".github/copilot-instructions.md");
    const [model] = rule("model");
    expect(model).toMatchObject({ kind: "dir", path: ".github/skills/house-style" });
    const [manual] = rule("manual", "user");
    expect(manual).toMatchObject({ kind: "dir", path: ".copilot/skills/house-style" });
    expect(manual?.kind === "dir" ? String(manual.files[0]?.content) : "").toContain(
      "disable-model-invocation: true",
    );
  });

  const hookFile = (changes: Change[]) => {
    const file = changes.find((c) => c.kind === "file" && c.path.endsWith(".json"));
    return JSON.parse(text(file)) as { version: number; hooks: Record<string, unknown[]> };
  };
  const hook = (block: Record<string, unknown>, scope: RenderContext["scope"] = "project") =>
    copilotRenderer.render(withBlock("format-on-edit", "hook", block), { scope });

  it("maps every canonical event to Copilot's, in a hooks file of the item's own", () => {
    const events: [string, string][] = [
      ["session.start", "sessionStart"],
      ["session.end", "sessionEnd"],
      ["prompt.submit", "userPromptSubmitted"],
      ["tool.before", "preToolUse"],
      ["tool.after", "postToolUse"],
      ["permission.request", "permissionRequest"],
      ["subagent.start", "subagentStart"],
      ["subagent.stop", "subagentStop"],
      ["compact.before", "preCompact"],
      ["agent.stop", "agentStop"],
    ];
    for (const [canonical, copilot] of events) {
      const { changes, warnings } = hook({ event: canonical, run: { command: "true" } });
      expect(changes.map((c) => c.path)).toEqual([".github/hooks/format-on-edit.json"]);
      expect(hookFile(changes)).toEqual({
        version: 1,
        hooks: { [copilot]: [{ type: "command", bash: "true", cwd: "." }] },
      });
      expect(warnings).toEqual([]);
    }
    expect(hook({ event: "no.such", run: { command: "true" } }).changes).toEqual([]);
  });

  it("writes a tool filter as the CLI's tool name, and warns where Copilot has none", () => {
    const matcher = (tool: string, event = "tool.before") => {
      const { changes, warnings } = hook({ event, matcher: { tool }, run: { command: "true" } });
      const entry = hookFile(changes).hooks[Object.keys(hookFile(changes).hooks)[0] ?? ""]?.[0];
      return { matcher: (entry as Record<string, unknown>).matcher, warnings };
    };
    const names: [string, string][] = [
      ["read", "view"],
      ["edit", "edit"],
      ["write", "create"],
      ["grep", "grep"],
      ["glob", "glob"],
      ["shell", "bash"],
      ["web-fetch", "web_fetch"],
    ];
    for (const [canonical, copilot] of names) {
      expect(matcher(canonical)).toEqual({ matcher: copilot, warnings: [] });
      expect(matcher(canonical, "tool.after").matcher).toBe(copilot);
      expect(matcher(canonical, "permission.request").matcher).toBe(copilot);
    }
    expect(matcher("mcp:github")).toEqual({ matcher: "github-.*", warnings: [] });
    expect(matcher("mcp:github/create_issue")).toEqual({
      matcher: "github-create_issue",
      warnings: [],
    });
    expect(matcher("mcp:github/create_issue", "permission.request").matcher).toBe(
      "github-create_issue",
    );
    for (const tool of ["web-search"]) {
      const { matcher: written, warnings } = matcher(tool);
      expect(written).toBeUndefined();
      expect(warnings.map((w) => w.code)).toEqual(["unmapped_tool"]);
      expect(warnings[0]?.message).toContain("runs for every tool");
    }
    const other = matcher("shell", "session.start");
    expect(other.matcher).toBeUndefined();
    expect(other.warnings[0]?.message).toContain(
      "doesn't filter `sessionStart` by tool, so @examples/format-on-edit's tool filter was left out and it runs on every `sessionStart`.",
    );
    // Only the tables' own entries: an inherited name is no event and no tool.
    expect(hook({ event: "constructor", run: { command: "true" } }).changes).toEqual([]);
    expect(matcher("__proto__").matcher).toBeUndefined();
  });

  it("writes a hook's script next to it, run from the repository root or by its full path", () => {
    const item = withBlock("format-on-edit", "hook", {
      event: "tool.after",
      run: { script: "format.sh" },
      timeout: 10,
    });
    const files = [
      ...item.files,
      {
        path: "format.sh",
        bytes: new TextEncoder().encode("#!/bin/sh\necho hi\n"),
        executable: true,
      },
    ];
    for (const scope of ["project", "user"] as const) {
      const { changes } = copilotRenderer.render({ ...item, files }, { scope });
      const root = scope === "project" ? ".github" : ".copilot";
      expect(changes[0]).toMatchObject({
        kind: "file",
        path: `${root}/hooks/format-on-edit/format.sh`,
        executable: true,
      });
      expect(text(changes[0])).toMatch(/^#!\/bin\/sh\n# managed by rmk/);
      expect(hookFile(changes).hooks.postToolUse).toEqual([
        scope === "project"
          ? {
              type: "command",
              bash: ".github/hooks/format-on-edit/format.sh",
              cwd: ".",
              timeoutSec: 10,
            }
          : {
              type: "command",
              bash: '"$HOME"/.copilot/hooks/format-on-edit/format.sh',
              timeoutSec: 10,
            },
      ]);
    }
  });

  it("quotes a script's path when it holds more than letters, digits and ._/-", () => {
    const bashFor = (script: string, scope: RenderContext["scope"]) => {
      const item = withBlock("format-on-edit", "hook", { event: "tool.after", run: { script } });
      const files = [
        ...item.files,
        { path: script, bytes: new TextEncoder().encode("echo hi\n"), executable: true },
      ];
      const entry = hookFile(copilotRenderer.render({ ...item, files }, { scope }).changes).hooks
        .postToolUse?.[0] as Record<string, unknown> | undefined;
      return entry?.bash;
    };
    expect(bashFor("my script.sh", "project")).toBe("'.github/hooks/format-on-edit/my script.sh'");
    // Every printable ASCII character, a tab and a newline: only letters, digits and `._/-` stay
    // unquoted, so no widening or narrowing of that set goes unnoticed.
    const plain = /^[A-Za-z0-9._/-]$/;
    const characters = [
      ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
      "\t",
      "\n",
    ];
    for (const character of characters) {
      const script = `run${character}x.sh`;
      const path = `.github/hooks/format-on-edit/${script}`;
      expect(bashFor(script, "project"), JSON.stringify(character)).toBe(
        plain.test(character) ? path : `'${path.replaceAll("'", "'\\''")}'`,
      );
    }
    expect(bashFor("run'x.sh", "project")).toBe("'.github/hooks/format-on-edit/run'\\''x.sh'");
    expect(bashFor("a'b'c.sh", "project")).toBe("'.github/hooks/format-on-edit/a'\\''b'\\''c.sh'");
    expect(bashFor("run-1.2_x.sh", "user")).toBe(
      '"$HOME"/.copilot/hooks/format-on-edit/run-1.2_x.sh',
    );
    const item = withBlock("format-on-edit", "hook", {
      event: "tool.after",
      run: { script: "my script's.sh" },
    });
    const files = [
      ...item.files,
      { path: "my script's.sh", bytes: new TextEncoder().encode("echo hi\n"), executable: true },
    ];
    const bash = (scope: RenderContext["scope"]) =>
      (
        hookFile(copilotRenderer.render({ ...item, files }, { scope }).changes).hooks
          .postToolUse?.[0] as Record<string, unknown> | undefined
      )?.bash;
    expect(bash("project")).toBe("'.github/hooks/format-on-edit/my script'\\''s.sh'");
    expect(bash("user")).toBe(`"$HOME"/'.copilot/hooks/format-on-edit/my script'\\''s.sh'`);
  });

  it("writes MCP header values as the manifest has them, as the other tools do", () => {
    const { changes } = copilotRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "http",
        url: "https://x.example/mcp",
        headers: { "X-Team": "platform" },
      }),
      { scope: "project" },
    );
    expect(changes[0]).toMatchObject({ value: { headers: { "X-Team": "platform" } } });
  });

  it("writes args for a local server even when the manifest has none", () => {
    const { changes } = copilotRenderer.render(
      withBlock("github-mcp", "mcp-server", { transport: "stdio", command: "npx" }),
      { scope: "project" },
    );
    expect(changes[0]).toMatchObject({
      value: { type: "stdio", command: "npx", args: [], tools: ["*"] },
    });
  });

  it("doesn't warn when one language lists an extension twice", () => {
    const { warnings } = copilotRenderer.render(
      withBlock("typescript-lsp", "lsp-server", {
        command: "ls",
        languages: [{ id: "c", extensions: [".h", ".h"] }],
      }),
      { scope: "project" },
    );
    expect(warnings).toEqual([]);
  });

  it("warns when two languages claim the same extension", () => {
    const { changes, warnings } = copilotRenderer.render(
      withBlock("typescript-lsp", "lsp-server", {
        command: "ls",
        languages: [
          { id: "c", extensions: [".h"] },
          { id: "cpp", extensions: [".h", ".cpp"] },
        ],
      }),
      { scope: "project" },
    );
    expect(changes[0]).toMatchObject({ value: { fileExtensions: { ".h": "cpp", ".cpp": "cpp" } } });
    expect(warnings.map((w) => w.message)).toEqual([
      "@examples/typescript-lsp gives `.h` to both `c` and `cpp`; Copilot takes one language per extension, so it's `cpp`.",
    ]);
  });

  it("writes MCP servers to .mcp.json or ~/.copilot/mcp-config.json, by variable and never by value", () => {
    const http = render("github-mcp");
    expect(http.changes).toEqual([
      {
        kind: "json-key",
        path: ".mcp.json",
        key: ["mcpServers", "github-mcp"],
        value: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: an environment variable reference, on purpose.
          headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
          tools: ["*"],
        },
      },
    ]);
    const stdio = copilotRenderer.render(
      withBlock("github-mcp", "mcp-server", {
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        env: [{ name: "API_KEY", secret: true, value: "s3cret" }],
      }),
      { scope: "user" },
    );
    expect(stdio.changes).toEqual([
      {
        kind: "json-key",
        path: ".copilot/mcp-config.json",
        key: ["mcpServers", "github-mcp"],
        value: {
          type: "stdio",
          command: "npx",
          args: ["-y", "server"],
          // biome-ignore lint/suspicious/noTemplateCurlyInString: an environment variable reference, on purpose.
          env: { API_KEY: "${API_KEY}" },
          tools: ["*"],
        },
      },
    ]);
    expect(JSON.stringify(stdio.changes)).not.toContain("s3cret");
  });

  it("writes a language server to .github/lsp.json or ~/.copilot/lsp-config.json", () => {
    for (const scope of ["project", "user"] as const)
      expect(render("typescript-lsp", { scope }).changes).toEqual([
        {
          kind: "json-key",
          path: scope === "project" ? ".github/lsp.json" : ".copilot/lsp-config.json",
          key: ["lspServers", "typescript-lsp"],
          value: {
            command: "typescript-language-server",
            args: ["--stdio"],
            fileExtensions: {
              ".ts": "typescript",
              ".tsx": "typescript",
              ".js": "javascript",
              ".jsx": "javascript",
              ".mjs": "javascript",
              ".cjs": "javascript",
            },
          },
        },
      ]);
  });

  it("writes a status line only in the home folder", () => {
    const project = render("git-branch");
    expect(project.changes).toEqual([]);
    expect(project.warnings[0]?.message).toContain("--scope user");
    const { changes } = render("git-branch", { scope: "user" });
    expect(changes.map((c) => c.path)).toEqual([
      ".copilot/statusline/git-branch/statusline.sh",
      ".copilot/settings.json",
    ]);
    expect(changes[1]).toMatchObject({
      key: ["statusLine"],
      value: { type: "command", command: '"$HOME"/.copilot/statusline/git-branch/statusline.sh' },
    });
  });

  it("leaves to another target exactly what the spec's table says, in a project", () => {
    const withClaude = { scope: "project" as const, targets: ["claude-code", "copilot"] };
    const withCodex = { scope: "project" as const, targets: ["codex", "copilot"] };
    const message = (name: string, writer: string, where: string) => ({
      changes: [],
      warnings: [
        {
          code: "covered_by_target",
          message: `GitHub Copilot reads ${writer}'s copy of @examples/${name} (${where}), so no second one was written.`,
        },
      ],
    });
    expect(render("github-mcp", withClaude)).toEqual(
      message("github-mcp", "Claude Code", ".mcp.json"),
    );
    expect(render("format-on-edit", withClaude)).toEqual(
      message("format-on-edit", "Claude Code", "hooks in .claude/settings.json"),
    );
    expect(render("house-style", withCodex)).toEqual(message("house-style", "Codex", "AGENTS.md"));
    const always = withBlock("house-style", "rule", { body: "rule.md" });
    expect(copilotRenderer.render(always, withCodex).warnings[0]?.code).toBe("covered_by_target");
    // Everything else is still written: VS Code's Copilot harness reads none of the others' copies.
    for (const name of [
      "secure-coding",
      "review-diff",
      "code-reviewer",
      "house-style",
      "typescript-lsp",
    ])
      expect(render(name, withClaude).changes.length, name).toBeGreaterThan(0);
    for (const name of ["github-mcp", "format-on-edit", "secure-coding"])
      expect(render(name, withCodex).changes.length, name).toBeGreaterThan(0);
    for (const activation of ["model", "manual"]) {
      const rule = withBlock("house-style", "rule", { body: "rule.md", activation });
      expect(copilotRenderer.render(rule, withCodex).changes).toHaveLength(1);
    }
  });

  it("writes its own copy in the home folder, or when the item isn't offered to the other tool", () => {
    const user = { scope: "user" as const, targets: ["claude-code", "codex", "copilot"] };
    for (const name of ["github-mcp", "format-on-edit", "house-style"])
      expect(render(name, user).changes.length, name).toBeGreaterThan(0);
    const item = example("github-mcp");
    const noClaude = {
      ...item,
      manifest: { ...item.manifest, targets: { "claude-code": { enabled: false } } },
    };
    expect(
      copilotRenderer.render(noClaude, { scope: "project", targets: ["claude-code", "copilot"] })
        .changes,
    ).toHaveLength(1);
  });

  it("says it can't take permission policies or output styles", () => {
    expect(copilotRenderer.supports("permission-policy")).toBe("none");
    expect(copilotRenderer.supports("output-style")).toBe("none");
    expect(copilotRenderer.supports("statusline")).toBe("degraded");
    expect(copilotRenderer.supports("lsp-server")).toBe("native");
  });

  it("writes nothing for an item turned off for Copilot", () => {
    const item = example("secure-coding");
    const manifest = { ...item.manifest, targets: { copilot: { enabled: false } } };
    const { changes, warnings } = copilotRenderer.render(
      { ...item, manifest },
      { scope: "project" },
    );
    expect(changes).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(["disabled_by_manifest"]);
  });
});
