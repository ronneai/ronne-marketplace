import { describe, expect, it } from "vitest";
import { dependencyNodeId, ITEM_NODE_ID, toGraph } from "@/components/dependency-canvas/graph";
import {
  LAYOUT_PATH,
  moveNodes,
  placeNodes,
  readLayout,
  writeLayout,
} from "@/components/dependency-canvas/layout";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { readManifest, writeField } from "../manifest-yaml";
import {
  addDependency,
  readDependencies,
  removeDependency,
  setDependencyRange,
  startingRange,
} from "./model";

const template = (type: "agent" | "bundle") =>
  draftTemplate(type, "@platform/reviewer").find((file) => file.path === "ronne.yaml")?.content ??
  "";

const AGENT = `name: "@platform/reviewer"
type: agent
description: Reviews diffs.
agent:
  prompt: prompt.md
dependencies:
  # The rules it follows.
  "@platform/secure-coding": ^1.0.0 # pinned to 1.x
  "@tools/github": ~2.1.0
`;

describe("dependencies in ronne.yaml", () => {
  it("reads them in name order, and nothing while the YAML doesn't parse", () => {
    expect(readDependencies(AGENT)).toEqual({
      "@platform/secure-coding": "^1.0.0",
      "@tools/github": "~2.1.0",
    });
    expect(
      Object.keys(readDependencies('dependencies:\n  "@b/b": ^1.0.0\n  "@a/a": ^1.0.0\n') ?? {}),
    ).toEqual(["@a/a", "@b/b"]);
    expect(readDependencies("name: x\n")).toEqual({});
    expect(readDependencies("name: x\ndependencies: [a]\n")).toEqual({});
    expect(readDependencies('dependencies:\n  "@a/a": 1\n')).toEqual({ "@a/a": "" });
    expect(readDependencies("name: [")).toBeNull();
  });

  it("adds one in name order, as the only changed line", () => {
    expect(addDependency(AGENT, "@platform/tests", "^3.0.0")).toBe(
      AGENT.replace(
        '  "@tools/github": ~2.1.0\n',
        '  "@platform/tests": ^3.0.0\n  "@tools/github": ~2.1.0\n',
      ),
    );
    expect(addDependency(AGENT, "@zed/last", "1.0.0-beta.1")).toBe(
      `${AGENT}  "@zed/last": 1.0.0-beta.1\n`,
    );
    // A name that's already there takes the new range.
    expect(addDependency(AGENT, "@tools/github", "^3.0.0")).toBe(AGENT.replace("~2.1.0", "^3.0.0"));
  });

  it("adds the first one to an agent's template, and to a bundle's empty map", () => {
    const agent = addDependency(template("agent"), "@a/skill", "^1.0.0");
    expect(agent).toBe(`${template("agent")}dependencies:\n  "@a/skill": ^1.0.0\n`);
    const bundle = addDependency(template("bundle"), "@a/skill", "^1.0.0");
    expect(bundle).toBe(
      template("bundle").replace("dependencies: {}\n", 'dependencies:\n  "@a/skill": ^1.0.0\n'),
    );
    expect(addDependency("name: [", "@a/skill", "^1.0.0")).toBe("name: [");
  });

  it("changes a range in place, keeping the comments around it", () => {
    expect(setDependencyRange(AGENT, "@platform/secure-coding", "^2.0.0")).toBe(
      AGENT.replace("^1.0.0 # pinned", "^2.0.0 # pinned"),
    );
    // Emptied while it's typed: the line stays, for the checks to refuse.
    expect(readDependencies(setDependencyRange(AGENT, "@tools/github", ""))).toEqual({
      "@platform/secure-coding": "^1.0.0",
      "@tools/github": "",
    });
  });

  it("removes one; the last takes the key with it, except in a bundle", () => {
    const one = removeDependency(AGENT, "@tools/github", "agent");
    expect(one).toBe(AGENT.replace('  "@tools/github": ~2.1.0\n', ""));
    const none = removeDependency(one, "@platform/secure-coding", "agent");
    expect(readManifest(none)).not.toHaveProperty("dependencies");
    expect(readDependencies(none)).toEqual({});
    const bundle = addDependency(template("bundle"), "@a/skill", "^1.0.0");
    expect(removeDependency(bundle, "@a/skill", "bundle")).toBe(template("bundle"));
    // Removing what isn't there changes nothing.
    expect(removeDependency(AGENT, "@no/such", "agent")).toBe(AGENT);
  });

  it("round-trips with the form: each reads what the other wrote", () => {
    // The form replaces the whole map, in the order its rows are in.
    const form = writeField(template("agent"), ["dependencies"], {
      "@tools/github": "~2.1.0",
      "@platform/secure-coding": "^1.0.0",
    });
    expect(readDependencies(form)).toEqual({
      "@platform/secure-coding": "^1.0.0",
      "@tools/github": "~2.1.0",
    });
    const canvas = setDependencyRange(
      addDependency(removeDependency(form, "@tools/github", "agent"), "@a/skill", "^1.0.0"),
      "@platform/secure-coding",
      "^2.0.0",
    );
    expect(readManifest(canvas)?.dependencies).toEqual({
      "@a/skill": "^1.0.0",
      "@platform/secure-coding": "^2.0.0",
    });
    // Back through the form's path with what it read: the text doesn't change.
    expect(writeField(canvas, ["dependencies"], readManifest(canvas)?.dependencies)).toBe(canvas);
    // And emptying the map in the form is removing the last one on the canvas.
    expect(writeField(form, ["dependencies"], {})).toBe(
      removeDependency(
        removeDependency(form, "@tools/github", "agent"),
        "@platform/secure-coding",
        "agent",
      ),
    );
  });

  it("starts a dependency on ^latest, or on a pre-release exactly", () => {
    expect(startingRange("1.4.2")).toBe("^1.4.2");
    expect(startingRange("1.0.0-beta.2")).toBe("1.0.0-beta.2");
  });
});

