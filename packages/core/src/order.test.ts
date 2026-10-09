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
    ).toEqual({ order: ["@t/base", "@t/skill", "@t/agent", "@t/other"], groups: [] });
  });

  it("puts items that need each other next to each other, as one group, after what they need (112)", () => {
    expect(
      dependenciesFirst([
        { name: "@t/agent", dependsOn: ["@t/skill"] },
        { name: "@t/skill", dependsOn: ["@t/agent", "@t/base"] },
        { name: "@t/base", dependsOn: [] },
      ]),
    ).toEqual({ order: ["@t/base", "@t/agent", "@t/skill"], groups: [["@t/agent", "@t/skill"]] });
  });

  it("orders a cycle of three, and two cycles joined by a plain dependency (112)", () => {
    expect(
      dependenciesFirst([
        { name: "@t/a", dependsOn: ["@t/b"] },
        { name: "@t/b", dependsOn: ["@t/c"] },
        { name: "@t/c", dependsOn: ["@t/a", "@t/d"] },
        { name: "@t/d", dependsOn: ["@t/e"] },
        { name: "@t/e", dependsOn: ["@t/d"] },
        { name: "@t/f", dependsOn: ["@t/a"] },
      ]),
    ).toEqual({
      order: ["@t/d", "@t/e", "@t/a", "@t/b", "@t/c", "@t/f"],
      groups: [
        ["@t/d", "@t/e"],
        ["@t/a", "@t/b", "@t/c"],
      ],
    });
  });

  it("orders a chain and a ring of 20,000 items without running out of stack (112)", () => {
    const n = 20_000;
    const name = (i: number) => `@t/i${i}`;
    const chain = dependenciesFirst(
      Array.from({ length: n }, (_, i) => ({
        name: name(i),
        dependsOn: i + 1 < n ? [name(i + 1)] : [],
      })),
    );
    expect(chain.order).toHaveLength(n);
    expect(chain.order[0]).toBe(name(n - 1));
    expect(chain.groups).toEqual([]);
    const ring = dependenciesFirst(
      Array.from({ length: n }, (_, i) => ({ name: name(i), dependsOn: [name((i + 1) % n)] })),
    );
    expect(ring.order).toEqual(Array.from({ length: n }, (_, i) => name(i)));
    expect(ring.groups).toHaveLength(1);
  });
});
