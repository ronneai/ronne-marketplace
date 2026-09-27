import { describe, expect, it } from "vitest";
import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    [undefined, "system"],
    ["", "system"],
    ["purple", "system"],
    ["DARK", "system"],
  ])("%j → %s", (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });
});
