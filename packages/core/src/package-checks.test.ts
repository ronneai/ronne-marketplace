import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "./limits.js";
import { type Manifest, parseManifest } from "./manifest.js";
import { checkPackage, pathProblem, secretLike } from "./package-checks.js";
import type { PackageFile } from "./package-file.js";

const utf8 = (text: string) => new TextEncoder().encode(text);
const file = (path: string, content = "x"): PackageFile => ({ path, bytes: utf8(content) });

/** Every file of an example folder, as the web app or rmk would hand them over. */
const examplesDir = new URL("../../../examples/items/", import.meta.url);
const readFolder = (dir: URL, prefix = ""): PackageFile[] =>
  readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    return statSync(url).isDirectory()
      ? readFolder(new URL(`${name}/`, dir), `${prefix}${name}/`)
      : [{ path: `${prefix}${name}`, bytes: readFileSync(url) }];
  });
const examples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => ({ name: e.name, files: readFolder(new URL(`${e.name}/`, examplesDir)) }));

const manifestOf = (files: PackageFile[]) =>
  parseManifest(new TextDecoder().decode(files.find((f) => f.path === "ronne.yaml")?.bytes))
    .manifest as Manifest;

const codes = (manifest: Manifest, files: PackageFile[]) =>
  checkPackage(manifest, files).map((i) => i.code);

const agent = (extra: Partial<Manifest> = {}): Manifest => ({
  name: "@a/reviewer",
  type: "agent",
  description: "Reviews.",
  agent: { prompt: "prompt.md" },
  ...extra,
});
const agentFiles = () => [file("ronne.yaml", "name: x"), file("prompt.md", "Review.")];

describe("checkPackage: the examples", () => {
  it.each(examples)("$name passes", ({ files }) => {
    expect(checkPackage(manifestOf(files), files)).toEqual([]);
  });
});

describe("checkPackage: files the manifest names", () => {
  it("reports a missing prompt, body, script or listed file, with its field", () => {
    const issues = checkPackage(agent(), [file("ronne.yaml")]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "file_missing",
        message: "prompt.md is named in agent.prompt but doesn't exist in the item.",
        path: "/agent/prompt",
      }),
    ]);
    expect(codes(agent({ files: ["prompt.md", "extra.md"] }), agentFiles())).toEqual([
      "file_missing",
    ]);
    expect(
      codes(
        {
          name: "@a/h",
          type: "hook",
          description: "x",
          hook: { event: "session.start", run: { script: "go.sh" } },
        },
        [file("ronne.yaml")],
      ),
    ).toEqual(["file_missing"]);
  });

  it("says when a named file is left out of files, and ignores a missing readme", () => {
    expect(codes(agent({ files: ["ronne.yaml"] }), agentFiles())).toEqual(["file_not_packed"]);
    expect(codes(agent({ readme: "README.md" }), agentFiles())).toEqual([]);
  });

  it("needs ronne.yaml itself", () => {
    expect(codes(agent(), [file("prompt.md")])).toEqual(["manifest_missing"]);
  });
});

describe("checkPackage: SKILL.md", () => {
  const skill: Manifest = { name: "@a/secure-coding", type: "skill", description: "x" };
  const withSkill = (content: string) => [file("ronne.yaml"), file("SKILL.md", content)];

  it("accepts matching frontmatter", () => {
    expect(
      codes(skill, withSkill("---\nname: secure-coding\ndescription: Checks.\n---\nBody")),
    ).toEqual([]);
  });

  it("needs frontmatter with a name that matches the item and a description", () => {
    expect(codes(skill, withSkill("No frontmatter"))).toEqual(["skill_frontmatter"]);
    expect(codes(skill, withSkill("---\nname: secure-coding\n---\n"))).toEqual([
      "skill_frontmatter",
    ]);
    expect(codes(skill, withSkill("---\ndescription: x\n---\n"))).toEqual(["skill_frontmatter"]);
    const [issue] = checkPackage(skill, withSkill("---\nname: other\ndescription: x\n---\n"));
    expect(issue).toMatchObject({
      code: "skill_name_mismatch",
      message:
        "SKILL.md's name is other, but it must be secure-coding, the item's name without its scope.",
      file: "SKILL.md",
    });
  });

  it("follows skill.entry", () => {
    const custom = { ...skill, skill: { entry: "docs/SKILL.md" } };
    expect(codes(custom, [file("ronne.yaml")])).toEqual(["file_missing"]);
  });
});

describe("paths", () => {
  it("refuses anything that isn't a plain relative path inside the item", () => {
    for (const [path, problem] of [
      ["", "is empty"],
      ["../etc/passwd", 'goes outside the item with ".."'],
      ["a/../../b", 'goes outside the item with ".."'],
      ["/abs.md", "starts with / (paths are relative to the item)"],
      ["a\\b.md", "uses \\ (use / between folders)"],
      ["a//b.md", "has an empty or . segment"],
      ["./a.md", "has an empty or . segment"],
      ["a\u0000.md", "contains control characters"],
      ["x".repeat(256), "is longer than 255 characters"],
    ] as const) {
      expect(pathProblem(path), JSON.stringify(path)).toBe(problem);
    }
    for (const path of ["prompt.md", "scripts/run.sh", ".ronne/layout.json", "a/b/c/d.md"])
      expect(pathProblem(path), path).toBeNull();
    expect(codes(agent(), [...agentFiles(), file("../evil")])).toEqual(["path_invalid"]);
  });

  it("refuses two files that differ only in case", () => {
    expect(codes(agent(), [...agentFiles(), file("Prompt.md")])).toEqual(["path_case_clash"]);
  });
});

