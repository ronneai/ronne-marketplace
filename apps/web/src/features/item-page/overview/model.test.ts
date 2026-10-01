import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ItemType } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  bodyPathOf,
  bodyRoleOf,
  guardrailsOf,
  policyRulesOf,
  riskLabelsOf,
  settingsOf,
} from "./model";

/** The sample items, one per type: 044's table is checked against them. */
const EXAMPLES = join(import.meta.dirname, "../../../../../../examples/items");
const example = (folder: string) => {
  const manifest = parse(readFileSync(join(EXAMPLES, folder, "ronne.yaml"), "utf8"));
  return { manifest, type: manifest.type as ItemType };
};
const overview = (folder: string) => {
  const { manifest, type } = example(folder);
  return { body: bodyPathOf(manifest, type), settings: settingsOf(manifest, type) };
};

describe("an item's Overview (044)", () => {
  it("shows an agent's prompt, tools and model", () => {
    expect(overview("code-reviewer")).toEqual({
      body: "prompt.md",
      settings: [
        { label: "Tools", values: ["read", "grep", "glob", "shell", "mcp:github-mcp"] },
        { label: "Model", values: ["strong"] },
      ],
    });
  });

  it("shows a skill's entry, defaulting to SKILL.md", () => {
    expect(overview("secure-coding")).toEqual({
      body: "SKILL.md",
      settings: [{ label: "Entry file", values: ["SKILL.md"] }],
    });
    expect(bodyPathOf({ skill: {} }, "skill")).toBe("SKILL.md");
  });

  it("shows a rule's body, activation and globs", () => {
    expect(overview("house-style")).toEqual({
      body: "rule.md",
      settings: [
        { label: "Activation", values: ["glob"] },
        { label: "Globs", values: ["**/*.ts", "**/*.tsx"] },
      ],
    });
  });

  it("shows a command's body and arguments", () => {
    expect(overview("review-diff")).toEqual({
      body: "command.md",
      settings: [
        {
          label: "Arguments",
          values: ["target (optional): File or folder to review. Defaults to the whole diff."],
        },
      ],
    });
  });

  it("shows an output style's body, with no settings", () => {
    expect(overview("concise")).toEqual({ body: "style.md", settings: [] });
  });

  it("shows a hook's event, matcher, inline command and timeout, or its script", () => {
    expect(overview("format-on-edit")).toEqual({
      body: null,
      settings: [
        { label: "Event", values: ["tool.after"] },
        { label: "Matcher", values: ["tool: edit"] },
        { label: "Command", values: ["npx --no-install biome format --write $RMK_FILE_PATHS"] },
        { label: "Timeout", values: ["30 s"] },
      ],
    });
    const scripted = { hook: { event: "session.start", run: { script: "start.sh" } } };
    expect(bodyPathOf(scripted, "hook")).toBe("start.sh");
    expect(settingsOf(scripted, "hook")).toEqual([
      { label: "Event", values: ["session.start"] },
      { label: "Script", values: ["start.sh"] },
    ]);
  });

  it("shows a status line's script", () => {
    expect(overview("git-branch")).toEqual({
      body: "statusline.sh",
      settings: [{ label: "Script", values: ["statusline.sh"] }],
    });
  });

  it("shows an MCP server's connection, with environment variable and header names only", () => {
    const { body, settings } = overview("github-mcp");
    expect(body).toBeNull();
    expect(settings).toEqual([
      { label: "Transport", values: ["http"] },
      { label: "URL", values: ["https://api.githubcopilot.com/mcp/"] },
      { label: "Environment variables", values: ["GITHUB_TOKEN (required, secret)"] },
      { label: "Headers", values: ["Authorization"] },
    ]);
    expect(JSON.stringify(settings)).not.toContain("Bearer");
  });

  it("shows a permission policy's rules", () => {
    expect(overview("safe-git")).toEqual({
      body: null,
      settings: [
        {
          label: "Rules",
          values: [
            "deny: shell git push --force*",
            "ask: shell git push*",
            "ask: shell git reset --hard*",
          ],
        },
      ],
    });
  });

  it("shows a language server's command, arguments and languages", () => {
    expect(overview("typescript-lsp")).toEqual({
      body: null,
      settings: [
        { label: "Command", values: ["typescript-language-server"] },
        { label: "Arguments", values: ["--stdio"] },
        {
          label: "Languages",
          values: ["typescript (.ts, .tsx)", "javascript (.js, .jsx, .mjs, .cjs)"],
        },
      ],
    });
  });

  it("shows nothing for a bundle, whose canvas is its content", () => {
    expect(overview("starter-kit")).toEqual({ body: null, settings: [] });
  });

  it("leaves out what a manifest doesn't set, and ignores values of the wrong shape", () => {
    expect(settingsOf({ agent: { tools: "read", model: 3 } }, "agent")).toEqual([
      { label: "Model", values: ["3"] },
    ]);
    expect(settingsOf({}, "mcp-server")).toEqual([]);
    expect(bodyPathOf({ agent: [] }, "agent")).toBeNull();
  });
});

describe("the Overview's summary (044)", () => {
  it("reads a permission policy's rules, leaving out incomplete ones", () => {
    expect(policyRulesOf(example("safe-git").manifest)).toEqual([
      { decision: "deny", tool: "shell", pattern: "git push --force*" },
      { decision: "ask", tool: "shell", pattern: "git push*" },
      { decision: "ask", tool: "shell", pattern: "git reset --hard*" },
    ]);
    expect(
      policyRulesOf({ "permission-policy": { rules: [{ tool: "shell" }, { decision: "deny" }] } }),
    ).toEqual([]);
  });

  it("says what the risk flags are about, once per kind", () => {
    expect(riskLabelsOf([{ kind: "network" }, { kind: "hook" }, { kind: "network" }])).toEqual([
      "Mentions web addresses",
      "Runs on an event",
    ]);
    expect(riskLabelsOf([])).toEqual([]);
  });
});

describe("the dashboard's guardrails and roles (045)", () => {
  it("reads the limits each type's manifest sets", () => {
    const of = (folder: string) => {
      const { manifest, type } = example(folder);
      return guardrailsOf(manifest, type);
    };
    expect(of("code-reviewer")).toEqual([
      "Only these tools: `read`, `grep`, `glob`, `shell`, `mcp:github-mcp`.",
    ]);
    expect(of("house-style")).toEqual(["Applies only to files matching `**/*.ts`, `**/*.tsx`."]);
    expect(of("format-on-edit")).toEqual(["Runs only for the `edit` tool."]);
    expect(of("safe-git")).toEqual([
      "Blocks `shell git push --force*`.",
      "Asks before `shell git push*`.",
      "Asks before `shell git reset --hard*`.",
    ]);
    for (const folder of ["secure-coding", "github-mcp", "starter-kit", "concise"])
      expect(of(folder)).toEqual([]);
    expect(guardrailsOf({ rule: { activation: "manual" } }, "rule")).toEqual([
      "Applies only when someone asks for it.",
    ]);
  });

  it("names the main file's role", () => {
    expect(bodyRoleOf("agent")).toBe("system instruction");
    expect(bodyRoleOf("skill")).toBe("skill entry");
    expect(bodyRoleOf("mcp-server")).toBeNull();
  });
});
