import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diskHash, writeState } from "./apply.js";
import { findSkills, ownershipOf, walkItemFolder } from "./export.js";
import { places } from "./install.js";
import { type FakeIo, fakeIo } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const write = (root: string, path: string, content = "x", mode?: number) => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  if (mode !== undefined) chmodSync(full, mode);
};
const skill = (root: string, folder: string, name: string) =>
  write(root, `${folder}/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${name}.\n---\n`);

describe("findSkills", () => {
  it("finds skills in both folders of a scope, by name, and only folders with a SKILL.md", () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    skill(io.cwd, ".agents/skills", "deploy");
    skill(io.cwd, ".agents/skills", "review");
    write(io.cwd, ".claude/skills/notes/README.md");
    write(io.cwd, ".claude/skills/stray.md");
    skill(io.home, ".claude/skills", "personal");

    expect(findSkills(io, "project").map((s) => [s.name, s.display])).toEqual([
      ["deploy", ".agents/skills/deploy"],
      ["review", ".agents/skills/review"],
      ["review", ".claude/skills/review"],
    ]);
    expect(findSkills(io, "user").map((s) => [s.name, s.display, s.scope])).toEqual([
      ["personal", ".claude/skills/personal", "user"],
    ]);
  });

  it("lists a folder once when one path links to the other", () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    mkdirSync(join(io.cwd, ".agents/skills"), { recursive: true });
    symlinkSync(join(io.cwd, ".claude/skills/review"), join(io.cwd, ".agents/skills/review"));
    expect(findSkills(io, "project").map((s) => s.display)).toEqual([".claude/skills/review"]);
  });

  it("finds a skill folder that is itself a link, and none when the folders are missing", () => {
    io = fakeIo({});
    expect(findSkills(io, "project")).toEqual([]);
    skill(io.home, "elsewhere", "linked");
    mkdirSync(join(io.cwd, ".claude/skills"), { recursive: true });
    symlinkSync(join(io.home, "elsewhere/linked"), join(io.cwd, ".claude/skills/linked"));
    symlinkSync(join(io.home, "nowhere"), join(io.cwd, ".claude/skills/broken"));
    expect(findSkills(io, "project").map((s) => s.name)).toEqual(["linked"]);
  });
});

describe("walkItemFolder", () => {
  it("reads every file with its executable bit, and skips what's never uploaded, saying why", () => {
    io = fakeIo({});
    const dir = join(io.cwd, "skill");
    write(dir, "SKILL.md", "---\nname: a\n---\n");
    write(dir, "scripts/run.sh", "#!/bin/sh\n", 0o755);
    write(dir, "docs/guide.md");
    for (const path of [
      ".git/config",
      "node_modules/x/index.js",
      "sub/__pycache__/a.pyc",
      ".ronne/notes",
      ".hg/x",
      ".svn/x",
    ])
      write(dir, path);
    for (const path of [".DS_Store", "docs/Thumbs.db"]) write(dir, path);
    for (const path of [
      ".env",
      ".env.local",
      "certs/server.pem",
      "deploy.key",
      "id_rsa",
      "id_rsa.pub",
      ".npmrc",
      ".netrc",
    ])
      write(dir, path, "secret");
    symlinkSync(join(dir, "docs/guide.md"), join(dir, "guide-link.md"));
    symlinkSync(join(dir, "docs"), join(dir, "docs-link"));

    const walked = walkItemFolder(dir);
    expect(walked.over).toBeNull();
    expect(walked.files.map((f) => [f.path, f.executable])).toEqual([
      ["SKILL.md", false],
      ["docs/guide.md", false],
      ["scripts/run.sh", true],
    ]);
    expect(walked.skipped).toEqual([
      { path: ".DS_Store", reason: "not_item" },
      { path: ".env", reason: "secret_file" },
      { path: ".env.local", reason: "secret_file" },
      { path: ".git/", reason: "not_item" },
      { path: ".hg/", reason: "not_item" },
      { path: ".netrc", reason: "secret_file" },
      { path: ".npmrc", reason: "secret_file" },
      { path: ".ronne/", reason: "not_item" },
      { path: ".svn/", reason: "not_item" },
      { path: "certs/server.pem", reason: "secret_file" },
      { path: "deploy.key", reason: "secret_file" },
      { path: "docs-link", reason: "link" },
      { path: "docs/Thumbs.db", reason: "not_item" },
      { path: "guide-link.md", reason: "link" },
      { path: "id_rsa", reason: "secret_file" },
      { path: "id_rsa.pub", reason: "secret_file" },
      { path: "node_modules/", reason: "not_item" },
      { path: "sub/__pycache__/", reason: "not_item" },
    ]);
    expect(new TextDecoder().decode(walked.files[0]?.bytes)).toBe("---\nname: a\n---\n");
  });

  it("reads a folder that is itself a link from where it points", () => {
    io = fakeIo({});
    write(io.home, "real/SKILL.md", "hi");
    symlinkSync(join(io.home, "real"), join(io.cwd, "linked"));
    expect(walkItemFolder(join(io.cwd, "linked")).files.map((f) => f.path)).toEqual(["SKILL.md"]);
  });

  it("stops at the first limit it passes, without reading on", () => {
    io = fakeIo({});
    const dir = join(io.cwd, "big");
    for (let i = 0; i < 5; i += 1) write(dir, `f${i}.md`, "x".repeat(10));
    const limits = { maxFiles: 500, maxFileBytes: 100, maxTotalBytes: 1000, maxPackedBytes: 1000 };
    expect(walkItemFolder(dir, { ...limits, maxFiles: 4 })).toEqual({
      files: [],
      skipped: [],
      over: { limit: "files", max: 4 },
    });
    expect(walkItemFolder(dir, { ...limits, maxTotalBytes: 45 }).over).toEqual({
      limit: "total",
      max: 45,
    });
    write(dir, "huge.bin", "x".repeat(101));
    expect(walkItemFolder(dir, limits).over).toEqual({
      limit: "file",
      path: "huge.bin",
      size: 101,
      max: 100,
    });
  });
});

