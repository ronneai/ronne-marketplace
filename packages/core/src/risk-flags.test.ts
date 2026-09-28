import { describe, expect, it } from "vitest";
import type { Manifest } from "./manifest.js";
import type { PackageFile } from "./package-file.js";
import { riskFlags } from "./risk-flags.js";

const encode = (text: string) => new TextEncoder().encode(text);
const file = (path: string, text: string, executable = false): PackageFile => ({
  path,
  bytes: encode(text),
  executable,
});
/** The manifest as data, and as the ronne.yaml file the line numbers come from. */
const item = (yaml: string, manifest: Manifest, extra: PackageFile[] = []) =>
  riskFlags(manifest, [file("ronne.yaml", yaml), ...extra]);

describe("riskFlags", () => {
  it("has nothing to say about a plain rule", () => {
    expect(
      item("name: x\ntype: rule\n", { name: "@a/b", type: "rule" }, [file("rule.md", "Be kind.")]),
    ).toEqual([]);
  });

  it("describes a hook's command, event and tool, with its line", () => {
    const yaml =
      'name: "@a/fmt"\ntype: hook\nhook:\n  event: tool.after\n  matcher:\n    tool: edit\n  run:\n    command: "npx biome format --write"\n';
    expect(
      item(yaml, {
        type: "hook",
        hook: {
          event: "tool.after",
          matcher: { tool: "edit" },
          run: { command: "npx biome format --write" },
        },
      }),
    ).toEqual([
      {
        kind: "hook",
        message: "The hook runs `npx biome format --write` on `tool.after` for `edit`.",
        file: "ronne.yaml",
        line: 8,
      },
    ]);
  });

  it("describes a hook that runs a script, and flags the executable script", () => {
    const flags = item(
      "type: hook\nhook:\n  event: session.start\n  run:\n    script: hook.sh\n",
      { type: "hook", hook: { event: "session.start", run: { script: "hook.sh" } } },
      [file("hook.sh", "#!/bin/sh\necho hi\n", true)],
    );
    expect(flags.map((f) => [f.kind, f.message])).toEqual([
      ["hook", "The hook runs the script `hook.sh` on `session.start`."],
      ["executable", "`hook.sh` is an executable shell script."],
    ]);
  });

  it("describes what an MCP server starts, or where it connects", () => {
    expect(
      item("type: mcp-server\n", {
        type: "mcp-server",
        "mcp-server": { transport: "stdio", command: "npx", args: ["-y", "@github/mcp"] },
      })[0]?.message,
    ).toBe("The MCP server starts `npx -y @github/mcp`.");
    const http = item("type: mcp-server\nmcp-server:\n  url: https://api.example.com/mcp\n", {
      type: "mcp-server",
      "mcp-server": { transport: "http", url: "https://api.example.com/mcp" },
    });
    expect(http.map((f) => f.message)).toEqual([
      "The MCP server connects to `https://api.example.com/mcp`.",
      "It mentions `api.example.com`.",
    ]);
  });

  it("lists a policy's allow rules first, as widening", () => {
    const flags = item("type: permission-policy\n", {
      type: "permission-policy",
      "permission-policy": {
        rules: [
          { tool: "shell", pattern: "git push --force*", decision: "deny" },
          { tool: "shell", pattern: "npm test", decision: "allow" },
          { tool: "shell", pattern: "git push*", decision: "ask" },
        ],
      },
    });
    expect(flags.map((f) => [f.message, f.widening])).toEqual([
      ["The policy allows `shell` `npm test` without asking.", true],
      ["The policy denies `shell` `git push --force*`.", false],
      ["The policy asks before `shell` `git push*`.", false],
    ]);
  });

  it("describes a status line's script and a language server's command", () => {
    expect(
      item("type: statusline\n", { type: "statusline", statusline: { script: "status.sh" } })[0]
        ?.message,
    ).toBe("The status line runs the script `status.sh`.");
    expect(
      item("type: lsp-server\n", {
        type: "lsp-server",
        "lsp-server": { command: "typescript-language-server", args: ["--stdio"] },
      })[0]?.message,
    ).toBe("The language server starts `typescript-language-server --stdio`.");
  });

  it("flags executable files and shell scripts, by extension or shebang", () => {
    const flags = item("type: skill\n", { type: "skill" }, [
      file("bin/tool", "\u0000\u0001binary", true),
      file("scripts/setup.sh", "echo hi\n"),
      file("scripts/run", "#!/usr/bin/env bash\necho hi\n"),
      file("notes.md", "Just notes.\n"),
    ]);
    expect(flags.map((f) => f.message)).toEqual([
      "`bin/tool` is executable.",
      "`scripts/setup.sh` is a shell script.",
      "`scripts/run` is a shell script.",
    ]);
  });

  it("lists each host a file mentions once, with where it first appears", () => {
    const flags = item("type: skill\n", { type: "skill" }, [
      file(
        "SKILL.md",
        "See https://docs.example.com/a.\nAnd https://docs.example.com/b, then http://api.test:8080/x.\n",
      ),
      file("README.md", "Also https://docs.example.com/c."),
    ]);
    expect(flags).toEqual([
      { kind: "network", message: "It mentions `docs.example.com`.", file: "SKILL.md", line: 1 },
      { kind: "network", message: "It mentions `api.test:8080`.", file: "SKILL.md", line: 2 },
    ]);
  });
});