describe("the layout file", () => {
  it("is .ronne/layout.json, which reads what it writes, names in order", () => {
    expect(LAYOUT_PATH).toBe(".ronne/layout.json");
    const text = writeLayout({ "@b/b": { x: 10, y: -20 }, "@a/a": { x: 0, y: 300 } });
    expect(text).toBe(
      '{\n  "version": 1,\n  "nodes": {\n    "@a/a": {\n      "x": 0,\n      "y": 300\n    },\n    "@b/b": {\n      "x": 10,\n      "y": -20\n    }\n  }\n}\n',
    );
    expect(readLayout(text)).toEqual({ "@a/a": { x: 0, y: 300 }, "@b/b": { x: 10, y: -20 } });
  });

  it("ignores a file that is missing, broken or another version, and entries that aren't positions", () => {
    expect(readLayout(undefined)).toEqual({});
    expect(readLayout("")).toEqual({});
    expect(readLayout("{ not json")).toEqual({});
    expect(readLayout("null")).toEqual({});
    expect(readLayout('{"version":2,"nodes":{"@a/a":{"x":1,"y":2}}}')).toEqual({});
    expect(readLayout('{"version":1,"nodes":[]}')).toEqual({});
    expect(
      readLayout(
        '{"version":1,"nodes":{"@a/a":{"x":1,"y":2,"z":3},"@b/b":{"x":"1","y":2},"@c/c":null}}',
      ),
    ).toEqual({ "@a/a": { x: 1, y: 2 } });
  });

  it("places dependencies without a position on a ring, in name order from the top", () => {
    expect(placeNodes([], {})).toEqual({});
    expect(placeNodes(["@a/a"], {})).toEqual({ "@a/a": { x: 0, y: -190 } });
    const four = placeNodes(["@d/d", "@b/b", "@a/a", "@c/c"], {});
    expect(four).toEqual({
      "@a/a": { x: 0, y: -190 },
      "@b/b": { x: 290, y: 0 },
      "@c/c": { x: 0, y: 190 },
      "@d/d": { x: -290, y: 0 },
    });
    // The author's positions win; the others keep their place on the ring.
    expect(placeNodes(["@a/a", "@b/b", "@c/c", "@d/d"], { "@b/b": { x: 40, y: 50 } })).toEqual({
      ...four,
      "@b/b": { x: 40, y: 50 },
    });
  });

  it.each([2, 3, 5, 6, 9, 20, 60])("grows the ring so %i nodes don't overlap", (count) => {
    const names = Array.from({ length: count }, (_, i) => `@a/item-${String(i).padStart(2, "0")}`);
    const placed = Object.values(placeNodes(names, {}));
    // A node is 240 wide and about 160 tall, and its position is its centre.
    for (const [i, a] of placed.entries()) {
      for (const b of placed.slice(i + 1))
        expect(Math.abs(a.x - b.x) >= 240 || Math.abs(a.y - b.y) >= 160, `${i}`).toBe(true);
      // And clear of the draft's node in the centre.
      expect(Math.abs(a.x) >= 250 || Math.abs(a.y) >= 120).toBe(true);
    }
  });

  it("stores moves in whole pixels, and drops dependencies that are gone", () => {
    const layout = { "@a/a": { x: 1, y: 2 }, "@gone/item": { x: 9, y: 9 } };
    expect(moveNodes(layout, ["@a/a", "@b/b"], { "@b/b": { x: 10.4, y: -0.6 } })).toEqual({
      "@a/a": { x: 1, y: 2 },
      "@b/b": { x: 10, y: -1 },
    });
    // A name typed in the YAML can be anything.
    expect(placeNodes(["constructor"], {})).toEqual({ constructor: { x: 0, y: -190 } });
  });
});