describe("ownershipOf", () => {
  /** Records the folder in a scope's state file, as `rmk install` does. */
  const recordInstall = async (scope: "project" | "user", path: string, item = "@team/review") => {
    const { root, state } = places(io, scope);
    const sha256 = (await diskHash(root, { kind: "dir", path })) ?? "";
    writeState(state, {
      version: 1,
      entries: [{ item, version: "1.2.0", targets: ["claude-code"], kind: "dir", path, sha256 }],
    });
  };
  const ownership = (dir: string) => ownershipOf(io, dir, walkItemFolder(dir).files);

  it("says written here when nothing else applies", async () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    expect(await ownership(join(io.cwd, ".claude/skills/review"))).toEqual({ owner: "local" });
  });

  it("finds an installed folder in the state file, and whether it was edited since", async () => {
    io = fakeIo({});
    skill(io.cwd, ".claude/skills", "review");
    const dir = join(io.cwd, ".claude/skills/review");
    await recordInstall("project", ".claude/skills/review");
    expect(await ownership(dir)).toEqual({
      owner: "installed",
      item: "@team/review",
      version: "1.2.0",
      edited: false,
      scope: "project",
    });
    write(dir, "notes.md", "mine");
    expect(await ownership(dir)).toMatchObject({ owner: "installed", edited: true });
  });

  it("finds a user-scope install when the home folder is the project", async () => {
    io = fakeIo({});
    io.cwd = io.home;
    skill(io.home, ".claude/skills", "review");
    await recordInstall("user", ".claude/skills/review");
    const [found] = findSkills(io, "project");
    expect(found?.display).toBe(".claude/skills/review");
    expect(await ownership(found?.dir ?? "")).toMatchObject({ owner: "installed", scope: "user" });
  });

  it("calls a folder whose ronne.yaml has a version a registry copy", async () => {
    io = fakeIo({});
    const dir = join(io.cwd, "copied");
    write(dir, "SKILL.md", "---\nname: tool\n---\n");
    write(dir, "ronne.yaml", 'name: "@other/tool"\nversion: 1.4.0\ntype: skill\n');
    expect(await ownership(dir)).toEqual({
      owner: "registry_copy",
      item: "@other/tool",
      version: "1.4.0",
    });
    write(dir, "ronne.yaml", "name: [\n");
    expect(await ownership(dir)).toEqual({ owner: "local" });
  });

  it("calls a SKILL.md with rmk's marker rendered: a rule or command written as a skill", async () => {
    io = fakeIo({});
    const dir = join(io.cwd, ".claude/skills/house-style");
    write(
      dir,
      "SKILL.md",
      "---\nname: house-style\n---\n<!-- managed by rmk: @examples/house-style@1.0.0 -->\n\nBody.\n",
    );
    expect(await ownership(dir)).toEqual({
      owner: "rendered",
      item: "@examples/house-style",
      version: "1.0.0",
    });
  });
});