describe("secrets typed into an MCP server", () => {
  it("recognises each known token format for certain", () => {
    for (const [value, kind] of [
      [`ghp_${"a1".repeat(18)}`, "a GitHub token"],
      [`github_pat_${"A1b2".repeat(10)}`, "a GitHub token"],
      [`sk-${"a1B2".repeat(8)}`, "an OpenAI or Anthropic key"],
      [`sk-ant-${"a1B2".repeat(8)}`, "an OpenAI or Anthropic key"],
      ["xoxb-1234567890-abcdefghij", "a Slack token"],
      ["AKIAIOSFODNN7EXAMPLE", "an AWS access key"],
      [`rmk_${"a".repeat(43)}`, "a Ronne access token"],
      [
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
        "a JSON Web Token",
      ],
    ] as const) {
      expect(secretLike(value), value).toEqual({ kind, certain: true });
    }
  });

  it("flags long random strings, hex included, only as likely", () => {
    for (const value of [
      "Bearer 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e",
      "token=Zq3LmP9xW2vR7tY4nB8kJ6hG1fD5sA0cQeUiOpXyTr",
    ]) {
      expect(secretLike(value), value).toEqual({ kind: "a long random secret", certain: false });
    }
  });

  it("allows variable references and ordinary values", () => {
    for (const value of [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: an environment variable reference, on purpose.
      "Bearer ${GITHUB_TOKEN}",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: an environment variable reference, on purpose.
      "${API_KEY}",
      "-y",
      "@modelcontextprotocol/server-github",
      "https://api.githubcopilot.com/mcp/",
      "--allowed-directories=/workspace/projects/frontend-application",
      "0000000000000000000000000000000000000000",
    ]) {
      expect(secretLike(value), value).toBeNull();
    }
  });

  it("reports a literal secret in args, headers or url, with its path", () => {
    const manifest: Manifest = {
      name: "@a/gh",
      type: "mcp-server",
      description: "x",
      "mcp-server": {
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: `Bearer ghp_${"a1".repeat(18)}` },
      },
    };
    expect(checkPackage(manifest, [file("ronne.yaml")])).toEqual([
      expect.objectContaining({
        code: "secret_literal",
        path: "/mcp-server/headers/Authorization",
      }),
    ]);
  });
});

describe("limits", () => {
  const limits = { ...DEFAULT_LIMITS, maxFiles: 3, maxFileBytes: 10, maxTotalBytes: 25 };

  it("counts files, file sizes and the total, but not .ronne/", () => {
    const files = [
      file("ronne.yaml", "12345"),
      file("prompt.md", "12345"),
      file("big.md", "12345678901"),
      file("more.md", "1234"),
      file(".ronne/layout.json", "x".repeat(50)),
    ];
    expect(checkPackage(agent(), files, limits).map((i) => i.code)).toEqual([
      "too_many_files",
      "file_too_large",
    ]);
    const total = [
      file("ronne.yaml", "1234567890"),
      file("prompt.md", "1234567890"),
      file("c.md", "1234567890"),
    ];
    expect(checkPackage(agent(), total, limits).map((i) => i.code)).toEqual(["package_too_large"]);
  });

  it("uses MVP §12's defaults", () => {
    expect(DEFAULT_LIMITS).toEqual({
      maxFiles: 500,
      maxFileBytes: 1024 * 1024,
      maxTotalBytes: 20 * 1024 * 1024,
      maxPackedBytes: 5 * 1024 * 1024,
    });
  });
});

describe("dependencies", () => {
  it("checks ranges, refuses dist-tags and self-dependencies", () => {
    const bundle = (dependencies: Record<string, string>): Manifest => ({
      name: "@a/kit",
      type: "bundle",
      description: "x",
      dependencies,
    });
    expect(
      codes(bundle({ "@a/x": "^1.2.0", "@a/y": "~1.1.0", "@a/z": ">=2 <3" }), [file("ronne.yaml")]),
    ).toEqual([]);
    expect(codes(bundle({ "@a/x": "latest" }), [file("ronne.yaml")])).toEqual(["range_invalid"]);
    expect(codes(bundle({ "@a/x": "^1..2" }), [file("ronne.yaml")])).toEqual(["range_invalid"]);
    expect(codes(bundle({ "@a/kit": "^1.0.0" }), [file("ronne.yaml")])).toEqual([
      "self_dependency",
    ]);
  });

  it("allows dependencies only on bundles, agents, skills and commands", () => {
    const rule: Manifest = {
      name: "@a/r",
      type: "rule",
      description: "x",
      rule: { body: "r.md", activation: "always" },
      dependencies: { "@a/x": "^1.0.0" },
    };
    expect(codes(rule, [file("ronne.yaml"), file("r.md")])).toEqual(["dependencies_not_allowed"]);
  });
});
