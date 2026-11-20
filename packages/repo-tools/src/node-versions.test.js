import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  dockerImageRefs,
  driftProblems,
  majorOf,
  minNodeOf,
  nativeModules,
  nodeAxes,
  nodeImageTag,
  nodeVersionValues,
  notNapi,
  readDriftFiles,
  roleEntries,
} from "./node-versions.js";

const root = new URL("../../../", import.meta.url).pathname;
const CI = ".github/workflows/ci.yml";
const SERVER = ".github/workflows/server-checks.yml";
const BUNDLES = ".github/workflows/bundles.yml";

/** The real files with one of them changed by `change`. */
const withChange = (change) => {
  const files = readDriftFiles(root);
  change(files);
  return driftProblems(files);
};

describe("the readers", () => {
  it("read majors, MIN_NODE and the role entries", () => {
    expect(majorOf("26\n")).toBe(26);
    expect(majorOf("v24.1.0")).toBe(24);
    expect(majorOf("lts/*")).toBeUndefined();
    expect(minNodeOf('export const MIN_NODE = "22.12.0";')).toBe("22.12.0");
    expect(
      roleEntries(
        "  include:\r\n    - node: 22\r\n      role: minimum\n    - node: 26\n      role: target\n",
      ),
    ).toEqual([
      { node: 22, role: "minimum" },
      { node: 26, role: "target" },
    ]);
  });

  it("read node-version in block and flow style, quoted or not, but not node-version-file", () => {
    const workflow = [
      "      node-version: 24",
      "      with: { node-version: 22, cache: pnpm }",
      '      "node-version": "26"',
      `      with: { node-version: \${{ matrix.node }}, cache: pnpm }`,
      "      node-version-file: .nvmrc",
      "      # the node-version input below",
    ].join("\n");
    expect(nodeVersionValues(workflow)).toEqual([
      { line: 1, value: "24" },
      { line: 2, value: "22" },
      { line: 3, value: "26" },
      { line: 4, value: `\${{ matrix.node }}` },
    ]);
  });

  it("read node axes, image references and node image tags", () => {
    expect(nodeAxes("matrix:\n  node: [22, 26]\n  include:\n    - node: 22\n")).toEqual([
      { line: 2, value: "[22, 26]" },
    ]);
    const refs = dockerImageRefs(
      "FROM --platform=$BUILDPLATFORM node:26-slim AS a\nFROM\ta AS b\nCOPY --from=a --chown=node:node x y\nFROM \\\n  node:24\n",
    );
    expect(refs).toEqual([
      { ref: "node:26-slim", stages: [] },
      { ref: "a", stages: ["a"] },
      { ref: "a", stages: ["a", "b"] },
      { ref: "node:24", stages: ["a", "b"] },
    ]);
    expect(nodeImageTag("docker.io/library/node:24-trixie-slim@sha256:ab")).toBe("24-trixie-slim");
    expect(nodeImageTag("node")).toBeUndefined();
    expect(nodeImageTag("caddy:2")).toBeUndefined();
  });
});

