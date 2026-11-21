// The Node.js versions the repository names, kept in step (feature 188). `.nvmrc` is the target LTS
// and `MIN_NODE` (packages/server/src/node-version.ts) the oldest supported version. Two guards:
// - drift: every place that names the target agrees with `.nvmrc`, the CI jobs for the minimum
//   run exactly `MIN_NODE` (#315), every package's `engines` says `MIN_NODE` and `MIN_NODE_23`,
//   and no other workflow names a Node.js version for setup-node;
// - N-API: CI tests only the minimum and the target, which is safe only while every native module
//   rmk-server loads is N-API (one binary for every Node.js version).
// Dependency-free like the rest of this package, so files are read line by line, not parsed, and
// a form the reader doesn't know is reported rather than skipped. The patterns are short and
// anchored (docs/knowledge/codeql-regex.md).
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** The two workflows whose jobs are named by role (188); only they may use `${{ matrix.node }}`. */
export const ROLE_WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/server-checks.yml"];

const linesOf = (text) => text.split("\n").map((line) => line.trim());

/** A matrix's Node.js version: a major (`26`) or an exact version (`22.14.0`). */
const VERSION = String.raw`\d+(?:\.\d+\.\d+)?`;
const ENTRY = new RegExp(`^- node: (${VERSION})$`);
const AXIS = new RegExp(`^\\[${VERSION}(?:, ?${VERSION})*\\]$`);

/** The major version a version string starts with (`26`, `22.14.0`, `v24.1.0`), or undefined. */
export const majorOf = (text) => {
  const match = /^v?(\d+)/.exec(String(text).trim());
  return match ? Number(match[1]) : undefined;
};

/** `MIN_NODE`'s value in node-version.ts, such as "22.14.0". */
export const minNodeOf = (source) => /export const MIN_NODE = "(\d+\.\d+\.\d+)"/.exec(source)?.[1];

/** `MIN_NODE_23`'s value in node-version.ts, such as "23.6.0". */
export const minNode23Of = (source) =>
  /export const MIN_NODE_23 = "(\d+\.\d+\.\d+)"/.exec(source)?.[1];

/**
 * The `{ node, role }` entries of a workflow's matrix: `- node: N` (a major or an exact version, as
 * written) with `role: …` on the next line.
 */
export const roleEntries = (workflow) => {
  const lines = linesOf(workflow);
  const entries = [];
  lines.forEach((line, index) => {
    const node = ENTRY.exec(line);
    const role = /^role: (minimum|target)$/.exec(lines[index + 1] ?? "");
    if (node && role) entries.push({ node: node[1], role: role[1] });
  });
  return entries;
};

/**
 * Every line with a `node` key, in any case, with spaces before the colon or not (block or flow
 * style, quoted or not; YAML needs a space or the line's end after an unquoted key's colon, so an
 * image such as `node:26` isn't one), comments left out.
 */
