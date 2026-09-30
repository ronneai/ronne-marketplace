import { validRange } from "semver";
import { parseFrontmatter } from "./frontmatter.js";
import type { ManifestIssue } from "./issues.js";
import { type ItemType, isItemType, mayHaveDependencies } from "./item-types.js";
import { DEFAULT_LIMITS, formatBytes, type PackageLimits } from "./limits.js";
import type { Manifest } from "./manifest.js";
import { parseItemName } from "./names.js";
import type { PackageFile } from "./package-file.js";

const PATH_MAX_LENGTH = 255;

const error = (
  code: string,
  message: string,
  extra: Partial<ManifestIssue> = {},
): ManifestIssue => ({
  severity: "error",
  code,
  message,
  ...extra,
});

/** Why a path isn't allowed in a package, or null. Relative, with /, inside the item. */
export const pathProblem = (path: string): string | null => {
  if (path.length === 0) return "is empty";
  if (path.length > PATH_MAX_LENGTH) return `is longer than ${PATH_MAX_LENGTH} characters`;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
  if (/[\u0000-\u001f\u007f]/.test(path)) return "contains control characters";
  if (path.includes("\\")) return "uses \\ (use / between folders)";
  if (path.startsWith("/")) return "starts with / (paths are relative to the item)";
  const parts = path.split("/");
  if (parts.includes("..")) return 'goes outside the item with ".."';
  if (parts.some((part) => part === "" || part === ".")) return "has an empty or . segment";
  return null;
};

/** The files a manifest refers to, with the field that names each one. */
const referencedFiles = (
  manifest: Manifest,
): { field: string; path: string; required: boolean }[] => {
  const type = String(manifest.type ?? "");
  const block = (manifest[type] ?? {}) as Record<string, unknown>;
  const refs: { field: string; path: string; required: boolean }[] = [];
  const add = (field: string, value: unknown, required = true) => {
    if (typeof value === "string") refs.push({ field, path: value, required });
  };
  if (type === "skill") add("skill.entry", block.entry ?? "SKILL.md");
  if (type === "agent") add("agent.prompt", block.prompt);
  if (type === "rule" || type === "command" || type === "output-style")
    add(`${type}.body`, block.body);
  if (type === "hook")
    add("hook.run.script", (block.run as Record<string, unknown> | undefined)?.script);
  if (type === "statusline") add("statusline.script", block.script);
  add("readme", manifest.readme);
  if (Array.isArray(manifest.files))
    for (const [i, path] of manifest.files.entries()) add(`files[${i}]`, path);
  return refs;
};

/** Known token formats, as they'd appear if someone pasted a real secret. */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "a GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/ },
  { name: "a GitHub token", pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { name: "an OpenAI or Anthropic key", pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "a Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "an AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "a Ronne AI Marketplace access token", pattern: /\brmk_[A-Za-z0-9_-]{43}\b/ },
  {
    name: "a JSON Web Token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
];

/** Shannon entropy in bits per character. Random tokens score well above ordinary words and paths. */
const entropy = (value: string) => {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
};

/**
 * What kind of secret a literal looks like, or null. `${NAME}` references are fine. A known token
 * format is `certain`; a long random-looking string is only `likely` (a git commit hash looks the
 * same), so it's a warning rather than an error.
 */
export const secretLike = (value: string): { kind: string; certain: boolean } | null => {
  const literal = value.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, "");
  for (const { name, pattern } of SECRET_PATTERNS)
    if (pattern.test(literal)) return { kind: name, certain: true };
  for (const token of literal.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? []) {
    const hex = /^[0-9a-fA-F]+$/.test(token);
    const mixed = /[0-9]/.test(token) && /[A-Za-z]/.test(token);
    // Hex has 16 symbols, so random hex scores at most 4 bits a character; other tokens more.
    if (mixed && entropy(token) > (hex ? 3.3 : 4.2))
      return { kind: "a long random secret", certain: false };
  }
  return null;
};

const decoder = new TextDecoder("utf-8", { fatal: true });
const text = (file: PackageFile | undefined): string | null => {
  if (!file) return null;
  try {
    return decoder.decode(file.bytes);
  } catch {
    return null;
  }
};

/**
 * The package checks (manifest spec §6, layer 2): the files the manifest names exist, SKILL.md
 * matches, every path is safe, no secret is pasted into an MCP server, the limits hold, and
 * dependency ranges are valid. Registry checks are 013's.
 */
