import { describe, expect, it } from "vitest";
import { MIN_NODE, nodeTooOld } from "./node-version.js";

describe("the Node.js version check (082)", () => {
  it("needs 22.12 or later, like engines", () => {
    expect(MIN_NODE).toBe("22.12.0");
    for (const v of ["20.18.0", "22.0.0", "22.11.9"]) expect(nodeTooOld(v)).toBe(true);
    for (const v of ["22.12.0", "22.23.3", "24.0.0", "26.1.0"]) expect(nodeTooOld(v)).toBe(false);
  });
});
