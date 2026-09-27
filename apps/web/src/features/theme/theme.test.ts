import { describe, expect, it } from "vitest";
import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "light"],
    [undefined, "light"],
    ["", "light"],
    ["purple", "light"],
    ["DARK", "light"],
  ])("%j → %s", (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });
});