export const checkPackage = (
  manifest: Manifest,
  files: readonly PackageFile[],
  limits: PackageLimits = DEFAULT_LIMITS,
): ManifestIssue[] => {
  const issues: ManifestIssue[] = [];
  const byPath = new Map(files.map((file) => [file.path, file]));

  // Paths.
  const seen = new Map<string, string>();
  for (const file of files) {
    const problem = pathProblem(file.path);
    if (problem)
      issues.push(error("path_invalid", `The path ${file.path} ${problem}.`, { file: file.path }));
    const folded = file.path.toLowerCase();
    const other = seen.get(folded);
    if (other && other !== file.path)
      issues.push(
        error(
          "path_case_clash",
          `${file.path} and ${other} differ only in case, which some systems can't tell apart.`,
          {
            file: file.path,
          },
        ),
      );
    seen.set(folded, file.path);
  }
  if (!byPath.has("ronne.yaml"))
    issues.push(error("manifest_missing", "The item has no ronne.yaml."));

  // Limits.
  const packed = files.filter((file) => !file.path.startsWith(".ronne/"));
  if (packed.length > limits.maxFiles)
    issues.push(
      error(
        "too_many_files",
        `The item has ${packed.length} files; the limit is ${limits.maxFiles}.`,
      ),
    );
  let total = 0;
  for (const file of packed) {
    total += file.bytes.length;
    if (file.bytes.length > limits.maxFileBytes)
      issues.push(
        error(
          "file_too_large",
          `${file.path} is ${formatBytes(file.bytes.length)}; each file can be at most ${formatBytes(limits.maxFileBytes)}.`,
          {
            file: file.path,
          },
        ),
      );
  }
  if (total > limits.maxTotalBytes)
    issues.push(
      error(
        "package_too_large",
        `The files add up to ${formatBytes(total)}; the limit is ${formatBytes(limits.maxTotalBytes)}.`,
      ),
    );

  // Files the manifest names.
  const listed = Array.isArray(manifest.files) ? new Set(manifest.files as unknown[]) : null;
  for (const ref of referencedFiles(manifest)) {
    if (pathProblem(ref.path)) continue; // The schema already reported it.
    if (!byPath.has(ref.path)) {
      if (ref.field === "readme") continue; // An absent readme is only a missing nicety.
      issues.push(
        error(
          "file_missing",
          `${ref.path} is named in ${ref.field} but doesn't exist in the item.`,
          {
            path: `/${ref.field.replace(/\[(\d+)\]/g, "/$1").replace(/\./g, "/")}`,
          },
        ),
      );
    } else if (listed && !ref.field.startsWith("files[") && !listed.has(ref.path)) {
      issues.push(
        error(
          "file_not_packed",
          `${ref.path} is named in ${ref.field} but isn't in files, so it wouldn't be packed.`,
          {
            path: "/files",
          },
        ),
      );
    }
  }

  // SKILL.md.
  const item = parseItemName(String(manifest.name ?? ""));
  if (manifest.type === "skill") {
    const entry = String(((manifest.skill ?? {}) as Record<string, unknown>).entry ?? "SKILL.md");
    const content = text(byPath.get(entry));
    if (byPath.has(entry)) {
      const meta = content === null ? null : parseFrontmatter(content).data;
      if (!meta)
        issues.push(
          error("skill_frontmatter", `${entry} needs YAML frontmatter with name and description.`, {
            file: entry,
          }),
        );
      else {
        if (typeof meta.description !== "string" || meta.description.trim() === "")
          issues.push(
            error("skill_frontmatter", `${entry}'s frontmatter needs a description.`, {
              file: entry,
            }),
          );
        if (typeof meta.name !== "string")
          issues.push(
            error("skill_frontmatter", `${entry}'s frontmatter needs a name.`, { file: entry }),
          );
        else if (item && meta.name !== item.name)
          issues.push(
            error(
              "skill_name_mismatch",
              `${entry}'s name is ${meta.name}, but it must be ${item.name}, the item's name without its scope.`,
              {
                file: entry,
              },
            ),
          );
      }
    }
  }

  // Secrets typed into an MCP server.
  if (manifest.type === "mcp-server") {
    const block = (manifest["mcp-server"] ?? {}) as Record<string, unknown>;
    const values: { where: string; value: unknown }[] = [
      ...(Array.isArray(block.args)
        ? block.args.map((value, i) => ({ where: `/mcp-server/args/${i}`, value }))
        : []),
      ...Object.entries((block.headers ?? {}) as Record<string, unknown>).map(([key, value]) => ({
        where: `/mcp-server/headers/${key}`,
        value,
      })),
      { where: "/mcp-server/url", value: block.url },
    ];
    for (const { where, value } of values) {
      if (typeof value !== "string") continue;
      const secret = secretLike(value);
      if (secret)
        issues.push({
          severity: secret.certain ? "error" : "warning",
          code: "secret_literal",
          message: secret.certain
            ? `This looks like ${secret.kind}. Never put a secret in an item: reference an environment variable, such as \${GITHUB_TOKEN}, and list it under env.`
            : `This looks like it could be a secret (${secret.kind}). If it is, reference an environment variable, such as \${API_KEY}, instead.`,
          path: where,
        });
    }
  }

  // Dependencies.
  const dependencies = (manifest.dependencies ?? {}) as Record<string, unknown>;
  const names = Object.keys(dependencies);
  // Which types they may depend on needs the registry (013).
  if (
    names.length > 0 &&
    isItemType(String(manifest.type)) &&
    !mayHaveDependencies(manifest.type as ItemType)
  )
    issues.push(
      error(
        "dependencies_not_allowed",
        `A ${String(manifest.type)} can't have dependencies. Only bundles, agents, skills and commands can.`,
        { path: "/dependencies" },
      ),
    );
  for (const name of names) {
    const range = dependencies[name];
    if (typeof range !== "string" || validRange(range) === null)
      issues.push(
        error(
          "range_invalid",
          `The version range for ${name} isn't valid. Use a semver range such as ^1.2.0 (dist-tags like latest aren't allowed).`,
          {
            path: `/dependencies/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`,
          },
        ),
      );
    else if (item && name === `@${item.scope}/${item.name}`)
      issues.push(
        error("self_dependency", "An item can't depend on itself.", { path: "/dependencies" }),
      );
  }

  return issues;
};
