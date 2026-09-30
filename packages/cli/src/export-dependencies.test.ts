import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diskHash, writeState } from "./apply.js";
import { discoverLocalItems } from "./export.js";
import { findDependencies, type Selected } from "./export-dependencies.js";
import { places } from "./install.js";
import { type FakeIo, fakeIo } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const write = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const skill = (name: string, front = "") =>
  write(
    io.cwd,
    `.claude/skills/${name}/SKILL.md`,
    `---\nname: ${name}\ndescription: ${name}.\n${front}---\nBody.\n`,
  );
const agent = (file: string, front: string) =>
  write(
    io.cwd,
    `.claude/agents/${file}.md`,
    `---\nname: ${file}\ndescription: ${file}.\n${front}---\nBody.\n`,
  );
const selected = (name: string, type = "agent"): Selected => {
  const item = discoverLocalItems(io, "project").find((i) => i.name === name && i.type === type);
  if (!item) throw new Error(`no ${type} ${name}`);
  return { ...item, local: item.display };
};

/** An agent that loads a skill and uses a server; the skill uses another server. */
const project = async () => {
  io = fakeIo({});
  agent(
    "reviewer",
    "skills: [secure, installed-skill, personal]\ntools: Read, mcp__github__search, mcp__plugin-thing__x\n",
  );
  skill("secure", "allowed-tools: mcp__jira__issues\n");
  skill("installed-skill");
  write(
    io.cwd,
    ".mcp.json",
    JSON.stringify({
      mcpServers: { github: { type: "http", url: "https://g.example" }, jira: { command: "jira" } },
    }),
  );
  write(io.home, ".claude/skills/personal/SKILL.md", "---\nname: personal\ndescription: P.\n---\n");
  const path = ".claude/skills/installed-skill";
  writeState(places(io, "project").state, {
    version: 1,
    entries: [
      {
        item: "@team/installed-skill",
        version: "1.3.0",
        targets: ["claude-code"],
        kind: "dir",
        path,
        sha256: (await diskHash(io.cwd, { kind: "dir", path })) ?? "",
      },
    ],
  });
};

const summary = (findings: Awaited<ReturnType<typeof findDependencies>>) =>
  findings.map((f) => [f.status, f.reference.kind, f.reference.name, f.usedBy]);

describe("findDependencies", () => {
  it("finds yours, installed and not found, and follows yours through to their own", async () => {
    await project();
    const findings = await findDependencies(io, "project", [selected("reviewer")]);
    // The agent's tools come first, then its skills, then what the skill uses.
    expect(summary(findings)).toEqual([
      ["yours", "mcp-server", "github", [".claude/agents/reviewer.md"]],
      ["not_found", "mcp-server", "plugin-thing", [".claude/agents/reviewer.md"]],
      ["yours", "skill", "secure", [".claude/agents/reviewer.md"]],
      ["installed", "skill", "installed-skill", [".claude/agents/reviewer.md"]],
      ["not_found", "skill", "personal", [".claude/agents/reviewer.md"]],
      ["yours", "mcp-server", "jira", [".claude/skills/secure"]],
    ]);
    expect(findings[0]?.item?.key).toBe("github");
    expect(findings[1]?.note).toContain("built into the tool, from a plugin");
    expect(findings[3]?.registry).toEqual({ name: "@team/installed-skill", version: "1.3.0" });
    expect(findings[4]?.note).toContain("home folder (.claude/skills/personal)");
  });

  it("says selected for an item exported in the same run, and doesn't follow it twice", async () => {
    await project();
    const findings = await findDependencies(io, "project", [
      selected("reviewer"),
      selected("secure", "skill"),
    ]);
    expect(findings.find((f) => f.reference.name === "secure")?.status).toBe("selected");
    expect(findings.filter((f) => f.reference.name === "jira")).toHaveLength(1);
  });

  it("counts a shared dependency once, with every item that uses it", async () => {
    await project();
    agent("helper", "skills: [secure]\n");
    const findings = await findDependencies(io, "project", [
      selected("reviewer"),
      selected("helper"),
    ]);
    expect(findings.find((f) => f.reference.name === "secure")?.usedBy).toEqual([
      ".claude/agents/reviewer.md",
      ".claude/agents/helper.md",
    ]);
  });

  it("ignores an item that refers to itself, and reports a pair the manifest forbids", async () => {
    await project();
    const refs = () => [
      { kind: "skill" as const, name: "secure", from: "test" },
      { kind: "skill" as const, name: "other", from: "test" },
    ];
    const self = await findDependencies(
      io,
      "project",
      [{ ...selected("secure", "skill"), name: "secure" }],
      refs,
    );
    expect(summary(self)).toEqual([["not_allowed", "skill", "other", [".claude/skills/secure"]]]);
    expect(self[0]?.note).toBe("A skill can't depend on a skill.");
  });

  it("finds nothing for an item that uses nothing", async () => {
    await project();
    expect(await findDependencies(io, "project", [selected("installed-skill", "skill")])).toEqual(
      [],
    );
  });

  it("looks for a reference in the dependent's own tool first (043)", async () => {
    await project();
    write(
      io.cwd,
      ".cursor/mcp.json",
      JSON.stringify({ mcpServers: { github: { url: "https://cursor.example/mcp" } } }),
    );
    const findings = await findDependencies(io, "project", [
      { ...selected("reviewer"), tool: "claude-code" },
    ]);
    expect(findings.find((f) => f.reference.name === "github")?.item?.display).toBe(
      ".mcp.json (mcpServers.github)",
    );
    const fromCursor = await findDependencies(io, "project", [
      { ...selected("reviewer"), tool: "cursor" },
    ]);
    expect(fromCursor.find((f) => f.reference.name === "github")?.item?.display).toBe(
      ".cursor/mcp.json (mcpServers.github)",
    );
  });
});
