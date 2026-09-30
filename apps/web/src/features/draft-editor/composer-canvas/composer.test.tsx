import type { ItemType } from "@ronneai/core";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { type FilesAction, type FilesState, filesReducer, isDirty } from "../files";
import type { EditorFile } from "../types";
import { ComposerCanvas } from "./ComposerCanvas";
import { composerChanges } from "./changes";
import { ComposerContext } from "./context";
import { DependencyPanel } from "./DependencyPanel";
import { LAYOUT_PATH } from "./layout";
import { hasCanvas, toGraph } from "./model";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({}));
vi.mock("./actions", () => ({ dependencyReportsAction: vi.fn() }));

const { DraftEditor } = await import("../DraftEditor");
const { ComposerView } = await import("./ComposerView");

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

  it("lists every dependency under the canvas, with the same fields, for the keyboard", () => {
    const panel = (readOnly: boolean) =>
      within(
        readOnly,
        <DependencyPanel type="agent" nodes={graph.nodes} failed={false} onShow={() => {}} />,
      );
    const html = panel(false);
    expect(html).toContain("Dependencies");
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
    expect(empty).toContain("None yet.");
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

  it("do nothing while the YAML doesn't parse", () => {
    const changes = composerChanges({ manifest: "name: [", layout: undefined }, "agent");
    expect(changes.add("@a/skill", "^1.0.0", { x: 1, y: 2 })).toEqual([]);
    expect(changes.setRange("@a/skill", "^2.0.0")).toEqual([]);
    expect(changes.remove(["@a/skill"])).toEqual([]);
  });
});
