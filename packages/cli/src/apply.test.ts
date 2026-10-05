import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Change } from "@ronneai/core/render";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPlan,
  emptyState,
  mustStayInside,
  planChanges,
  type State,
  type Wanted,
} from "./apply.js";
import { writeFileAtomic } from "./project.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rmk-apply-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const wanted = (change: Change, item = "@t/x", targets = ["claude-code"]): Wanted => ({
  item,
  version: "1.0.0",
  targets,
  change,
});
const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));

/** Plans and applies, returning the plan and the new state. */
const install = async (state: State, changes: Wanted[], force = false) => {
  const plan = await planChanges(root, state, changes, { force });
  return { plan, state: applyPlan(root, state, plan) };
};

describe("applying changes", () => {
  it("creates each kind, records it, and removes exactly that", async () => {
    const changes: Wanted[] = [
      wanted({ kind: "file", path: ".claude/agents/x.md", content: "# x\n" }),
      wanted({
        kind: "dir",
        path: ".claude/skills/x",
        files: [
          { path: "SKILL.md", content: "s" },
          { path: "run.sh", content: "#!/bin/sh\n", executable: true },
        ],
      }),
      wanted({
        kind: "json-key",
        path: ".mcp.json",
        key: ["mcpServers", "x"],
        value: { command: "npx" },
      }),
      wanted({
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["hooks", "PostToolUse"],
        item: { matcher: "Edit", hooks: [] },
      }),
      wanted({
        kind: "section",
        path: "AGENTS.md",
        key: "@t/x",
        text: "Be brief.\n",
      }),
    ];
    const { plan, state } = await install(emptyState(), changes);
    console.log(
      JSON.stringify({
        writes: plan.writes.map((w) => w.entry.kind),
        unchanged: plan.unchanged,
        gone: plan.gone,
        conflicts: plan.conflicts,
      }),
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.writes).toHaveLength(5);
    expect(read(".claude/agents/x.md")).toBe("# x\n");
    expect(read(".claude/skills/x/run.sh")).toBe("#!/bin/sh\n");
    expect(json(".mcp.json")).toEqual({ mcpServers: { x: { command: "npx" } } });
    expect(json(".claude/settings.json")).toEqual({
      hooks: { PostToolUse: [{ matcher: "Edit", hooks: [] }] },
    });
    expect(read("AGENTS.md")).toBe("<!-- rmk:begin @t/x -->\nBe brief.\n<!-- rmk:end @t/x -->\n");
    expect(state.entries).toHaveLength(5);
    expect(state.entries.every((e) => /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true);

    // Reinstalling the same is unchanged; removing takes exactly rmk's things away.
    const again = await install(state, changes);
    expect(again.plan.writes).toEqual([]);
    expect(again.plan.unchanged).toHaveLength(5);
    const removed = await install(again.state, []);
    expect(removed.plan.removes).toHaveLength(5);
    expect(removed.state.entries).toEqual([]);
    expect(existsSync(join(root, ".claude/agents/x.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills/x"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(json(".mcp.json")).toEqual({});
    expect(json(".claude/settings.json")).toEqual({});
  });

  it("keeps the user's other keys, array elements and sections, and their indentation", async () => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude/settings.json"),
      '{\n    "permissions": {\n        "allow": ["Read"]\n    },\n    "hooks": {\n        "PostToolUse": [{"matcher": "Write", "hooks": []}]\n    }\n}\n',
    );
    writeFileSync(join(root, "AGENTS.md"), "# Mine\n\nKeep this.\n");
    const changes: Wanted[] = [
      wanted({
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["hooks", "PostToolUse"],
        item: { matcher: "Edit", hooks: [] },
      }),
      wanted({
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["permissions", "deny"],
        item: "Bash(rm *)",
      }),
      wanted({
        kind: "section",
        path: "AGENTS.md",
        key: "@t/x",
        text: "Be brief.\n",
      }),
    ];
    const { plan, state } = await install(emptyState(), changes);
    expect(plan.conflicts).toEqual([]);
    const settings = read(".claude/settings.json");
    expect(settings.startsWith('{\n    "permissions"')).toBe(true);
    expect(json(".claude/settings.json")).toEqual({
      permissions: { allow: ["Read"], deny: ["Bash(rm *)"] },
      hooks: {
        PostToolUse: [
          { matcher: "Write", hooks: [] },
          { matcher: "Edit", hooks: [] },
        ],
      },
    });
    expect(read("AGENTS.md")).toBe(
      "# Mine\n\nKeep this.\n\n<!-- rmk:begin @t/x -->\nBe brief.\n<!-- rmk:end @t/x -->\n",
    );
    const removed = await install(state, []);
    expect(removed.plan.conflicts).toEqual([]);
    expect(json(".claude/settings.json")).toEqual({
      permissions: { allow: ["Read"] },
      hooks: { PostToolUse: [{ matcher: "Write", hooks: [] }] },
    });
    expect(read("AGENTS.md")).toBe("# Mine\n\nKeep this.\n");
  });

  it("never touches a file or key rmk didn't write: a conflict, unless forced", async () => {
    mkdirSync(join(root, ".claude/agents"), { recursive: true });
    writeFileSync(join(root, ".claude/agents/x.md"), "theirs\n");
    writeFileSync(join(root, ".mcp.json"), '{"mcpServers":{"x":{"command":"mine"}}}\n');
    const changes: Wanted[] = [
      wanted({ kind: "file", path: ".claude/agents/x.md", content: "ours\n" }),
      wanted({
        kind: "json-key",
        path: ".mcp.json",
        key: ["mcpServers", "x"],
        value: { command: "ours" },
      }),
    ];
    const { plan } = await install(emptyState(), changes);
    expect(plan.conflicts.map((c) => [c.path, c.reason])).toEqual([
      [".claude/agents/x.md", "unmanaged"],
      [".mcp.json", "unmanaged"],
    ]);
    expect(read(".claude/agents/x.md")).toBe("theirs\n");
    expect(json(".mcp.json").mcpServers.x.command).toBe("mine");
    const forced = await install(emptyState(), changes, true);
    expect(forced.plan.conflicts).toEqual([]);
    expect(read(".claude/agents/x.md")).toBe("ours\n");
    expect(json(".mcp.json").mcpServers.x.command).toBe("ours");
  });

  it("reports what the user edited since as a conflict on update and on removal, unless forced", async () => {
    const change = wanted({ kind: "file", path: ".claude/rules/x.md", content: "v1\n" });
    const { state } = await install(emptyState(), [change]);
    writeFileSync(join(root, ".claude/rules/x.md"), "edited by hand\n");
    const update = await install(state, [
      wanted({ kind: "file", path: ".claude/rules/x.md", content: "v2\n" }),
    ]);
    expect(update.plan.conflicts).toEqual([
      { item: "@t/x", kind: "file", path: ".claude/rules/x.md", reason: "edited" },
    ]);
    expect(read(".claude/rules/x.md")).toBe("edited by hand\n");
    const removal = await install(state, []);
    expect(removal.plan.conflicts).toHaveLength(1);
    expect(existsSync(join(root, ".claude/rules/x.md"))).toBe(true);
    const forced = await install(state, [], true);
    expect(forced.plan.conflicts).toEqual([]);
    expect(existsSync(join(root, ".claude/rules/x.md"))).toBe(false);
  });

  it("treats a missing file or key as removed by the user, and brings it back only when wanted", async () => {
    const file = wanted({ kind: "file", path: ".claude/rules/x.md", content: "v1\n" });
    const key = wanted({
      kind: "json-key",
      path: ".mcp.json",
      key: ["mcpServers", "x"],
      value: { a: 1 },
    });
    const { state } = await install(emptyState(), [file, key]);
    rmSync(join(root, ".claude/rules/x.md"));
    writeFileSync(join(root, ".mcp.json"), "{}\n");
    const removal = await install(state, []);
    expect(removal.plan.gone).toHaveLength(2);
    expect(removal.plan.conflicts).toEqual([]);
    expect(removal.state.entries).toEqual([]);
    const back = await install(state, [file, key]);
    expect(back.plan.gone).toHaveLength(2);
    expect(back.plan.writes).toHaveLength(2);
    expect(read(".claude/rules/x.md")).toBe("v1\n");
  });

  it("counts an extra file in a managed folder as an edit", async () => {
    const dir = wanted({
      kind: "dir",
      path: ".claude/skills/x",
      files: [{ path: "SKILL.md", content: "s" }],
    });
    const { state } = await install(emptyState(), [dir]);
    writeFileSync(join(root, ".claude/skills/x/notes.md"), "mine");
    const removal = await install(state, []);
    expect(removal.plan.conflicts.map((c) => c.reason)).toEqual(["edited"]);
    expect(existsSync(join(root, ".claude/skills/x/notes.md"))).toBe(true);
  });

  it("merges an identical change from two targets into one entry, and refuses different content", async () => {
    const skill: Change = {
      kind: "dir",
      path: ".agents/skills/x",
      files: [{ path: "SKILL.md", content: "s" }],
    };
    const { plan, state } = await install(emptyState(), [
      wanted(skill, "@t/x", ["codex"]),
      wanted(skill, "@t/x", ["cursor"]),
    ]);
    expect(plan.writes).toHaveLength(1);
    expect(state.entries[0]?.targets).toEqual(["codex", "cursor"]);
    await expect(
      planChanges(root, emptyState(), [
        wanted({ kind: "file", path: "a.md", content: "1" }, "@a/fmt"),
        wanted({ kind: "file", path: "a.md", content: "2" }, "@b/fmt"),
      ]),
    ).rejects.toMatchObject({ code: "name_clash" });
  });

  it("keeps executable bits, and writes files whole", async () => {
    await install(emptyState(), [
      wanted({ kind: "file", path: "bin/run.sh", content: "#!/bin/sh\n", executable: true }),
    ]);
    const { statSync } = await import("node:fs");
    expect(statSync(join(root, "bin/run.sh")).mode & 0o111).not.toBe(0);
    chmodSync(join(root, "bin/run.sh"), 0o644);
    expect(existsSync(join(root, "bin/run.sh.tmp"))).toBe(false);
  });

  it("replaces a changed array element instead of adding a second one", async () => {
    const hook = (command: string): Wanted =>
      wanted({
        kind: "json-array-item",
        path: ".claude/settings.json",
        key: ["hooks", "PostToolUse"],
        item: { matcher: "Edit", hooks: [{ type: "command", command }] },
      });
    const { state } = await install(emptyState(), [hook("echo v1")]);
    const updated = await install(state, [hook("echo v2")]);
    expect(updated.plan.removes).toHaveLength(1);
    expect(updated.plan.writes).toHaveLength(1);
    expect(json(".claude/settings.json").hooks.PostToolUse).toEqual([
      { matcher: "Edit", hooks: [{ type: "command", command: "echo v2" }] },
    ]);
    expect(updated.state.entries).toHaveLength(1);
  });

  describe("TOML keys (024)", () => {
    const server = (command = "npx", name = "github"): Wanted =>
      wanted(
        {
          kind: "toml-key",
          path: ".codex/config.toml",
          key: ["mcp_servers", name],
          value: { command, args: ["-y", "server"], env_vars: ["GITHUB_TOKEN"] },
        },
        "@t/x",
        ["codex"],
      );
    const toml = () => parseToml(read(".codex/config.toml"));

    it("creates the file, and removes it when the last key goes", async () => {
      const { plan, state } = await install(emptyState(), [server()]);
      expect(plan.conflicts).toEqual([]);
      expect(plan.reformatted).toEqual([]);
      expect(toml()).toEqual({
        mcp_servers: {
          github: { command: "npx", args: ["-y", "server"], env_vars: ["GITHUB_TOKEN"] },
        },
      });
      expect(state.entries[0]).toMatchObject({ kind: "toml-key", key: ["mcp_servers", "github"] });
      const removed = await install(state, []);
      expect(removed.plan.removes).toHaveLength(1);
      expect(existsSync(join(root, ".codex/config.toml"))).toBe(false);
      expect(removed.state.entries).toEqual([]);
    });

    it("keeps the other keys, and says when the rewrite drops comments", async () => {
      mkdirSync(join(root, ".codex"), { recursive: true });
      writeFileSync(
        join(root, ".codex/config.toml"),
        '# my settings\nmodel = "o3"\n\n[mcp_servers.mine]\ncommand = "mine"\n',
      );
      const { plan, state } = await install(emptyState(), [server()]);
      expect(plan.reformatted).toEqual([".codex/config.toml"]);
      expect(toml()).toMatchObject({ model: "o3", mcp_servers: { mine: { command: "mine" } } });
      expect(read(".codex/config.toml")).not.toContain("# my settings");
      const again = await install(state, [server("bunx")]);
      expect(again.plan.reformatted).toEqual([]);
      expect(again.plan.writes).toHaveLength(1);
      const removed = await install(again.state, []);
      expect(toml()).toEqual({ model: "o3", mcp_servers: { mine: { command: "mine" } } });
      expect(removed.state.entries).toEqual([]);
    });

    it("leaves a key it didn't write, or one edited since, unless forced", async () => {
      mkdirSync(join(root, ".codex"), { recursive: true });
      writeFileSync(join(root, ".codex/config.toml"), '[mcp_servers.github]\ncommand = "own"\n');
      const unmanaged = await install(emptyState(), [server()]);
      expect(unmanaged.plan.conflicts).toMatchObject([{ reason: "unmanaged" }]);
      expect(toml()).toEqual({ mcp_servers: { github: { command: "own" } } });

      rmSync(join(root, ".codex/config.toml"));
      const { state } = await install(emptyState(), [server()]);
      writeFileSync(
        join(root, ".codex/config.toml"),
        read(".codex/config.toml").replace('"npx"', '"edited"'),
      );
      const edited = await install(state, [server("bunx")]);
      expect(edited.plan.conflicts).toMatchObject([{ reason: "edited" }]);
      const forced = await install(state, [server("bunx")], true);
      expect(forced.plan.conflicts).toEqual([]);
      expect(toml()).toMatchObject({ mcp_servers: { github: { command: "bunx" } } });
    });

    it("drops the entry when the person removed the key", async () => {
      const { state } = await install(emptyState(), [server(), server("uvx", "other")]);
      writeFileSync(
        join(root, ".codex/config.toml"),
        '[mcp_servers.other]\ncommand = "uvx"\nargs = [ "-y", "server" ]\nenv_vars = [ "GITHUB_TOKEN" ]\n',
      );
      const plan = await planChanges(root, state, []);
      expect(plan.gone.map((e) => e.key)).toEqual([["mcp_servers", "github"]]);
      expect(plan.removes.map((e) => e.key)).toEqual([["mcp_servers", "other"]]);
    });

    it("refuses a file that isn't TOML", async () => {
      mkdirSync(join(root, ".codex"), { recursive: true });
      writeFileSync(join(root, ".codex/config.toml"), "not = [toml\n");
      await expect(planChanges(root, emptyState(), [server()])).rejects.toThrow(
        /isn't a TOML file rmk can edit/,
      );
    });
  });

  it("keeps one entry for a key several items want, until the last one leaves", async () => {
    const version = (item: string): Wanted =>
      wanted({ kind: "json-key", path: ".cursor/hooks.json", key: ["version"], value: 1 }, item, [
        "cursor",
      ]);
    const first = await install(emptyState(), [version("@t/a"), version("@t/b")]);
    expect(first.plan.writes).toHaveLength(1);
    expect(first.state.entries).toHaveLength(1);
    // Already on disk: both still want it, and neither is a clash.
    const again = await install(first.state, [version("@t/a"), version("@t/b")]);
    expect(again.plan.unchanged).toHaveLength(1);
    const onlyB = await install(again.state, [version("@t/b")]);
    expect(onlyB.plan.removes).toEqual([]);
    expect(json(".cursor/hooks.json")).toEqual({ version: 1 });
    const none = await install(onlyB.state, []);
    expect(none.plan.removes).toHaveLength(1);
    expect(json(".cursor/hooks.json")).toEqual({});
  });

  it("refuses a key path that would reach an object's prototype", async () => {
    for (const key of [["__proto__", "polluted"], ["mcpServers", "constructor"], ["prototype"]]) {
      const plan = await planChanges(root, emptyState(), [
        wanted({ kind: "json-key", path: ".mcp.json", key, value: { yes: true } }),
      ]);
      expect(() => applyPlan(root, emptyState(), plan)).toThrow(/rmk won't write the key/);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("paths outside the folder (security audit ITEM-1)", () => {
  // A project inside a home folder, as on a developer's machine.
  let home: string;
  let project: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "rmk-home-"));
    project = join(home, "code", "proj");
    mkdirSync(project, { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const stateWith = (entry: Partial<State["entries"][number]>): State => ({
    version: 1,
    entries: [
      {
        item: "@t/x",
        version: "1.0.0",
        targets: ["claude-code"],
        kind: "dir",
        path: "x",
        sha256: "0".repeat(64),
        ...entry,
      },
    ],
  });

  it("refuses a state entry outside the project, with --force too, touching nothing", async () => {
    const victim = join(home, "code", "victim");
    mkdirSync(victim);
    writeFileSync(join(victim, "keep.txt"), "mine");
    for (const force of [false, true])
      await expect(
        planChanges(project, stateWith({ path: "../victim" }), [], { force, contain: true }),
      ).rejects.toMatchObject({ code: "unsafe_path" });
    expect(readFileSync(join(victim, "keep.txt"), "utf8")).toBe("mine");
  });

  it("refuses an edit of a settings file outside the project", async () => {
    const settings = join(home, ".claude", "settings.json");
    mkdirSync(join(home, ".claude"));
    const before = `${JSON.stringify({ permissions: { deny: ["Bash(rm -rf:*)"] } }, null, 2)}\n`;
    writeFileSync(settings, before);
    const entry = {
      kind: "json-array-item" as const,
      path: "../../.claude/settings.json",
      key: ["permissions", "deny"],
      sha256: hash(JSON.stringify("Bash(rm -rf:*)")),
    };
    await expect(planChanges(project, stateWith(entry), [], {})).rejects.toMatchObject({
      code: "unsafe_path",
    });
    expect(readFileSync(settings, "utf8")).toBe(before);
  });

  it("refuses absolute, drive-letter, backslash and dot paths, from the state or a renderer", async () => {
    for (const path of ["/etc/x", "C:/x", "a\\..\\..\\x", "./x", "a//b", ".."])
      await expect(planChanges(project, stateWith({ path }), [])).rejects.toMatchObject({
        code: "unsafe_path",
      });
    const change: Change = {
      kind: "file",
      path: ".claude/hooks/x/../../../../escaped.sh",
      content: new Uint8Array(),
      executable: true,
    };
    await expect(planChanges(project, emptyState(), [wanted(change)])).rejects.toMatchObject({
      code: "unsafe_path",
    });
  });

  it("in a project, refuses writes through a committed link that leads outside it", async () => {
    const elsewhere = join(home, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(project, ".claude"));
    const change: Change = {
      kind: "file",
      path: ".claude/skills/x/SKILL.md",
      content: new TextEncoder().encode("hi"),
      executable: false,
    };
    await expect(
      planChanges(project, emptyState(), [wanted(change)], { contain: true }),
    ).rejects.toMatchObject({ code: "unsafe_path" });
    expect(readdirSync(elsewhere)).toEqual([]);
    // In user scope a linked ~/.claude (a dotfiles folder) is the person's own choice.
    const plan = await planChanges(project, emptyState(), [wanted(change)], { contain: false });
    expect(plan.writes).toHaveLength(1);
    // A link that stays in the project is fine.
    unlinkSync(join(project, ".claude"));
    mkdirSync(join(project, "real"));
    symlinkSync(join(project, "real"), join(project, ".claude"));
    await expect(
      planChanges(project, emptyState(), [wanted(change)], { contain: true }),
    ).resolves.toMatchObject({ writes: [expect.anything()] });
  });

  it("refuses a link to nothing, and a state file a committed .rmk link sends elsewhere", async () => {
    // A dangling link: writing would create its target, wherever it points.
    symlinkSync(join(home, "elsewhere", "new"), join(project, ".claude"));
    const change: Change = {
      kind: "file",
      path: ".claude/skills/x/SKILL.md",
      content: new TextEncoder().encode("hi"),
      executable: false,
    };
    await expect(
      planChanges(project, emptyState(), [wanted(change)], { contain: true }),
    ).rejects.toMatchObject({ code: "unsafe_path" });
    // `.rmk` itself linked outside: the state file would land there.
    mkdirSync(join(home, "elsewhere"));
    symlinkSync(join(home, "elsewhere"), join(project, ".rmk"));
    expect(() => mustStayInside(project, ".rmk/state.json", "It would write")).toThrow(
      /outside its folder/,
    );
  });

  it("writes a whole file over a link, never through it, and never through a temporary name", () => {
    const victim = join(home, "victim.txt");
    writeFileSync(victim, "mine");
    const file = join(project, "rmk.lock");
    symlinkSync(victim, file);
    writeFileAtomic(file, "{}\n");
    expect(readFileSync(victim, "utf8")).toBe("mine");
    expect(lstatSync(file).isSymbolicLink()).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("{}\n");
    // The temporary file's name is random, and it's created exclusively: nothing is left behind.
    expect(readdirSync(project).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("checks again when applying, so a plan can't be made to reach outside", () => {
    const plan = {
      writes: [],
      unchanged: [],
      removes: stateWith({ path: "../victim" }).entries,
      gone: [],
      conflicts: [],
      reformatted: [],
    };
    mkdirSync(join(home, "code", "victim"));
    expect(() => applyPlan(project, emptyState(), plan, { contain: true })).toThrow(
      /outside|leave the folder/,
    );
    expect(existsSync(join(home, "code", "victim"))).toBe(true);
  });
});