export const nodeKeyLines = (workflow) =>
  linesOf(workflow).flatMap((line, index) =>
    !line.startsWith("#") &&
    /(?:^|[\s{,-])(?:["']node["'] *:|node *:(?:\s|$))/.test(line.toLowerCase())
      ? [{ line: index + 1, text: line }]
      : [],
  );

/** Every `node:` matrix axis in a workflow (a line starting with a `node:` key), with its line. */
export const nodeAxes = (workflow) =>
  linesOf(workflow).flatMap((line, index) => {
    const key = ["node:", '"node":', "'node':"].find((k) => line.startsWith(k));
    return key ? [{ line: index + 1, value: line.slice(key.length).trim() }] : [];
  });

/**
 * Every value given to a `node-version` input in a workflow, in block or flow style, quoted or not
 * (never `node-version-file`), with its line number.
 */
export const nodeVersionValues = (workflow) =>
  linesOf(workflow).flatMap((line, index) => {
    const found = [];
    const lower = line.toLowerCase(); // GitHub reads input names in any case
    for (
      let at = lower.indexOf("node-version");
      at !== -1;
      at = lower.indexOf("node-version", at + 1)
    ) {
      let i = at + "node-version".length;
      if (line[i] === '"' || line[i] === "'") i += 1;
      while (line[i] === " ") i += 1;
      if (line[i] !== ":") continue; // node-version-file, or the words in a comment
      let start = i + 1;
      while (line[start] === " ") start += 1;
      // A GitHub expression runs to its closing braces, which a flow mapping's `}` mustn't cut.
      const expression = line.startsWith("$" + "{{", start) ? line.indexOf("}}", start) : -1;
      let end = expression === -1 ? start : expression + 2;
      while (end < line.length && !",}#".includes(line[end])) end += 1;
      const value = line
        .slice(start, end)
        .trim()
        .replace(/^["']|["']$/g, "");
      found.push({ line: index + 1, value });
    }
    return found;
  });

/**
 * Every image a Dockerfile builds from or copies from (`FROM`, `--from=`, a mount's `from=`), with
 * the stage names declared before it. Continued lines (`\`) are joined; words split on any space.
 */
export const dockerImageRefs = (dockerfile) => {
  const logical = [];
  let pending = "";
  for (const line of dockerfile.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.endsWith("\\")) pending += `${trimmed.slice(0, -1)} `;
    else {
      logical.push(pending + trimmed);
      pending = "";
    }
  }
  if (pending) logical.push(pending);
  const stages = [];
  const refs = [];
  for (const line of logical) {
    const words = line.split(/\s+/).filter(Boolean);
    const instruction = words[0]?.toUpperCase();
    if (instruction === "FROM") {
      const image = words.slice(1).find((word) => !word.startsWith("--")) ?? "";
      refs.push({ ref: image, stages: [...stages] });
      const as = words.findIndex((word) => word.toUpperCase() === "AS");
      if (as !== -1 && words[as + 1]) stages.push(words[as + 1]);
    } else if (instruction)
      for (const word of words.slice(1)) {
        if (word.startsWith("--from="))
          refs.push({ ref: word.slice("--from=".length), stages: [...stages] });
        if (word.startsWith("--mount="))
          for (const part of word.slice("--mount=".length).split(","))
            if (part.startsWith("from="))
              refs.push({ ref: part.slice("from=".length), stages: [...stages] });
      }
  }
  return refs;
};

/** The tag of a `node` image reference (`node:26-slim`, `docker.io/library/node:26@sha256:…`). */
export const nodeImageTag = (ref) => {
  const image = ref.split("@")[0];
  const slash = image.lastIndexOf("/");
  const colon = image.indexOf(":", slash + 1);
  const name = image.slice(slash + 1, colon === -1 ? undefined : colon);
  return name === "node" && colon !== -1 ? image.slice(colon + 1) : undefined;
};

const isMatrixNode = (value) => /^\$\{\{ ?matrix\.node ?\}\}$/.test(value);

/**
 * What doesn't agree with `.nvmrc` and `MIN_NODE`.
 * @param {{ nvmrc: string, minNode: string, dockerfile: string, bundle: string, feedWorkflow: string,
 *   workflows: Record<string, string>, packageJsons: Record<string, string> }} files the workflows
 *   and package.json files by their path from the root
 * @returns {string[]} one message per mismatch, naming the file
 */
export const driftProblems = (files) => {
  const problems = [];
  const target = majorOf(files.nvmrc);
  const min = minNodeOf(files.minNode);
  if (target === undefined)
    return [`.nvmrc holds no Node.js version: ${JSON.stringify(files.nvmrc)}`];
  if (min === undefined) return ["packages/server/src/node-version.ts has no MIN_NODE"];
  const min23 = minNode23Of(files.minNode);
  if (min23 === undefined) return ["packages/server/src/node-version.ts has no MIN_NODE_23"];

  // npm warns where rmk-server refuses: every package asks for the same versions (#315). The root
  // and every published package (not private) must say it; a private one may leave it out.
  const engines = `^${min} || >=${min23}`;
  for (const [path, text] of Object.entries(files.packageJsons)) {
    const pkg = JSON.parse(text);
    const node = pkg.engines?.node;
    if (node === undefined && (path === "package.json" || pkg.private !== true))
      problems.push(`${path} has no engines.node; it must say ${engines}`);
    else if (node !== undefined && node !== engines)
      problems.push(
        `${path}'s engines.node is ${node}, but MIN_NODE and MIN_NODE_23 say ${engines}`,
      );
  }

  const refs = dockerImageRefs(files.dockerfile);
  const tags = refs.map((r) => nodeImageTag(r.ref)).filter((tag) => tag !== undefined);
  if (tags.length === 0) problems.push("Dockerfile has no FROM node:… base image");
  for (const { ref, stages } of refs) {
    const tag = nodeImageTag(ref);
    if (tag !== undefined) {
      if (majorOf(tag) !== target)
        problems.push(`Dockerfile's image ${ref} isn't Node.js ${target}, .nvmrc's`);
    } else if (!stages.includes(ref) && !/^\d+$/.test(ref) && ref !== "scratch")
      problems.push(
        `Dockerfile uses ${ref || "an empty image"}, which the guard can't tie to a Node.js version or an earlier stage`,
      );
  }

  const bundle = /^export const NODE_MAJOR = (\d+);$/m.exec(files.bundle)?.[1];
  if (Number(bundle) !== target)
    problems.push(
      `packages/repo-tools/src/bundle.js NODE_MAJOR is ${bundle ?? "(none)"}, but .nvmrc says ${target}`,
    );

  const feed = [
    ...[...files.feedWorkflow.matchAll(/node-version: (\d+)/g)].map((m) => m[1]),
    ...[...files.feedWorkflow.matchAll(/image: node:(\d+)/g)].map((m) => m[1]),
  ];
  if (feed.length < 2 || feed.some((v) => Number(v) !== target))
    problems.push(
      `packages/cli/src/feed-workflow.ts names Node.js ${feed.join(", ") || "(none)"}, but .nvmrc says ${target}`,
    );

  for (const path of ROLE_WORKFLOWS) {
    const workflow = files.workflows[path] ?? "";
    const entries = roleEntries(workflow);
    for (const role of ["minimum", "target"])
      if (!entries.some((e) => e.role === role))
        problems.push(`${path} has no "- node: N" entry with role: ${role} on the next line`);
    for (const { node, role } of entries) {
      // The target is a major, so CI gets its newest release; the minimum is exactly MIN_NODE, as
      // the newest release of its line would hide a version rmk-server can't run on (#315).
      if (role === "target" && node !== String(target))
        problems.push(`${path}'s target entry is Node.js ${node}, but .nvmrc says ${target}`);
      if (role === "minimum" && node !== min)
        problems.push(`${path}'s minimum entry is Node.js ${node}, but MIN_NODE is ${min}`);
    }
    // Every `node:` key must be one the guard reads: a `- node: N` entry with its role on the next
    // line, or the `node: [N, M]` axis. Anything else could add a job the guard doesn't see.
    const lines = linesOf(workflow);
    for (const { line, text } of nodeKeyLines(workflow)) {
      const entry = ENTRY.test(text) && /^role: (minimum|target)$/.test(lines[line] ?? "");
      if (!entry && !/^node: \[/.test(text))
        problems.push(
          `${path}:${line} has a node key the guard can't read (${text}); use "- node: N" with role: on the next line`,
        );
    }
    // A matrix built from an expression has values the guard never sees: inline, on the next line
    // (a line that is only an expression), or through fromJSON anywhere.
    lines.forEach((text, index) => {
      const lower = text.toLowerCase();
      if (
        /matrix *: *\$\{\{/.test(lower) ||
        lower.includes("fromjson(") ||
        text.startsWith("$" + "{{")
      )
        problems.push(
          `${path}:${index + 1} builds a value from an expression the guard can't read (${text})`,
        );
    });
    // A version axis next to `include` must list exactly the include's versions, or an include
    // entry matches no combination and becomes a job of its own. Any other form is reported.
    const included = entries.map((e) => e.node).sort();
    for (const { line, value } of nodeAxes(workflow)) {
      if (!AXIS.test(value)) {
        problems.push(
          `${path}:${line} has a node axis the guard can't read (${value || "a block list"}); write it as [N, M]`,
        );
        continue;
      }
      const listed = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim())
        .sort();
      if (listed.join() !== included.join())
        problems.push(
          `${path}:${line}'s node axis [${listed.join(", ")}] isn't its include's [${included.join(", ")}]`,
        );
    }
  }

  for (const [path, workflow] of Object.entries(files.workflows)) {
    const roleWorkflow = ROLE_WORKFLOWS.includes(path);
    linesOf(workflow).forEach((text, index) => {
      if (/^\?(?:\s|$)/.test(text))
        problems.push(
          `${path}:${index + 1} has an explicit YAML key (?), which the guard can't read`,
        );
    });
    if (!roleWorkflow)
      for (const { line } of nodeKeyLines(workflow))
        problems.push(
          `${path}:${line} has a node matrix axis; only ${ROLE_WORKFLOWS.join(" and ")} test by version`,
        );
    for (const { line, value } of nodeVersionValues(workflow))
      if (!(roleWorkflow && isMatrixNode(value)))
        problems.push(
          `${path}:${line} sets node-version: ${value}; use node-version-file: .nvmrc${roleWorkflow ? " or the role matrix" : ""}`,
        );
  }

  return problems;
};

/** Reads the files driftProblems needs from the repository at `root`. */
export const readDriftFiles = (root) => {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const workflows = {};
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
        workflows[path] = read(path);
    }
  };
  walk(".github/workflows");
  if (existsSync(join(root, ".github/actions"))) walk(".github/actions");
  const packageJsons = { "package.json": read("package.json") };
  for (const group of ["apps", "packages"])
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      const path = `${group}/${entry.name}/package.json`;
      if (entry.isDirectory() && existsSync(join(root, path))) packageJsons[path] = read(path);
    }
  return {
    nvmrc: read(".nvmrc"),
    minNode: read("packages/server/src/node-version.ts"),
    dockerfile: read("Dockerfile"),
    bundle: read("packages/repo-tools/src/bundle.js"),
    feedWorkflow: read("packages/cli/src/feed-workflow.ts"),
    workflows,
    packageJsons,
  };
};

/** The installed folder of `name` as seen from the package folder `from` (pnpm or flat layouts). */
const findPackage = (from, name) => {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) return undefined;
  }
};

/** Every `.node` file under a package's folder, not descending into its node_modules. */
const nodeFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : nodeFiles(path);
    return entry.name.endsWith(".node") ? [path] : [];
  });

