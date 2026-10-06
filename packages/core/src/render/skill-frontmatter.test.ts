import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest.js";
import { claudeCodeRenderer } from "./claude-code/renderer.js";
import { codexRenderer } from "./codex/renderer.js";
import { cursorRenderer } from "./cursor/renderer.js";
import {
  agentsSkillEntry,
  claudeCodeSkillEntry,
  renderDependencyOf,
  withDependencies,
} from "./skill-frontmatter.js";
import type { Change, RenderInput } from "./types.js";

// A skill names the agent that runs it; an agent preloads its skills in Claude Code (097).
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const text = (bytes: Uint8Array) => decoder.decode(bytes);
const bytes = (value: string) => encoder.encode(value);

const skillMd = (front: string) =>
  `---\nname: helper\ndescription: Helps.\n${front}---\n# Helper\n`;

describe("claudeCodeSkillEntry", () => {
  it("names the installed agent and adds context: fork", () => {
    expect(text(claudeCodeSkillEntry(bytes(skillMd('agent: "@team/reviewer"\n'))))).toBe(
      skillMd("agent: reviewer\ncontext: fork\n"),
    );
    // Unquoted, as people write it.
    expect(text(claudeCodeSkillEntry(bytes(skillMd("agent: @team/reviewer\n"))))).toBe(
      skillMd("agent: reviewer\ncontext: fork\n"),
    );
  });

  it("names the plugin's own agent plugin:agent inside a plugin", () => {
    expect(
      text(claudeCodeSkillEntry(bytes(skillMd('agent: "@team/reviewer"\n')), "team.helper")),
    ).toBe(skillMd("agent: team.helper:reviewer\ncontext: fork\n"));
  });

  it("keeps a context that's there, CRLF, and the rest of the file", () => {
    expect(
      text(claudeCodeSkillEntry(bytes(skillMd('context: fork\nagent: "@team/reviewer" # who\n')))),
    ).toBe(skillMd("context: fork\nagent: reviewer\n"));
    const crlf = '---\r\nname: helper\r\nagent: "@a/b"\r\n---\r\nBody\r\n';
    expect(text(claudeCodeSkillEntry(bytes(crlf)))).toBe(
      "---\r\nname: helper\r\nagent: b\r\ncontext: fork\r\n---\r\nBody\r\n",
    );
  });

  it("leaves a plain name, no agent, and broken frontmatter as they are", () => {
    for (const same of [skillMd("agent: Explore\n"), skillMd(""), "---\nname: [x\n---\n", "Body"]) {
      const input = bytes(same);
      expect(claudeCodeSkillEntry(input)).toBe(input);
    }
  });
});

describe("hostile frontmatter (docs/knowledge/codeql-regex.md)", () => {
  it("stays fast", () => {
    const started = performance.now();
    for (const input of [
      `---\n${"\r\n-".repeat(100_000)}`,
      `---\nagent: "@a/b"\n${"a".repeat(100_000)}${" ".repeat(100_000)}\n---\n`,
      `---\nagent: "@a/b"\n${" \t".repeat(100_000)}\n---\n`,
    ]) {
      claudeCodeSkillEntry(bytes(input));
      agentsSkillEntry(bytes(input));
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("agentsSkillEntry", () => {
  it("drops agent and context, and says so", () => {
    const { bytes: out, dropped } = agentsSkillEntry(
      bytes(skillMd('agent: "@team/reviewer"\ncontext: fork\nlicense: MIT\n')),
    );
    expect(dropped).toBe(true);
    expect(text(out)).toBe(skillMd("license: MIT\n"));
    expect(text(agentsSkillEntry(bytes(skillMd("agent:\n  Explore\n"))).bytes)).toBe(skillMd(""));
  });

  it("leaves a skill without them as it is", () => {
    const input = bytes(skillMd("license: MIT\n"));
    expect(agentsSkillEntry(input)).toEqual({ bytes: input, dropped: false });
  });
});

const skill = (front: string): RenderInput => ({
  name: "@team/helper",
  version: "1.0.0",
  manifest: {
    name: "@team/helper",
    type: "skill",
    description: "Helps.",
    skill: { entry: "SKILL.md" },
    dependencies: { "@team/reviewer": "^1.0.0" },
  } as Manifest,
  files: [{ path: "SKILL.md", bytes: bytes(skillMd(front)) }],
});

const skillFile = (changes: Change[]) => {
  const dir = changes.find((c) => c.kind === "dir");
  const file = dir?.kind === "dir" ? dir.files.find((f) => f.path === "SKILL.md") : undefined;
  return file ? text(file.content as Uint8Array) : "";
};

describe("the renderers (097)", () => {
  it("Claude Code writes the agent's installed name; Codex and Cursor leave it out, with a warning", () => {
    const input = skill('agent: "@team/reviewer"\n');
    expect(skillFile(claudeCodeRenderer.render(input, { scope: "project" }).changes)).toBe(
      skillMd("agent: reviewer\ncontext: fork\n"),
    );
    for (const renderer of [codexRenderer, cursorRenderer]) {
      const { changes, warnings } = renderer.render(input, {
        scope: "project",
        targets: [renderer.id],
      });
      expect(skillFile(changes)).toBe(skillMd(""));
      expect(warnings.map((w) => w.code)).toEqual(["unsupported_field"]);
    }
  });

  it("Claude Code preloads an agent's skills, but not one the model may not invoke", () => {
    const agent: RenderInput = {
      name: "@team/reviewer",
      version: "1.0.0",
      manifest: {
        name: "@team/reviewer",
        type: "agent",
        description: "Reviews.",
        agent: { prompt: "prompt.md" },
        dependencies: {
          "@team/b": "^1.0.0",
          "@team/a": "^1.0.0",
          "@team/quiet": "^1.0.0",
          "@team/mcp": "^1.0.0",
        },
      } as Manifest,
      files: [{ path: "prompt.md", bytes: bytes("Review.") }],
    };
    const facts = (name: string, front = "") =>
      renderDependencyOf({
        name,
        manifest: { name, type: "skill", skill: { entry: "SKILL.md" } },
        files: [{ path: "SKILL.md", bytes: bytes(skillMd(front)) }],
      });
    const known = new Map(
      [
        facts("@team/a"),
        facts("@team/b"),
        facts("@team/quiet", "disable-model-invocation: true\n"),
        renderDependencyOf({ name: "@team/mcp", manifest: { type: "mcp-server" }, files: [] }),
      ].flatMap((d) => (d ? [[d.name, d] as const] : [])),
    );
    const { changes } = claudeCodeRenderer.render(withDependencies(agent, known), {
      scope: "project",
    });
    const file = changes.find((c) => c.kind === "file");
    expect(file?.kind === "file" ? String(file.content) : "").toContain(
      "skills:\n  - a\n  - b\n---",
    );
    // Without what was resolved, nothing is preloaded.
    const bare = claudeCodeRenderer.render(agent, { scope: "project" }).changes[0];
    expect(bare?.kind === "file" ? String(bare.content) : "").not.toContain("skills:");
  });
});
