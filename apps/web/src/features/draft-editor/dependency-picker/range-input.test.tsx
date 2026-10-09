import type { SelectHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";

// The version list's own select, kept so a test can choose a row as the browser would.
const select = vi.hoisted(() => ({
  props: null as SelectHTMLAttributes<HTMLSelectElement> | null,
}));
vi.mock("@/components/ui/Field", async (original) => ({
  ...(await original<typeof import("@/components/ui/Field")>()),
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => {
    select.props = props;
    return null;
  },
}));
vi.mock("./actions", () => ({ findDependenciesAction: vi.fn() }));
const { RangeInput } = await import("./DependencyField");

const option: DependencyOption = {
  name: "@team/github",
  type: "mcp-server",
  status: "published",
  mine: false,
  description: null,
  versions: ["1.4.0", "1.3.0"],
  latest: "1.4.0",
};

/** Renders the row on `range`, chooses `value` in its list, and returns what was written. */
const choose = (range: string, value: string) => {
  const written: string[] = [];
  renderToStaticMarkup(
    <RangeInput
      name="@team/github"
      range={range}
      option={option}
      onChange={(next) => written.push(next)}
    />,
  );
  select.props?.onChange?.({ target: { value } } as never);
  return written;
};

describe("choosing a version (#143)", () => {
  it("writes the bare version for an exact pin, and the caret range for a compatible one", () => {
    expect(choose("^1.4.0", "1.3.0")).toEqual(["1.3.0"]);
    expect(choose("1.3.0", "^1.3.0")).toEqual(["^1.3.0"]);
  });
});