describe("driftProblems", () => {
  it("passes on the repository", () => {
    expect(driftProblems(readDriftFiles(root))).toEqual([]);
  });

  it("fails when any FROM node: isn't .nvmrc's major", () => {
    const first = withChange((f) => {
      f.dockerfile = f.dockerfile.replace(/^FROM node:\d+-/m, "FROM node:24-");
    });
    expect(first).toEqual([expect.stringMatching(/^Dockerfile's image node:24-/)]);
    for (const added of [
      "FROM node:24-trixie-slim AS runtime",
      "FROM\tnode:24-trixie-slim AS runtime",
      "FROM docker.io/library/node:24-trixie-slim AS runtime",
      "FROM \\\n  node:24-trixie-slim AS runtime",
      "COPY --from=node:24-trixie-slim /usr/local/bin/node /x",
      "RUN --mount=type=bind,from=node:24-trixie-slim,target=/x true",
    ]) {
      const problems = withChange((f) => {
        f.dockerfile += `\n${added}\n`;
      });
      expect(problems).toEqual([
        expect.stringMatching(/^Dockerfile's image (docker\.io\/library\/)?node:24-trixie-slim/),
      ]);
    }
  });

  it("fails on a Dockerfile image it can't tie to a Node.js version or a stage", () => {
    const problems = withChange((f) => {
      f.dockerfile += `\nARG IMG=node:24-trixie-slim\nFROM \${IMG} AS other\n`;
    });
    expect(problems).toEqual([
      expect.stringMatching(/^Dockerfile uses \$\{IMG\}, which the guard can't tie/),
    ]);
  });

  it("fails when NODE_MAJOR isn't .nvmrc's major", () => {
    const problems = withChange((f) => {
      f.bundle = f.bundle.replace(/NODE_MAJOR = \d+;/, "NODE_MAJOR = 24;");
    });
    expect(problems).toEqual([
      expect.stringMatching(/^packages\/repo-tools\/src\/bundle\.js NODE_MAJOR is 24/),
    ]);
  });

  it("fails when the feed workflow names another major", () => {
    for (const [from, to] of [
      [/node-version: \d+/, "node-version: 24"],
      [/image: node:\d+/, "image: node:24"],
    ]) {
      const problems = withChange((f) => {
        f.feedWorkflow = f.feedWorkflow.replace(from, to);
      });
      expect(problems).toEqual([
        expect.stringMatching(/^packages\/cli\/src\/feed-workflow\.ts names Node\.js/),
      ]);
    }
  });

  it("fails when a target entry isn't .nvmrc's major", () => {
    for (const path of [CI, SERVER]) {
      const problems = withChange((f) => {
        f.workflows[path] = f.workflows[path].replace(
          /- node: (\d+)(\s*\n\s*role: target)/,
          "- node: 24$2",
        );
      });
      expect(problems).toContainEqual(
        expect.stringMatching(new RegExp(`^${path}'s target entry is Node.js 24`)),
      );
    }
  });

  it("fails when a minimum entry isn't MIN_NODE's major", () => {
    const problems = withChange((f) => {
      f.workflows[CI] = f.workflows[CI].replace(
        /- node: (\d+)(\s*\n\s*role: minimum)/,
        "- node: 20$2",
      );
    });
    expect(problems).toEqual([
      expect.stringMatching(new RegExp(`^${CI}'s minimum entry is Node.js 20`)),
    ]);
  });

  it("fails when a role entry is missing or in a form it can't read", () => {
    const renamed = withChange((f) => {
      f.workflows[CI] = f.workflows[CI].replace("role: minimum", "role: oldest");
    });
    expect(renamed).toContainEqual(
      expect.stringMatching(/ci\.yml has no "- node: N" entry with role: minimum/),
    );
    const quoted = withChange((f) => {
      f.workflows[CI] = f.workflows[CI].replace(
        /- node: (\d+)(\s*\n\s*role: target)/,
        '- node: "$1"$2',
      );
    });
    expect(quoted).toContainEqual(
      expect.stringMatching(/ci\.yml has no "- node: N" entry with role: target/),
    );
  });

  it("fails when server-checks' node axis and include disagree, or the axis can't be read", () => {
    const extra = withChange((f) => {
      f.workflows[SERVER] = f.workflows[SERVER].replace(/node: \[[\d,\s]+\]/, "node: [22, 24, 26]");
    });
    expect(extra).toEqual([expect.stringMatching(/node axis \[22, 24, 26\] isn't its include's/)]);
    for (const axis of ["node:\n          - 22\n          - 24", 'node: ["22", "24"]']) {
      const problems = withChange((f) => {
        f.workflows[SERVER] = f.workflows[SERVER].replace(/node: \[[\d,\s]+\]/, axis);
      });
      expect(problems).toContainEqual(
        expect.stringMatching(/server-checks\.yml:\d+ has a node axis the guard can't read/),
      );
    }
  });

  it("fails when another workflow names a version in setup-node, in any form", () => {
    for (const to of ["node-version: 26", "with: { node-version: 26 }", '"node-version": 26']) {
      const problems = withChange((f) => {
        f.workflows[BUNDLES] = f.workflows[BUNDLES].replace("node-version-file: .nvmrc", to);
      });
      expect(problems).toEqual([
        expect.stringMatching(/^\.github\/workflows\/bundles\.yml:\d+ sets node-version: 26/),
      ]);
    }
  });

  it("fails on a node key in a role workflow it doesn't read as an entry or the axis", () => {
    const job = (matrix) =>
      `\n  other:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix: ${matrix}\n`;
    const cases = [
      (w) => w + job("{ node: [24] }"),
      (w) => w.replace(/(\n(\s*)- node: 26\n)/, "\n$2- node: 24$1"),
      (w) => w.replace(/- node: 26\n(\s*)role: target/, "- node: 26\n$1name: x\n$1role: target"),
      (w) => w + job('{"node":[24]}'),
      (w) => w + job("\n        node : [24]"),
      (w) => w + job("\n        Node: [24]"),
      (w) =>
        w.replace(
          /- node: 26\n(\s*)role: target/,
          "- { node: 24, role: target }\n$1- node: 26\n$1role: target",
        ),
    ];
    for (const change of cases) {
      const problems = withChange((f) => {
        f.workflows[CI] = change(f.workflows[CI]);
      });
      expect(problems).toContainEqual(
        expect.stringMatching(/ci\.yml:\d+ has a node key the guard can't read/),
      );
    }
  });

  it("fails on a role workflow matrix built from an expression", () => {
    for (const matrix of [
      `\${{ fromJSON('{"node":[24]}') }}`,
      `\${{ fromJSON(needs.plan.outputs.m) }}`,
      `\${{ github.event.client_payload }}`,
      `\n        \${{ github.event.inputs }}`,
    ]) {
      const problems = withChange((f) => {
        f.workflows[CI] += `\n  other:\n    strategy:\n      matrix: ${matrix}\n`;
      });
      expect(problems).toContainEqual(
        expect.stringMatching(/ci\.yml:\d+ builds a value from an expression the guard can't read/),
      );
    }
  });

  it("fails on fromJSON anywhere in a role workflow", () => {
    const problems = withChange((f) => {
      f.workflows[CI] += `\n  other:\n    strategy: \${{ fromJSON(needs.x.outputs.s) }}\n`;
    });
    expect(problems).toEqual([
      expect.stringMatching(/ci\.yml:\d+ builds a value from an expression the guard can't read/),
    ]);
  });

  it("fails on an explicit YAML key or a node-version in another case", () => {
    for (const key of ["? node-version", "?\n  node-version", "?\tnode-version"]) {
      const explicit = withChange((f) => {
        f.workflows[BUNDLES] += `\n${key}\n: 24\n`;
      });
      expect(explicit).toContainEqual(
        expect.stringMatching(/bundles\.yml:\d+ has an explicit YAML key/),
      );
    }
    const cased = withChange((f) => {
      f.workflows[BUNDLES] = f.workflows[BUNDLES].replace(
        "node-version-file: .nvmrc",
        "Node-Version: 24",
      );
    });
    expect(cased).toEqual([expect.stringMatching(/bundles\.yml:\d+ sets node-version: 24/)]);
  });

  it("fails when another workflow has a node matrix of its own", () => {
    const problems = withChange((f) => {
      f.workflows[BUNDLES] = f.workflows[BUNDLES]
        .replace("    strategy:\n", "    strategy:\n      matrix:\n        node: [24]\n")
        .replace("node-version-file: .nvmrc", `node-version: \${{ matrix.node }}`);
    });
    expect(problems).toContainEqual(
      expect.stringMatching(/bundles\.yml:\d+ has a node matrix axis/),
    );
    expect(problems).toContainEqual(
      expect.stringMatching(/bundles\.yml:\d+ sets node-version: \$\{\{ matrix\.node \}\}/),
    );
  });

  it("fails when .nvmrc moves and nothing else does", () => {
    const problems = withChange((f) => {
      f.nvmrc = "28\n";
    });
    expect(problems.length).toBeGreaterThanOrEqual(5);
    expect(problems.join("\n")).toMatch(/Dockerfile/);
    expect(problems.join("\n")).toMatch(/NODE_MAJOR/);
  });
});

describe("notNapi", () => {
  it("accepts both ways an N-API module registers", () => {
    expect(notNapi(Buffer.from("\0_napi_register_module_v1\0"))).toBeUndefined();
    expect(notNapi(Buffer.from("\0_napi_module_register\0_napi_create_object\0"))).toBeUndefined();
  });

  it("rejects a module built per Node.js version, even next to N-API names", () => {
    expect(notNapi(Buffer.from("\0node_register_module_v147\0"))).toMatch(/per Node\.js version/);
    expect(notNapi(Buffer.from("\0napi_module_register\0node_register_module_v137\0"))).toMatch(
      /per Node\.js version/,
    );
    expect(notNapi(Buffer.from("\0_ZN2v87Isolate\0"))).toMatch(/neither/);
  });
});

describe("nativeModules", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  /** A package `app` depending on `dep`, whose one binary holds `bytes`. */
  const fixture = (bytes) => {
    dir = mkdtempSync(join(tmpdir(), "node-versions-"));
    const app = join(dir, "app");
    const dep = join(app, "node_modules", "dep");
    mkdirSync(join(dep, "prebuilds"), { recursive: true });
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify({ name: "app", dependencies: { dep: "1" } }),
    );
    writeFileSync(
      join(dep, "package.json"),
      JSON.stringify({
        name: "dep",
        optionalDependencies: { absent: "1" },
        devDependencies: { tool: "1" },
      }),
    );
    writeFileSync(join(dep, "prebuilds", "linux-x64.node"), Buffer.from(bytes));
    return app;
  };

  it("finds the server's native modules, all N-API", () => {
    const { natives, problems } = nativeModules(join(root, "packages/server"));
    expect(problems).toEqual([]);
    const names = new Set(natives.map((n) => n.name));
    expect(names).toContain("better-sqlite3");
    expect([...names].some((n) => n.startsWith("@node-rs/argon2"))).toBe(true);
  });

  it("passes an N-API binary, and skips a missing optional and a dev dependency", () => {
    const { natives, problems } = nativeModules(fixture("\0\0_napi_register_module_v1\0"));
    expect(natives).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("fails a binary that isn't N-API, naming the package and file", () => {
    const { problems } = nativeModules(fixture("\0\0node_register_module_v147\0"));
    expect(problems).toEqual([
      expect.stringMatching(/^dep: prebuilds\/linux-x64\.node isn't N-API/),
    ]);
  });

  it("walks an installed peer dependency, and never an installed dev dependency", () => {
    const app = fixture("\0_napi_register_module_v1\0");
    const dep = join(app, "node_modules", "dep");
    for (const name of ["peer", "tool"]) {
      mkdirSync(join(dep, "node_modules", name), { recursive: true });
      writeFileSync(join(dep, "node_modules", name, "package.json"), JSON.stringify({ name }));
      writeFileSync(
        join(dep, "node_modules", name, "x.node"),
        Buffer.from("\0node_register_module_v147\0"),
      );
    }
    writeFileSync(
      join(dep, "package.json"),
      JSON.stringify({
        name: "dep",
        peerDependencies: { peer: "1" },
        devDependencies: { tool: "1" },
      }),
    );
    expect(nativeModules(app).problems).toEqual([
      expect.stringMatching(/^peer: x\.node isn't N-API/),
    ]);
  });

  it("reports a required dependency that isn't installed", () => {
    const app = fixture("\0_napi_register_module_v1\0");
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify({ name: "app", dependencies: { dep: "1", gone: "1" } }),
    );
    expect(nativeModules(app).problems).toEqual(["app needs gone, which isn't installed"]);
  });
});
