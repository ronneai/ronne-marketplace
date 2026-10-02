import { ITEM_TYPES } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TypeBadge } from "./TypeBadge";

describe("TypeBadge (054)", () => {
  it.each(ITEM_TYPES)("shows %s in its own colour tokens", (type) => {
    const html = renderToStaticMarkup(<TypeBadge type={type} />);
    expect(html).toContain(`text-(--type-${type})`);
    expect(html).toContain(`bg-(--type-${type}-subtle)`);
    expect(html).toContain(`border-(--type-${type}-border)`);
    expect(html).toContain(`>${type}<`);
    // Not the muted tone's colours, which would win over the type's.
    expect(html).not.toContain("bg-tint");
  });

  it("shows a string that isn't a type in the muted badge", () => {
    const html = renderToStaticMarkup(<TypeBadge type="widget" />);
    expect(html).toContain("bg-tint");
    expect(html).not.toContain("--type-");
  });
});
