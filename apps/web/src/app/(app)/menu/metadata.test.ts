import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { generateMetadata } from "./metadata";

describe("the Menu page's title (129)", () => {
  it("is in the person's language, after the product's name is kept as it is", async () => {
    expect(await inLocale("en", generateMetadata)).toEqual({
      title: "Menu · Ronne AI Marketplace",
    });
    expect(await inLocale("pt", generateMetadata)).toEqual({
      title: "Menu · Ronne AI Marketplace",
    });
    expect(await inLocale("fr", generateMetadata)).toEqual({
      title: "Menu · Ronne AI Marketplace",
    });
  });
});
