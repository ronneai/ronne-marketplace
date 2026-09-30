import { describe, expect, it } from "vitest";
import { withDependencies } from "./dependencies.js";

describe("withDependencies", () => {
  it("sets dependencies and keeps the rest of the text, comments included", () => {
    expect(
      withDependencies('# Mine.\nname: "@team/a"\ntype: agent\n', {
        "@team/secure": "^1.0.0",
        "@team/gh": "^1.2.0",
      }),
    ).toBe(
      '# Mine.\nname: "@team/a"\ntype: agent\ndependencies:\n  "@team/secure": ^1.0.0\n  "@team/gh": ^1.2.0\n',
    );
  });

  it("changes nothing without dependencies", () => {
    expect(withDependencies("name: x\n", {})).toBe("name: x\n");
  });
});
