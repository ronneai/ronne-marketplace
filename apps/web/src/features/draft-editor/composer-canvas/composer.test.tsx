import type { ItemType } from "@ronneai/core";
import type { DragEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ComposerCanvas } from "@/components/dependency-canvas/ComposerCanvas";
import { ComposerContext } from "@/components/dependency-canvas/context";
import { DRAG_TYPE, readDragged, startDrag } from "@/components/dependency-canvas/drag";
import { toGraph } from "@/components/dependency-canvas/graph";
import { LAYOUT_PATH } from "@/components/dependency-canvas/layout";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { type FilesAction, type FilesState, filesReducer, isDirty } from "../files";
import type { EditorFile } from "../types";
import { composerChanges } from "./changes";
import { DependencyPanel } from "./DependencyPanel";
import { hasCanvas, startingRange } from "./model";
import type { PickerEntry } from "./types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({}));
vi.mock("./actions", () => ({
  dependencyReportsAction: vi.fn(),
  searchDependenciesAction: vi.fn(),
}));

const { DraftEditor } = await import("../DraftEditor");
const { ComposerView } = await import("./ComposerView");
const { CataloguePicker, PickerResults } = await import("./CataloguePicker");

const file = (path: string, content: string): EditorFile => ({
  path,
  encoding: "utf8",
  content,
  size: content.length,
  executable: false,
  loadedAt: "2026-09-27T10:00:00.000Z",
  dirty: false,
});

const templateFiles = (type: ItemType) =>
  draftTemplate(type, "@platform/reviewer").map(({ path, content }) => file(path, content));

const editor = (type: ItemType) =>
  renderToStaticMarkup(
    <DraftEditor
      draft={{
        id: "d",
        scope: "platform",
        name: "reviewer",
        type,
        status: "draft",
        submittedAt: null,
        mine: true,
        readOnly: false,
        canSubmit: true,
        canWithdraw: true,
        versionsHref: null,
        proposal: null,
        files: templateFiles(type),
      }}
    />,
  );

describe("the view switch", () => {
  it("offers Form, YAML and Canvas for agents and bundles, and no canvas for other types", () => {
    for (const type of ["agent", "bundle"] as const) {
      expect(hasCanvas(type)).toBe(true);
      const html = editor(type);
      expect(html).toMatch(/aria-pressed="true"[^>]*>Form</);
      expect(html).toMatch(/aria-pressed="false"[^>]*>YAML</);
      expect(html).toMatch(/aria-pressed="false"[^>]*>Canvas</);
    }
    // A skill or a command may only depend on MCP servers: the form is enough.
    for (const type of ["skill", "command", "rule", "mcp-server"] as const) {
      expect(hasCanvas(type)).toBe(false);
      const html = editor(type);
      expect(html).toContain(">YAML<");
      expect(html).not.toContain(">Canvas<");
    }
  });
});

const graph = toGraph({
  itemName: "@platform/reviewer",
  type: "agent",
  dependencies: {
    "@platform/secure-coding": "^1.0.0",
    "@team/other-agent": "next",
    "@tools/github": "~2.1.0",
  },
  layout: { "@tools/github": { x: 400, y: 120 } },
  reports: {
    "@platform/secure-coding": {
      facts: {
        type: "skill",
        version: "1.4.0",
        description: "Rules for writing secure code.",
        tools: ["Claude Code", "Codex", "Cursor"],
      },
      problems: [],
    },
    "@team/other-agent": {
      facts: null,
      problems: ["@team/other-agent isn't a published item."],
    },
  },
  issues: [
    {
      severity: "error",
      code: "range_invalid",
      message: "The version range for @team/other-agent isn't valid.",
      path: "/dependencies/@team~1other-agent",
    },
  ],
});

const within = (readOnly: boolean, children: ReactNode) =>
  renderToStaticMarkup(
    <ComposerContext value={{ readOnly, setRange: () => {}, remove: () => {} }}>
      {children}
    </ComposerContext>,
  );

const canvas = (readOnly: boolean) =>
  within(
    readOnly,
    <ComposerCanvas
      nodes={graph.nodes}
      edges={graph.edges}
      readOnly={readOnly}
      settled
      onMove={() => {}}
      onRemove={() => {}}
    />,
  );

