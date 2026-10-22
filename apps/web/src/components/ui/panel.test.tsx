import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Panel } from "./Panel";

describe("Panel's tone", () => {
  it("is the plain surface by default", () => {
    const html = renderToStaticMarkup(<Panel>x</Panel>);
    expect(html).toContain("bg-surface");
    expect(html).toContain("border-hairline");
    expect(html).not.toContain("bg-popover");
  });

  it("can be the teal of the inline helpers, and then not also the surface", () => {
    const html = renderToStaticMarkup(<Panel tone="teal">x</Panel>);
    expect(html).toContain("bg-popover");
    expect(html).toContain("border-popover-border");
    expect(html).not.toContain("bg-surface");
    expect(html).not.toContain("border-hairline");
  });
});
