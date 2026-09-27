import { describe, expect, it } from "vitest";
import { ITEM_TYPES, isItemType } from "./index.js";

describe("isItemType", () => {
  it("accepts every declared type", () => {
    for (const type of ITEM_TYPES) {
      expect(isItemType(type)).toBe(true);
    }
  });

  it("rejects unknown types", () => {
    expect(isItemType("plugin")).toBe(false);
  });
});
