import { describe, expect, it } from "vitest";
import { dependenciesFirst } from "./order.js";

describe("dependenciesFirst (055)", () => {
  it("puts each item after what it depends on in the batch, the rest in the order given", () => {
    expect(
      dependenciesFirst([
        { name: "@t/agent", dependsOn: ["@t/skill", "@t/elsewhere"] },
        { name: "@t/other", dependsOn: [] },
        { name: "@t/skill", dependsOn: ["@t/base"] },
        { name: "@t/base", dependsOn: [] },
      ]),
    ).toEqual({ order: ["@t/base", "@t/skill", "@t/agent", "@t/other"], cycle: null });
  });

  it("reports a cycle instead of an order", () => {
    expect(
      dependenciesFirst([
        { name: "@t/a", dependsOn: ["@t/b"] },
        { name: "@t/b", dependsOn: ["@t/a"] },
      ]),
    ).toEqual({ order: [], cycle: ["@t/a", "@t/b", "@t/a"] });
  });
});
