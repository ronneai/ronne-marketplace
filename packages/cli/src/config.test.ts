import { describe, expect, it } from "vitest";
import { normalizeRegistry, tokenFor, type UserConfig } from "./config.js";
import type { Io } from "./io.js";

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

describe("tokenFor (security audit ITEM-4)", () => {
  const io = (env: Record<string, string>) => ({ env }) as unknown as Io;
  const config = (over: Partial<UserConfig> = {}): UserConfig =>
    ({ version: 1, registries: {}, ...over }) as UserConfig;
  it("gives RMK_TOKEN only to a registry the person chose", () => {
    const env = { RMK_TOKEN: "rmk_env" };
    expect(tokenFor(io(env), config(), "https://evil.example")).toBeNull();
    expect(
      tokenFor(io({ ...env, RMK_REGISTRY: "https://r.example/" }), config(), "https://r.example"),
    ).toBe("rmk_env");
    expect(
      tokenFor(io(env), config({ defaultRegistry: "https://r.example" }), "https://r.example"),
    ).toBe("rmk_env");
    const loggedIn = config({
      registries: { "https://r.example": { token: "rmk_saved" } },
    } as Partial<UserConfig>);
    expect(tokenFor(io(env), loggedIn, "https://r.example")).toBe("rmk_env");
    expect(tokenFor(io({}), loggedIn, "https://r.example")).toBe("rmk_saved");
  });
});