// The symbol names in a binary, searched as bytes (the same in Mach-O, ELF and PE). An N-API module
// registers through napi_register_module_v1 (exported) or napi_module_register (called from a
// static constructor, as older N-API modules do); a module built for one Node.js version registers
// through node_register_module_v<ABI> instead.
const NAPI_NAMES = ["napi_register_module_v1", "napi_module_register"].map((name) =>
  Buffer.from(name),
);
const PER_ABI_NAME = Buffer.from("node_register_module_v");

/** Why a binary isn't N-API, or undefined when it is. */
export const notNapi = (bytes) => {
  if (bytes.includes(PER_ABI_NAME))
    return "it registers per Node.js version (node_register_module_v…)";
  if (!NAPI_NAMES.some((name) => bytes.includes(name)))
    return "it has neither napi_register_module_v1 nor napi_module_register";
  return undefined;
};

/**
 * The native binaries in a package's runtime dependency tree (dependencies, and optional and peer
 * dependencies when installed; never devDependencies), and those that aren't N-API.
 * @param {string} packageDir the folder of the package whose runtime tree is walked
 * @returns {{ natives: { name: string, file: string }[], problems: string[] }}
 */
export const nativeModules = (packageDir) => {
  const natives = [];
  const problems = [];
  const seen = new Set();
  const visit = (dir, name) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (name)
      for (const file of nodeFiles(dir)) {
        natives.push({ name, file });
        const why = notNapi(readFileSync(file));
        if (why)
          problems.push(
            `${name}: ${relative(dir, file)} isn't N-API: ${why}. CI tests only the minimum and target Node.js, and a binary built per Node.js version needs the versions between too (188)`,
          );
      }
    const required = manifest.dependencies ?? {};
    const others = { ...manifest.optionalDependencies, ...manifest.peerDependencies };
    for (const dep of Object.keys({ ...others, ...required })) {
      const found = findPackage(dir, dep);
      if (found) visit(found, dep);
      else if (dep in required && !(dep in (manifest.optionalDependencies ?? {})))
        problems.push(`${name ?? manifest.name} needs ${dep}, which isn't installed`);
    }
  };
  visit(realpathSync(packageDir));
  return { natives, problems };
};