describe("the canvas", () => {
  it("draws the draft and a node for each dependency, in name order", () => {
    const html = canvas(false);
    const order = [
      "@platform/reviewer, this agent",
      "@platform/secure-coding, skill, range ^1.0.0",
      "@team/other-agent, dependency, range next",
      "@tools/github, dependency, range ~2.1.0",
    ].map((label) => html.indexOf(`aria-label="${label}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Zoom in");
    expect(html).toContain("Fit to view");
  });

  it("shows each dependency's catalogue facts, range and problems in its node", () => {
    const html = canvas(false);
    expect(html).toContain("Rules for writing secure code.");
    expect(html).toContain(">v1.4.0<");
    expect(html).toContain("works in Claude Code, Codex, Cursor");
    expect(html).toMatch(
      /<input[^>]*aria-label="Range of @platform\/secure-coding"[^>]*value="\^1\.0\.0"/,
    );
    // Not in the catalogue, with 011's and 013's problems; a dist-tag isn't a range.
    expect(html).toContain(">not published<");
    expect(html).toMatch(/<input[^>]*aria-label="Range of @team\/other-agent"[^>]*value="next"/);
    expect(html).toContain("The version range for @team/other-agent isn&#x27;t valid.");
    expect(html).toContain("@team/other-agent isn&#x27;t a published item.");
    // The registry hasn't answered for this one yet.
    expect(html).toContain("Checking the catalogue…");
    for (const name of ["@platform/secure-coding", "@team/other-agent", "@tools/github"])
      expect(html).toContain(`aria-label="Remove ${name}"`);
    expect(html).not.toContain('aria-label="Remove @platform/reviewer"');
  });

  it("is read-only once submitted: ranges can't be typed and nothing can be removed or moved", () => {
    const html = canvas(true);
    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(3);
    expect(html).not.toContain('aria-label="Remove');
    // The draft's node never moves; read-only, nothing does.
    expect(canvas(false).match(/react-flow__node-dependency[^"]*draggable/g)).toHaveLength(3);
    expect(canvas(false)).not.toMatch(/react-flow__node-item[^"]*draggable/);
    expect(html).not.toMatch(/react-flow__node-[a-z]+[^"]*draggable/);
  });

  it("links each dependency to its page where the canvas is given where that is (044)", () => {
    const html = renderToStaticMarkup(
      <ComposerContext
        value={{
          readOnly: true,
          setRange: () => {},
          remove: () => {},
          hrefOf: (name) => `/items/${name.slice(1)}`,
        }}
      >
        <ComposerCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          readOnly
          settled
          onMove={() => {}}
          onRemove={() => {}}
        />
      </ComposerContext>,
    );
    expect(html).toContain('href="/items/tools/github"');
    expect(html).toContain('href="/items/team/other-agent"');
    expect(canvas(true)).not.toContain('href="/items/');
  });

  it("lists every dependency under the canvas, with the same fields, for the keyboard", () => {
    const panel = (readOnly: boolean) =>
      within(
        readOnly,
        <DependencyPanel type="agent" nodes={graph.nodes} failed={false} onShow={() => {}} />,
      );
    const html = panel(false);
    expect(html).toContain("Dependencies");
    // The helper says what the canvas writes, and leads to the Documentation.
    expect(html).toContain("What does the canvas change?");
    expect(html).toContain("Only dependencies in ronne.yaml.");
    expect(html).toContain('href="/docs/items#canvas"');
    expect(html).toContain(">(3)<");
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html.match(/aria-label="Range of /g)).toHaveLength(3);
    expect(html.match(/aria-label="Remove /g)).toHaveLength(3);
    expect(html).toContain("@team/other-agent isn&#x27;t a published item.");
    expect(panel(true)).not.toContain('aria-label="Remove');
    const empty = within(
      false,
      <DependencyPanel type="bundle" nodes={graph.nodes.slice(0, 1)} failed onShow={() => {}} />,
    );
    expect(empty).toContain("None yet. Add one from the catalogue, or drag it onto the canvas.");
    expect(empty).toContain("The items this bundle installs.");
    expect(empty).toContain("The catalogue couldn&#x27;t be reached.");
  });

  it("points to the YAML view while the YAML doesn't parse", () => {
    const html = renderToStaticMarkup(
      <ComposerView
        itemName="@platform/reviewer"
        type="agent"
        manifest="name: ["
        layout={undefined}
        issues={[]}
        readOnly={false}
        onChange={() => {}}
        onShowYaml={() => {}}
      />,
    );
    expect(html).toContain("The canvas needs valid YAML.");
    expect(html).toContain("Open the YAML");
    expect(html).not.toContain("react-flow");
  });
});

const view = (readOnly: boolean, type: "agent" | "bundle" = "agent") =>
  renderToStaticMarkup(
    <ComposerView
      itemName="@platform/reviewer"
      type={type}
      manifest={'name: "@platform/reviewer"\ndependencies:\n  "@tools/github": ^2.1.0\n'}
      layout={undefined}
      issues={[]}
      readOnly={readOnly}
      onChange={() => {}}
      onShowYaml={() => {}}
    />,
  );

const github: PickerEntry = {
  name: "@tools/github",
  type: "mcp-server",
  version: "2.1.3",
  description: "GitHub's MCP server.",
  tools: ["Claude Code", "Codex"],
};
const upcoming: PickerEntry = {
  name: "@platform/upcoming",
  type: "skill",
  version: "1.0.0-beta.2",
  description: "",
  tools: [],
};

describe("the picker", () => {
  it("is under the canvas with the list, and gone once the draft is submitted", () => {
    const html = view(false);
    expect(html).toContain("Add from the catalogue");
    expect(html).toContain('aria-label="Search the catalogue"');
    expect(html).toContain('aria-label="Remove @tools/github"');
    const submitted = view(true);
    expect(submitted).not.toContain("Add from the catalogue");
    expect(submitted).toMatch(/<input[^>]*aria-label="Range of @tools\/github"[^>]*disabled=""/);
  });

  it("offers only the types the draft may depend on", () => {
    const types = (html: string) =>
      [...html.matchAll(/<option value="([a-z-]+)"/g)].map((match) => match[1]);
    expect(types(view(false))).toEqual(["skill", "mcp-server", "hook", "rule", "command"]);
    expect(types(view(false, "bundle"))).toContain("agent");
    expect(types(view(false, "bundle"))).toHaveLength(11);
  });

  it("lists results to add or drag, and marks the ones already there", () => {
    const html = renderToStaticMarkup(
      <PickerResults
        entries={[github, upcoming]}
        added={new Set(["@tools/github"])}
        onAdd={() => {}}
      />,
    );
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("GitHub&#x27;s MCP server.");
    expect(html).toContain(">v2.1.3<");
    expect(html).toMatch(/<li draggable="false"[^>]*>.*@tools\/github.*>added</s);
    expect(html).not.toContain('aria-label="Add @tools/github"');
    expect(html).toMatch(/<li draggable="true"[^>]*>.*@platform\/upcoming/s);
    expect(html).toContain('aria-label="Add @platform/upcoming"');
  });

  it("says it's searching until the catalogue answers", () => {
    const html = renderToStaticMarkup(
      <CataloguePicker
        itemName="@platform/reviewer"
        type="agent"
        added={new Set()}
        onAdd={() => {}}
      />,
    );
    expect(html).toContain("Searching…");
    expect(html).toContain('aria-label="Search the catalogue"');
  });

  it("carries a result onto the canvas, and ignores anything else dropped there", () => {
    const data = new Map<string, string>();
    const event = {
      dataTransfer: {
        setData: (type: string, value: string) => data.set(type, value),
        getData: (type: string) => data.get(type) ?? "",
        effectAllowed: "",
      },
    } as unknown as DragEvent;
    expect(readDragged(event)).toBeNull();
    data.set(DRAG_TYPE, '{"name":1}');
    expect(readDragged(event)).toBeNull();
    startDrag(event, upcoming);
    expect(data.get("text/plain")).toBe("@platform/upcoming");
    expect(readDragged(event)).toEqual(upcoming);
  });
});

describe("edits on the canvas", () => {
  const start = (type: "agent" | "bundle" = "agent"): FilesState => ({
    files: templateFiles(type),
    removed: [],
  });
  const content = (state: FilesState, path: string) =>
    state.files.find((f) => f.path === path)?.content;
  /** One canvas edit, through the editor's reducer, as DraftEditor applies it. */
  const apply = (
    state: FilesState,
    type: ItemType,
    edit: (changes: ReturnType<typeof composerChanges>) => FilesAction[],
  ): FilesState =>
    edit(
      composerChanges(
        { manifest: content(state, "ronne.yaml") ?? "", layout: content(state, LAYOUT_PATH) },
        type,
      ),
    ).reduce(filesReducer, state);

  it("reach ronne.yaml as unsaved changes: adding, re-ranging and removing", () => {
    const template = content(start(), "ronne.yaml") ?? "";
    let state = apply(start(), "agent", (c) => c.add("@tools/github", "^2.1.0"));
    state = apply(state, "agent", (c) => c.add("@platform/secure-coding", "^1.0.0"));
    expect(content(state, "ronne.yaml")).toBe(
      `${template}dependencies:\n  "@platform/secure-coding": ^1.0.0\n  "@tools/github": ^2.1.0\n`,
    );
    expect(isDirty(state)).toBe(true);
    expect(state.files.find((f) => f.path === "ronne.yaml")?.dirty).toBe(true);
    // Only ronne.yaml changed: no layout file until something is moved.
    expect(content(state, LAYOUT_PATH)).toBeUndefined();

    state = apply(state, "agent", (c) => c.setRange("@tools/github", "~2.2.0"));
    expect(content(state, "ronne.yaml")).toContain('"@tools/github": ~2.2.0\n');
    state = apply(state, "agent", (c) => c.remove(["@platform/secure-coding", "@tools/github"]));
    expect(content(state, "ronne.yaml")).toBe(template);
  });

  it("keep a bundle's empty dependencies when the last one goes", () => {
    const template = content(start("bundle"), "ronne.yaml") ?? "";
    let state = apply(start("bundle"), "bundle", (c) => c.add("@a/skill", "^1.0.0"));
    expect(content(state, "ronne.yaml")).toContain('dependencies:\n  "@a/skill": ^1.0.0\n');
    state = apply(state, "bundle", (c) => c.remove(["@a/skill"]));
    expect(content(state, "ronne.yaml")).toBe(template);
  });

  it("store moves in .ronne/layout.json, and never touch ronne.yaml", () => {
    let state = apply(start(), "agent", (c) => c.add("@tools/github", "^2.1.0"));
    state = apply(state, "agent", (c) => c.add("@platform/secure-coding", "^1.0.0"));
    const manifest = content(state, "ronne.yaml");
    // As if saved: nothing is unsaved until the move.
    state = { ...state, files: state.files.map((f) => ({ ...f, dirty: false })) };
    state = apply(state, "agent", (c) => c.move({ "@tools/github": { x: 120.4, y: -80.6 } }));
    expect(content(state, "ronne.yaml")).toBe(manifest);
    expect(state.files.find((f) => f.path === "ronne.yaml")?.dirty).toBe(false);
    expect(JSON.parse(content(state, LAYOUT_PATH) ?? "")).toEqual({
      version: 1,
      nodes: { "@tools/github": { x: 120, y: -81 } },
    });
    expect(state.files.find((f) => f.path === LAYOUT_PATH)?.dirty).toBe(true);
    // A move to where it already is changes nothing.
    const again = apply(state, "agent", (c) => c.move({ "@tools/github": { x: 120, y: -81 } }));
    expect(again).toBe(state);
  });

  it("place a dropped dependency where it was dropped, and rewrite a broken layout file", () => {
    let state = apply(start(), "agent", (c) => c.add("@tools/github", "^2.1.0", { x: 310, y: 45 }));
    expect(content(state, "ronne.yaml")).toContain('"@tools/github": ^2.1.0');
    expect(JSON.parse(content(state, LAYOUT_PATH) ?? "").nodes).toEqual({
      "@tools/github": { x: 310, y: 45 },
    });
    state = filesReducer(state, {
      type: "edit",
      path: LAYOUT_PATH,
      content: '{"version":1,"nodes":{"@gone/item":{"x":1,"y":2}}, broken',
    });
    state = apply(state, "agent", (c) => c.move({ "@tools/github": { x: 0, y: 200 } }));
    expect(JSON.parse(content(state, LAYOUT_PATH) ?? "")).toEqual({
      version: 1,
      nodes: { "@tools/github": { x: 0, y: 200 } },
    });
  });

  it("add a picked item with its starting range: ^latest, or a pre-release exactly", () => {
    let state = apply(start(), "agent", (c) => c.add(github.name, startingRange(github.version)));
    state = apply(state, "agent", (c) =>
      c.add(upcoming.name, startingRange(upcoming.version), { x: -200.2, y: 140 }),
    );
    expect(content(state, "ronne.yaml")).toContain(
      'dependencies:\n  "@platform/upcoming": 1.0.0-beta.2\n  "@tools/github": ^2.1.3\n',
    );
    // Added with its button it goes on the ring; dropped, it stays where it was dropped.
    expect(JSON.parse(content(state, LAYOUT_PATH) ?? "").nodes).toEqual({
      "@platform/upcoming": { x: -200, y: 140 },
    });
  });

  it("do nothing while the YAML doesn't parse", () => {
    const changes = composerChanges({ manifest: "name: [", layout: undefined }, "agent");
    expect(changes.add("@a/skill", "^1.0.0", { x: 1, y: 2 })).toEqual([]);
    expect(changes.setRange("@a/skill", "^2.0.0")).toEqual([]);
    expect(changes.remove(["@a/skill"])).toEqual([]);
  });
});
