import { describe, expect, it } from "vitest";
import { normalizePublicUrl } from "./public-url";

describe("normalizePublicUrl", () => {
  it("trims spaces and trailing slashes", () => {
    expect(normalizePublicUrl("  https://ronne.example//  ")).toBe("https://ronne.example");
    expect(normalizePublicUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("refuses anything that isn't an http or https address", () => {
    for (const value of ["", "ronne.example", "ftp://ronne.example", "https://", "https:// x"])
      expect(normalizePublicUrl(value)).toBeUndefined();
  });
});
