import { describe, expect, it } from "vitest";
import type { ExportedItem, ExportPlan } from "./export.js";
import { releaseOrder, reportExportOrder, togetherOf } from "./export-command.js";
import { output } from "./output.js";
import { orderLine, togetherLine } from "./submit.js";

// The release-order hints after an export (056, 112): Submit takes an item's own drafts with it,
// and items that need each other are submitted and released together.
const plan = (items: { name: string; dependsOn: string[] }[]) =>
  ({ items, refused: [], findings: [] }) as unknown as ExportPlan;
const exported = (...names: string[]) => names.map((name) => ({ name }) as unknown as ExportedItem);

describe("the order hints (112)", () => {
  it("says Submit takes the item's own drafts with it", () => {
    const steps = releaseOrder(
      plan([
        { name: "@team/skill", dependsOn: [] },
        { name: "@team/agent", dependsOn: ["@team/skill"] },
      ]),
      exported("@team/skill", "@team/agent"),
    );
    expect(steps.map(orderLine)).toEqual([
      "rmk submit @team/agent takes @team/skill with it, all or none.",
    ]);
  });

  it("names items that need each other, each cycle once", () => {
    const cycle = plan([
      { name: "@team/a", dependsOn: ["@team/b"] },
      { name: "@team/b", dependsOn: ["@team/c"] },
      { name: "@team/c", dependsOn: ["@team/a"] },
      { name: "@team/d", dependsOn: ["@team/a"] },
    ]);
    const together = togetherOf(cycle, exported("@team/a", "@team/b", "@team/c", "@team/d"));
    expect(together.map(togetherLine)).toEqual([
      "@team/a, @team/b and @team/c need each other: they're submitted and released together.",
    ]);
    // Only what was exported counts.
    expect(togetherOf(cycle, exported("@team/a", "@team/d"))).toEqual([]);
  });

  it("rmk export says both after the upload, and in its JSON", () => {
    const out = output(false);
    reportExportOrder(
      out,
      plan([
        { name: "@team/a", dependsOn: ["@team/b"] },
        { name: "@team/b", dependsOn: ["@team/a"] },
      ]),
      exported("@team/a", "@team/b"),
    );
    expect(out.lines).toEqual([
      "rmk submit @team/a takes @team/b with it, all or none.",
      "rmk submit @team/b takes @team/a with it, all or none.",
      "@team/a and @team/b need each other: they're submitted and released together.",
    ]);
    expect(out.data.together).toEqual([["@team/a", "@team/b"]]);
  });
});
