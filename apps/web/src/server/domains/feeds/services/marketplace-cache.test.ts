import { describe, expect, it } from "vitest";
import { createMarketplaceCache, marketplaceSlot } from "./marketplace-cache";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("the marketplace cache's slots (079, 093)", () => {
  it("keeps one marketplace per tool and visibility key, sharing nothing", () => {
    const cache = createMarketplaceCache();
    const everyone = marketplaceSlot("claude-code", "");
    const acme = marketplaceSlot("claude-code", "acme");
    expect(everyone).toBe("claude-code");
    cache.set(acme, "r1", bytes("acme's"));
    expect(cache.get(everyone, "r1")).toBeNull();
    cache.set(everyone, "r1", bytes("everyone's"));
    expect(new TextDecoder().decode(cache.get(acme, "r1") ?? undefined)).toBe("acme's");
    expect(new TextDecoder().decode(cache.get(everyone, "r1") ?? undefined)).toBe("everyone's");
    expect(cache.get(marketplaceSlot("codex", "acme"), "r1")).toBeNull();
  });

  it("drops the least recently used slot past its limit", () => {
    const cache = createMarketplaceCache(2);
    cache.set("a", "k", bytes("a"));
    cache.set("b", "k", bytes("b"));
    expect(cache.get("a", "k")).not.toBeNull();
    cache.set("c", "k", bytes("c"));
    expect(cache.get("b", "k")).toBeNull();
    expect(cache.get("a", "k")).not.toBeNull();
    expect(cache.get("c", "k")).not.toBeNull();
  });

  it("runs one background build per slot", async () => {
    const cache = createMarketplaceCache();
    let runs = 0;
    const work = async () => {
      runs += 1;
    };
    await Promise.all([cache.warm("claude-code", work), cache.warm("claude-code", work)]);
    await cache.warm("claude-code/acme", work);
    expect(runs).toBe(2);
  });
});
