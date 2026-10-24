import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { inLocale } from "@/test/intl";

/**
 * What the canvas hands React Flow for screen readers (131): each edge's label and role word, and
 * each node's role word, in the person's language. React Flow draws edges only once it has measured
 * the nodes, so the server's markup can't show them: the props are read where they're passed.
 */
type FlowProps = ComponentProps<typeof import("@xyflow/react").ReactFlow>;
const passed: FlowProps[] = [];
vi.mock("@xyflow/react", async (original) => {
  const real = await original<typeof import("@xyflow/react")>();
  const ReactFlow = (props: FlowProps) => {
    passed.push(props);
    return <real.ReactFlow {...props} />;
  };
  return { ...real, ReactFlow };
});

const { ComposerCanvas } = await import("./ComposerCanvas");
const { ComposerContext } = await import("./context");
const { toGraph } = await import("./graph");

const graph = toGraph({
  itemName: "@team/reviewer",
  type: "agent",
  dependencies: { "@team/git": "^1.0.0", "@team/{x}": "" },
  layout: {},
  reports: {
    "@team/git": {
      facts: { type: "mcp-server", version: "1.4.0", description: "", tools: [] },
      problems: [],
    },
    "@team/{x}": { facts: null, problems: [] },
  },
  issues: [],
});

const handed = (locale: Locale) => {
  passed.length = 0;
  inLocale(locale, () =>
    renderToStaticMarkup(
      <ComposerContext value={{ readOnly: true, setRange: () => {}, remove: () => {} }}>
        <ComposerCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          readOnly
          settled
          onMove={() => {}}
          onRemove={() => {}}
        />
      </ComposerContext>,
    ),
  );
  const props = passed.at(-1);
  if (!props) throw new Error("React Flow wasn't rendered");
  return {
    edges: (props.edges ?? []).map((edge) => [edge.ariaLabel, edge.domAttributes]),
    nodes: (props.nodes ?? []).map((node) => node.domAttributes),
  };
};

describe("the canvas's edges and roles, as React Flow gets them", () => {
  it("en: a sentence per edge, React Flow's role words as before", () => {
    expect(handed("en")).toEqual({
      edges: [
        ["@team/reviewer depends on @team/git", { "aria-roledescription": "edge" }],
        ["@team/reviewer depends on @team/{x}", { "aria-roledescription": "edge" }],
      ],
      nodes: Array(3).fill({ "aria-roledescription": "node" }),
    });
  });

  it("pt and fr: the sentence and the role words in the language", () => {
    expect(handed("pt")).toEqual({
      edges: [
        ["@team/reviewer depende de @team/git", { "aria-roledescription": "ligação" }],
        ["@team/reviewer depende de @team/{x}", { "aria-roledescription": "ligação" }],
      ],
      nodes: Array(3).fill({ "aria-roledescription": "nó" }),
    });
    expect(handed("fr").edges[0]).toEqual([
      "@team/reviewer dépend de @team/git",
      { "aria-roledescription": "lien" },
    ]);
    expect(handed("fr").nodes[0]).toEqual({ "aria-roledescription": "nœud" });
  });
});
