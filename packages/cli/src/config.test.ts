import { describe, expect, it } from "vitest";
import { normalizeRegistry } from "./config.js";

describe("normalizeRegistry", () => {
  it("trims spaces and every trailing slash, and stays fast on many slashes", () => {
    expect(normalizeRegistry(" https://ronne.example/// ")).toBe("https://ronne.example");
    expect(normalizeRegistry("https://ronne.example/sub/")).toBe("https://ronne.example/sub");
    expect(normalizeRegistry("///")).toBe("");
    const started = performance.now();
    normalizeRegistry(`${"/".repeat(100_000)}x`);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