describe("toGraph", () => {
  const graph = toGraph({
    itemName: "@platform/reviewer",
    type: "agent",
    dependencies: { "@tools/github": "~2.1.0", "@platform/secure-coding": "latest" },
    layout: { "@tools/github": { x: 400, y: 120 } },
    reports: {
      "@tools/github": {
        facts: {
          type: "mcp-server",
          version: "2.1.3",
          description: "GitHub's MCP server.",
          tools: ["Claude Code", "Codex"],
        },
        problems: [],
      },
      "@platform/secure-coding": {
        facts: null,
        problems: ["@platform/secure-coding isn't a published item."],
      },
    },
    issues: [
      {
        severity: "error",
        code: "range_invalid",
        message: "The version range for @platform/secure-coding isn't valid.",
        path: "/dependencies/@platform~1secure-coding",
      },
      { severity: "error", code: "description_empty", message: "Other.", path: "/description" },
    ],
  });

  it("puts the draft in the centre and joins each dependency to it, in name order", () => {
    expect(graph.nodes.map((node) => node.id)).toEqual([
      ITEM_NODE_ID,
      dependencyNodeId("@platform/secure-coding"),
      dependencyNodeId("@tools/github"),
    ]);
    expect(graph.nodes[0]).toEqual({
      id: ITEM_NODE_ID,
      type: "item",
      position: { x: 0, y: 0 },
      data: { name: "@platform/reviewer", type: "agent" },
    });
    expect(graph.edges).toEqual([
      {
        id: "item->dependency:@platform/secure-coding",
        source: ITEM_NODE_ID,
        target: "dependency:@platform/secure-coding",
      },
      {
        id: "item->dependency:@tools/github",
        source: ITEM_NODE_ID,
        target: "dependency:@tools/github",
      },
    ]);
  });

  it("gives each node its range, position, catalogue facts and problems", () => {
    expect(graph.nodes[1]).toMatchObject({
      type: "dependency",
      position: { x: 0, y: -190 },
      data: {
        name: "@platform/secure-coding",
        range: "latest",
        facts: null,
        problems: [
          "The version range for @platform/secure-coding isn't valid.",
          "@platform/secure-coding isn't a published item.",
        ],
      },
    });
    expect(graph.nodes[2]).toMatchObject({
      position: { x: 400, y: 120 },
      data: { range: "~2.1.0", facts: { type: "mcp-server", version: "2.1.3" }, problems: [] },
    });
  });

  it("draws a dependency before the registry has answered, and a draft with none", () => {
    const pending = toGraph({
      itemName: "@a/b",
      type: "bundle",
      dependencies: { "@a/skill": "^1.0.0" },
      layout: {},
    });
    expect(pending.nodes[1]?.data).toEqual({
      name: "@a/skill",
      range: "^1.0.0",
      facts: undefined,
      problems: [],
      status: null,
    });
    const empty = toGraph({ itemName: "@a/b", type: "bundle", dependencies: {}, layout: {} });
    expect(empty.nodes).toHaveLength(1);
    expect(empty.edges).toEqual([]);
  });

  it("is the same canvas for the same manifest, whatever moved", () => {
    const text = addDependency(template("agent"), "@a/skill", "^1.0.0");
    const before = toGraph({
      itemName: "@platform/reviewer",
      type: "agent",
      dependencies: readDependencies(text) ?? {},
      layout: {},
    });
    const layout = readLayout(
      writeLayout(moveNodes({}, ["@a/skill"], { "@a/skill": { x: 50, y: 60 } })),
    );
    const after = toGraph({
      itemName: "@platform/reviewer",
      type: "agent",
      dependencies: readDependencies(text) ?? {},
      layout,
    });
    expect(after.nodes[1]?.position).toEqual({ x: 50, y: 60 });
    expect(after.nodes.map((node) => node.data)).toEqual(before.nodes.map((node) => node.data));
  });
});
